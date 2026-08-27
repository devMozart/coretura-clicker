// Random events: lucky pickups, debuffs to click away, and click challenges.
// One pickup floats onto the stage every 40–80s and lingers a while.

import { addEffect, derive, earn, grantAchievement, productionPayout, removeEffect } from './game';
import { sound } from './fx';
import type { State } from './types';

const MIN_INTERVAL = 40_000;
const MAX_INTERVAL = 80_000;
/** Clearance from the stage edges, with room for the bob animation. */
const PICKUP_MARGIN = 12;
/** Floor on the shrink, so a pickup stays an easy target to the last click. */
export const PICKUP_MIN_SCALE = 0.7;

interface Box {
  width: number;
  height: number;
}

/**
 * How far a shrinking pickup has closed up, tracking its counter: full size
 * untouched, the floor on the click that resolves it. Tying it to progress is
 * the point — shrinking towards nothing in particular reads as a stuck.
 */
export function pickupScale(clicks: number, required: number): number {
  if (!Number.isFinite(required) || required <= 0) return 1;
  const progress = Math.min(Math.max(clicks / required, 0), 1);
  return 1 - (1 - PICKUP_MIN_SCALE) * progress;
}

/** Desired 0–1 spot in stage pixels, clamped so the whole pickup stays on stage. */
export function pickupSpot(
  stage: Box,
  pickup: Box,
  frac: { x: number; y: number },
): { x: number; y: number } {
  const maxX = Math.max(PICKUP_MARGIN, stage.width - pickup.width - PICKUP_MARGIN);
  const maxY = Math.max(PICKUP_MARGIN, stage.height - pickup.height - PICKUP_MARGIN);
  return {
    x: Math.min(Math.max(PICKUP_MARGIN, frac.x * stage.width), maxX),
    y: Math.min(Math.max(PICKUP_MARGIN, frac.y * stage.height), maxY),
  };
}

export interface EventCallbacks {
  toast: (icon: string, title: string, body: string, cls?: string) => void;
  achievementEarned: (id: string) => void;
  fmt: (n: number) => string;
}

interface EventCtx {
  state: State;
  cb: EventCallbacks;
  now: number;
}

interface EventDef {
  id: string;
  label: string;
  icon: string;
  /** visual family: good = green, bad = pink, challenge = amber */
  cls: 'good' | 'bad' | 'challenge';
  weight: number;
  linger: number;
  /** clicks needed to resolve (default 1) */
  clicksRequired?: number;
  /** closes up as its counter fills — the Critical Hotfix's own tell */
  shrinks?: boolean;
  /** fires when the pickup appears (AI Outage starts hurting immediately) */
  onSpawn?: (ctx: EventCtx) => void;
  /** fires on every click for rapid-click events */
  onClickEach?: (ctx: EventCtx, clickCount: number) => void;
  /** fires when clicksRequired is reached */
  onResolve?: (ctx: EventCtx) => void;
  /** fires if the pickup times out unresolved */
  onExpire?: (ctx: EventCtx) => void;
}

const lucky = (ctx: EventCtx) => {
  if (grantAchievement(ctx.state, 'shipit')) ctx.cb.achievementEarned('shipit');
};

