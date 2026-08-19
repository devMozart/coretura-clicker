import { ACHIEVEMENTS, PRODUCERS, PRODUCER_BY_ID, UPGRADE_BY_ID, UPGRADES } from './content';
import type { Derived, ProducerDef, State, TimedEffect } from './types';

// Balancing knobs
export const COST_GROWTH = 1.15;
/** LoC → € conversion: every line shipped earns this much Funding. */
export const SHIP_RATE = 1;
/** Permanent global bonus per achievement ("code quality"). */
export const ACHIEVEMENT_BONUS = 0.01;
/** Tech Lead: output bonus to 'people' producers per owned. */
export const TECHLEAD_BONUS = 0.02;
/** DevOps Engineer: bonus to all production per owned. */
export const DEVOPS_BONUS = 0.01;
/** AI Assistant: own-output bonus per upgrade purchased anywhere. */
export const AI_PER_UPGRADE = 0.05;

export function newState(): State {
  return {
    loc: 0,
    funding: 0,
    clicks: 0,
    owned: {},
    upgrades: new Set(),
    achievements: new Set(),
    effects: [],
    muted: false,
    lastSaved: Date.now(),
  };
}

// --- Costs -----------------------------------------------------------------

export function costOf(p: ProducerDef, owned: number): number {
  return Math.ceil(p.baseCost * Math.pow(COST_GROWTH, owned));
}

export function bulkCost(p: ProducerDef, owned: number, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += costOf(p, owned + i);
  return sum;
}

// --- Timed effects (event buffs/debuffs) --------------------------------------

export function addEffect(s: State, effect: TimedEffect): void {
  s.effects = s.effects.filter((e) => e.id !== effect.id);
  s.effects.push(effect);
}

export function removeEffect(s: State, id: string): void {
  s.effects = s.effects.filter((e) => e.id !== id);
}

export function pruneEffects(s: State, now: number): void {
  s.effects = s.effects.filter((e) => e.until > now);
}

// --- Derived values ---------------------------------------------------------
// Everything is recomputed from scratch each time — no incremental multiplier
// state, so effects can never double-apply.

export function derive(s: State, now = Date.now()): Derived {
  let clickMult = 1;
  let globalMult = 1;
  let clickCpsPercent = 0;
  const producerMult: Record<string, number> = {};
  const cpsOverride: Record<string, number> = {};
  const synergies: { producerId: string; per: string; percent: number }[] = [];

  for (const id of s.upgrades) {
    const u = UPGRADE_BY_ID[id];
    if (!u) continue;
    const e = u.effect;
    switch (e.type) {
      case 'click':
        clickMult *= e.mult;
        break;
      case 'global':
        globalMult *= e.mult;
        break;
      case 'producer':
        producerMult[e.producerId] = (producerMult[e.producerId] ?? 1) * e.mult;
        break;
      case 'clickCpsPercent':
        clickCpsPercent += e.percent / 100;
        break;
      case 'synergy':
        synergies.push(e);
        break;
      case 'override':
        cpsOverride[e.producerId] = e.cps;
        break;
    }
  }

  globalMult *= 1 + ACHIEVEMENT_BONUS * s.achievements.size;

  // Producer specials
  const peopleMult = 1 + TECHLEAD_BONUS * (s.owned['techlead'] ?? 0);
  const devopsMult = 1 + DEVOPS_BONUS * (s.owned['devops'] ?? 0);
  const aiMult = 1 + AI_PER_UPGRADE * s.upgrades.size;

  // Active timed effects
  let prodEffMult = 1;
  let clickEffMult = 1;
  let peopleEffMult = 1;
  const producerEffMult: Record<string, number> = {};
  for (const e of s.effects) {
    if (e.until <= now) continue;
    switch (e.kind) {
      case 'production':
        prodEffMult *= e.mult;
        break;
      case 'click':
        clickEffMult *= e.mult;
        break;
      case 'people':
        peopleEffMult *= e.mult;
        break;
      case 'producer':
        if (e.producerId) {
          producerEffMult[e.producerId] = (producerEffMult[e.producerId] ?? 1) * e.mult;
        }
        break;
    }
  }

  let continuous = 0;
  let burst = 0;
  for (const p of PRODUCERS) {
    const count = s.owned[p.id] ?? 0;
    if (count === 0) continue;
    const cps = cpsOverride[p.id] ?? p.baseCps;
    let mult = producerMult[p.id] ?? 1;
    for (const syn of synergies) {
      if (syn.producerId === p.id) mult *= 1 + (syn.percent / 100) * (s.owned[syn.per] ?? 0);
    }
    if (p.kind === 'people') mult *= peopleMult * peopleEffMult;
    if (p.special === 'ai') mult *= aiMult;
    mult *= producerEffMult[p.id] ?? 1;
    const output = count * cps * mult;
    if (p.special === 'burst') burst += output;
    else continuous += output;
  }

  const overall = globalMult * devopsMult * prodEffMult;
  // Meetings can drag you to zero, but the score never goes backwards.
  const continuousPerSec = Math.max(0, continuous * overall);
  const burstPerSec = Math.max(0, burst * overall);

  const locPerSec = continuousPerSec + burstPerSec;
  const clickValue = clickMult * globalMult * clickEffMult + clickCpsPercent * locPerSec;

  return { locPerSec, continuousPerSec, burstPerSec, clickValue, globalMult };
}

// --- Mutations ---------------------------------------------------------------

/** Code written from any source: adds to the all-time score AND ships into Funding. */
export function earn(s: State, loc: number): void {
  s.loc += loc;
  s.funding += loc * SHIP_RATE;
}

export function click(s: State, d: Derived): number {
  s.clicks++;
  earn(s, d.clickValue);
  return d.clickValue;
}

export function tick(s: State, d: Derived, dtSeconds: number): void {
  if (d.continuousPerSec > 0) earn(s, d.continuousPerSec * dtSeconds);
}

export function buyProducer(s: State, id: string, count: number): boolean {
  const p = PRODUCER_BY_ID[id];
  if (!p) return false;
  const owned = s.owned[id] ?? 0;
  const cost = bulkCost(p, owned, count);
  if (s.funding < cost) return false;
  s.funding -= cost;
  s.owned[id] = owned + count;
  return true;
}

export function buyUpgrade(s: State, id: string): boolean {
  const u = UPGRADE_BY_ID[id];
  if (!u || s.upgrades.has(id)) return false;
  if (s.funding < u.cost || !u.unlocked(s)) return false;
  s.funding -= u.cost;
  s.upgrades.add(id);
  return true;
}

export function visibleUpgrades(s: State) {
  return UPGRADES.filter((u) => !s.upgrades.has(u.id) && u.unlocked(s));
}

/** Returns newly earned achievements (already added to state). */
export function checkAchievements(s: State, d: Derived): string[] {
  const earned: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!s.achievements.has(a.id) && a.check(s, d)) {
      s.achievements.add(a.id);
      earned.push(a.id);
    }
  }
  return earned;
}

export function grantAchievement(s: State, id: string): boolean {
  if (s.achievements.has(id)) return false;
  s.achievements.add(id);
  return true;
}

// --- Event payout helper -------------------------------------------------------

/** N seconds' worth of production, with a floor so early-game events still feel good. */
export function productionPayout(d: Derived, seconds: number, floor = 50): number {
  return Math.max(floor, d.locPerSec * seconds);
}