// Each event's metadata stays on one line so onResolve is what you read.
// prettier-ignore
export const EVENT_TYPES: EventDef[] = [
  {
    id: 'pr_approved', label: 'PR Approved', icon: '🚀', cls: 'good', weight: 20, linger: 13_000,
    onResolve: (ctx) => {
      const payout = productionPayout(derive(ctx.state, ctx.now), 600, 100);
      earn(ctx.state, payout);
      lucky(ctx);
      ctx.cb.toast('🚀', 'PR Approved!', `Merged: +${ctx.cb.fmt(payout)} LoC (10 min of production)`, 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'investor_demo', label: 'Investor Demo', icon: '📈', cls: 'good', weight: 13, linger: 13_000,
    onResolve: (ctx) => {
      addEffect(ctx.state, { id: 'ev_demo', name: 'Investor Demo', icon: '📈', kind: 'production', mult: 7, until: ctx.now + 30_000 });
      lucky(ctx);
      ctx.cb.toast('📈', 'Investor Demo!', 'Everyone performs: production ×7 for 30s', 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'coffee', label: 'Coffee Delivery', icon: '☕', cls: 'good', weight: 13, linger: 13_000,
    onResolve: (ctx) => {
      addEffect(ctx.state, { id: 'ev_coffee', name: 'Coffee Delivery', icon: '☕', kind: 'people', mult: 2, until: ctx.now + 120_000 });
      lucky(ctx);
      ctx.cb.toast('☕', 'Coffee Delivery!', 'All devs ×2 output for 2 minutes', 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'code_freeze', label: 'Code Freeze Lifted', icon: '🧊', cls: 'good', weight: 9, linger: 13_000,
    onResolve: (ctx) => {
      addEffect(ctx.state, { id: 'ev_freeze', name: 'Freeze Lifted', icon: '🧊', kind: 'click', mult: 7, until: ctx.now + 60_000 });
      lucky(ctx);
      ctx.cb.toast('🧊', 'Code Freeze Lifted!', 'Clicks ×7 for 60s — type like the wind', 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'hackathon', label: 'Hackathon', icon: '🔥', cls: 'good', weight: 9, linger: 13_000,
    onResolve: (ctx) => {
      addEffect(ctx.state, { id: 'ev_hack', name: 'Hackathon', icon: '🔥', kind: 'click', mult: 25, until: ctx.now + 20_000 });
      lucky(ctx);
      ctx.cb.toast('🔥', 'Hackathon!', 'Clicks ×25 for 20s — ship something glorious', 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'prod_bug', label: 'Production Bug', icon: '🐛', cls: 'bad', weight: 12, linger: 10_000,
    onResolve: (ctx) => {
      const payout = productionPayout(derive(ctx.state, ctx.now), 60);
      earn(ctx.state, payout);
      if (grantAchievement(ctx.state, 'firefighter')) ctx.cb.achievementEarned('firefighter');
      ctx.cb.toast('🧯', 'Bug squashed!', `Fixed before anyone noticed: +${ctx.cb.fmt(payout)} LoC`, 'toast-good');
      sound.upgrade();
    },
    onExpire: (ctx) => {
      addEffect(ctx.state, { id: 'ev_bugslow', name: 'Production Bug', icon: '🐛', kind: 'production', mult: 0.8, until: ctx.now + 60_000 });
      ctx.cb.toast('🐛', 'Bug hit production', 'Nobody clicked it: production −20% for 60s', 'toast-bad');
      sound.bad();
    },
  },
  {
    id: 'ai_outage', label: 'AI Outage', icon: '🌩️', cls: 'bad', weight: 7, linger: 30_000,
    onSpawn: (ctx) => {
      addEffect(ctx.state, { id: 'ev_outage', name: 'AI Outage', icon: '🌩️', kind: 'production', mult: 0.5, until: ctx.now + 30_000 });
      ctx.cb.toast('🌩️', 'AI Outage!', 'Production halved — click it away to code by hand', 'toast-bad');
      sound.bad();
    },
    onResolve: (ctx) => {
      removeEffect(ctx.state, 'ev_outage');
      if (grantAchievement(ctx.state, 'caffeine')) ctx.cb.achievementEarned('caffeine');
      ctx.cb.toast('⚡', 'Outage over', 'Turns out you can still code without it.', 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'flaky_test', label: 'Flaky Test', icon: '🎲', cls: 'bad', weight: 7, linger: 20_000,
    onSpawn: (ctx) => {
      addEffect(ctx.state, { id: 'ev_flaky', name: 'Flaky Test', icon: '🎲', kind: 'producer', producerId: 'cicd', mult: 0, until: ctx.now + 20_000 });
      ctx.cb.toast('🎲', 'Flaky test!', 'CI/CD Pipelines blocked — click to re-run the suite', 'toast-bad');
      sound.bad();
    },
    onResolve: (ctx) => {
      removeEffect(ctx.state, 'ev_flaky');
      ctx.cb.toast('✅', 'Suite re-run', 'Passed on the second try. Of course it did.', 'toast-good');
      sound.upgrade();
    },
  },
  {
    id: 'merge_conflict', label: 'Merge Conflict', icon: '🧶', cls: 'challenge', weight: 10, linger: 15_000,
    clicksRequired: 10,
    onResolve: (ctx) => {
      const payout = productionPayout(derive(ctx.state, ctx.now), 300, 75);
      earn(ctx.state, payout);
      if (grantAchievement(ctx.state, 'rebase')) ctx.cb.achievementEarned('rebase');
      ctx.cb.toast('🧶', 'Conflict resolved!', `Clean rebase: +${ctx.cb.fmt(payout)} LoC`, 'toast-good');
      sound.upgrade();
    },
    onExpire: (ctx) => {
      ctx.cb.toast('🧶', 'Conflict abandoned', 'The branch was quietly deleted. We don’t talk about it.', '');
    },
  },
  {
    id: 'hotfix', label: 'Critical Hotfix', icon: '🚨', cls: 'challenge', weight: 8, linger: 8_000,
    // Fewer clicks than a Merge Conflict, in half the time, and it shrinks as it
    // goes. Paying per click made mashing speed the reward and dwarfed every
    // other event, so the whole payout lands on the fix.
    clicksRequired: 8,
    shrinks: true,
    onResolve: (ctx) => {
      const payout = productionPayout(derive(ctx.state, ctx.now), 240, 60);
      earn(ctx.state, payout);
      if (grantAchievement(ctx.state, 'hotfixhero')) ctx.cb.achievementEarned('hotfixhero');
      ctx.cb.toast('🚨', 'Hotfix deployed', `Crisis averted: +${ctx.cb.fmt(payout)} LoC`, 'toast-good');
      sound.upgrade();
    },
    onExpire: (ctx) => {
      ctx.cb.toast('🚨', 'Hotfix went out without you', 'Someone else got paged. You owe them one.', '');
    },
  },
];

/** Fresh games only see lucky events — no debuffs before there is anything to debuff. */
function pickEvent(state: State): EventDef {
  const pool = state.loc < 1_000 ? EVENT_TYPES.filter((e) => e.cls === 'good') : EVENT_TYPES;
  const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const e of pool) {
    roll -= e.weight;
    if (roll <= 0) return e;
  }
  return pool[0];
}

export class EventDirector {
  private nextAt: number;
  private current: HTMLElement | null = null;

  constructor(
    private state: State,
    private stage: HTMLElement,
    private cb: EventCallbacks,
  ) {
    this.nextAt = Date.now() + this.roll();
  }

  private roll(): number {
    return MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
  }

  update(now: number): void {
    if (this.current || now < this.nextAt) return;
    this.spawn(pickEvent(this.state));
    this.nextAt = now + this.roll();
  }

  private ctx(): EventCtx {
    return { state: this.state, cb: this.cb, now: Date.now() };
  }

  private spawn(def: EventDef): void {
    const el = document.createElement('button');
    el.className = `event-pickup event-${def.cls}`;
    const needsCounter = (def.clicksRequired ?? 1) > 1;
    el.innerHTML = `<span class="event-icon">${def.icon}</span><span class="event-label">${def.label}</span>${
      needsCounter && def.clicksRequired !== Infinity
        ? `<span class="event-count">0/${def.clicksRequired}</span>`
        : ''
    }`;
    def.onSpawn?.(this.ctx());

    let clicks = 0;
    const required = def.clicksRequired ?? 1;
    const expire = window.setTimeout(() => {
      this.dismiss();
      def.onExpire?.(this.ctx());
    }, def.linger);

    el.addEventListener('click', () => {
      clicks++;
      def.onClickEach?.(this.ctx(), clicks);
      const counter = el.querySelector('.event-count');
      if (counter) counter.textContent = `${clicks}/${required}`;
      // `scale`, not `transform` — the bob animation owns that one.
      if (def.shrinks) el.style.scale = String(pickupScale(clicks, required));
      if (clicks >= required) {
        window.clearTimeout(expire);
        this.dismiss();
        def.onResolve?.(this.ctx());
      } else if (!def.onClickEach) {
        sound.click();
      }
    });

    this.stage.appendChild(el);
    // Needs to be in the DOM first: its own size decides how far out it may sit.
    const spot = pickupSpot(
      { width: this.stage.clientWidth, height: this.stage.clientHeight },
      { width: el.offsetWidth, height: el.offsetHeight },
      { x: 0.1 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.55 },
    );
    el.style.left = `${spot.x}px`;
    el.style.top = `${spot.y}px`;

    this.current = el;
    sound.event();
  }

  private dismiss(): void {
    this.current?.remove();
    this.current = null;
  }
}
