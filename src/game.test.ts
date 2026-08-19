import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS, PRODUCER_BY_ID } from './content';
import {
  addEffect,
  buyProducer,
  buyUpgrade,
  bulkCost,
  checkAchievements,
  click,
  costOf,
  derive,
  earn,
  newState,
  productionPayout,
  pruneEffects,
  tick,
  visibleUpgrades,
} from './game';
import type { State } from './types';

const intern = PRODUCER_BY_ID['intern'];

function rich(funding = 1e18): State {
  const s = newState();
  s.funding = funding;
  return s;
}

describe('cost curve', () => {
  it('first unit costs base cost', () => {
    expect(costOf(intern, 0)).toBe(15);
  });

  it('grows ×1.15 per unit owned, rounded up', () => {
    expect(costOf(intern, 1)).toBe(Math.ceil(15 * 1.15));
    expect(costOf(intern, 10)).toBe(Math.ceil(15 * 1.15 ** 10));
  });

  it('bulk cost is the sum of successive units', () => {
    expect(bulkCost(intern, 0, 3)).toBe(costOf(intern, 0) + costOf(intern, 1) + costOf(intern, 2));
  });
});

describe('economy', () => {
  it('earning LoC also ships into funding', () => {
    const s = newState();
    earn(s, 100);
    expect(s.loc).toBe(100);
    expect(s.funding).toBe(100);
  });

  it('clicking earns the click value', () => {
    const s = newState();
    const gained = click(s, derive(s));
    expect(gained).toBe(1);
    expect(s.loc).toBe(1);
    expect(s.clicks).toBe(1);
  });

  it('buying spends funding but never the LoC score', () => {
    const s = newState();
    earn(s, 1000);
    expect(buyProducer(s, 'intern', 1)).toBe(true);
    expect(s.funding).toBe(1000 - 15);
    expect(s.loc).toBe(1000);
  });

  it('refuses purchases it cannot afford', () => {
    const s = newState();
    earn(s, 10);
    expect(buyProducer(s, 'intern', 1)).toBe(false);
    expect(s.funding).toBe(10);
  });

  it('producers generate LoC over time', () => {
    const s = rich();
    buyProducer(s, 'junior', 1); // 1 LoC/s
    const before = s.loc;
    tick(s, derive(s), 10);
    expect(s.loc).toBeCloseTo(before + 10);
  });
});

describe('multipliers (recomputed from scratch)', () => {
  it('click upgrades double the click, and can never double-apply', () => {
    const s = rich();
    s.clicks = 10;
    expect(buyUpgrade(s, 'keyboard')).toBe(true);
    expect(derive(s).clickValue).toBe(2);
    expect(buyUpgrade(s, 'keyboard')).toBe(false);
    expect(derive(s).clickValue).toBe(2);
  });

  it('producer doublers only affect their producer', () => {
    const s = rich();
    buyProducer(s, 'intern', 1); // 0.1
    buyProducer(s, 'junior', 1); // 1
    buyUpgrade(s, 'better_intern');
    expect(derive(s).locPerSec).toBeCloseTo(0.1 * 2 + 1);
  });

  it('milestone tiers unlock at owned thresholds', () => {
    const s = rich();
    buyProducer(s, 'junior', 9);
    let ids = visibleUpgrades(s).map((u) => u.id);
    expect(ids).toContain('better_junior');
    expect(ids).not.toContain('elite_junior');
    buyProducer(s, 'junior', 1); // now 10
    ids = visibleUpgrades(s).map((u) => u.id);
    expect(ids).toContain('elite_junior');
  });

  it('achievements grant +1% global each', () => {
    const s = rich();
    buyProducer(s, 'junior', 1);
    s.achievements.add('hello').add('kilo');
    expect(derive(s).locPerSec).toBeCloseTo(1 * 1.02);
  });
});

describe('producer specials', () => {
  it('tech leads buff people but not infrastructure', () => {
    const s = rich();
    buyProducer(s, 'junior', 10); // people: 10 LoC/s
    buyProducer(s, 'cicd', 1); // infra: 47 LoC/s
    const base = derive(s).locPerSec;
    expect(base).toBeCloseTo(57);
    buyProducer(s, 'techlead', 5); // +10% to people, plus their own 5×1400 output
    const d = derive(s);
    expect(d.locPerSec).toBeCloseTo(10 * 1.1 + 47 + 5 * 1400 * 1.1);
  });

  it('devops engineers boost ALL production', () => {
    const s = rich();
    buyProducer(s, 'cicd', 1); // 47
    buyProducer(s, 'devops', 10); // +10% global, plus own output (people-buffed? no techleads)
    const d = derive(s);
    expect(d.locPerSec).toBeCloseTo((47 + 10 * 44e3) * 1.1);
  });

  it('AI assistants scale +5% per upgrade owned', () => {
    const s = rich();
    s.clicks = 10;
    buyProducer(s, 'ai', 1); // 7800 base
    expect(derive(s).locPerSec).toBeCloseTo(7800);
    buyUpgrade(s, 'keyboard'); // any upgrade counts
    expect(derive(s).locPerSec).toBeCloseTo(7800 * 1.05);
  });

  it('consultants deliver via bursts, not the continuous tick', () => {
    const s = rich();
    buyProducer(s, 'consultant', 2); // 520 average
    const d = derive(s);
    expect(d.burstPerSec).toBeCloseTo(520);
    expect(d.continuousPerSec).toBe(0);
    expect(d.locPerSec).toBeCloseTo(520);
    const before = s.loc;
    tick(s, d, 10);
    expect(s.loc).toBe(before); // bursts land separately
  });

  it('meetings drag production down but never below zero', () => {
    const s = rich();
    buyProducer(s, 'intern', 1); // +0.1
    buyProducer(s, 'meeting', 3); // −6
    expect(derive(s).locPerSec).toBe(0);
  });

  it('async standups flip meetings positive', () => {
    const s = rich();
    buyProducer(s, 'meeting', 3);
    buyUpgrade(s, 'asyncstandups');
    expect(derive(s).locPerSec).toBeCloseTo(3 * 6);
  });
});

describe('synergies', () => {
  it('interns gain +5% per senior with mentorship', () => {
    const s = rich();
    buyProducer(s, 'intern', 10); // 1 LoC/s
    buyProducer(s, 'senior', 10); // 80 LoC/s
    buyUpgrade(s, 'mentorship');
    const d = derive(s);
    // interns: 1 × (1 + 0.05×10) = 1.5, seniors unchanged
    expect(d.locPerSec).toBeCloseTo(1.5 + 80);
  });
});

describe('timed effects', () => {
  const now = 1_000_000;

  it('production effects stack multiplicatively and expire', () => {
    const s = rich();
    buyProducer(s, 'junior', 1);
    addEffect(s, { id: 'a', name: 'Demo', icon: '📈', kind: 'production', mult: 7, until: now + 10_000 });
    addEffect(s, { id: 'b', name: 'Bug', icon: '🐛', kind: 'production', mult: 0.8, until: now + 5_000 });
    expect(derive(s, now).locPerSec).toBeCloseTo(7 * 0.8);
    expect(derive(s, now + 6_000).locPerSec).toBeCloseTo(7);
    expect(derive(s, now + 11_000).locPerSec).toBeCloseTo(1);
  });

  it('people effects only touch people', () => {
    const s = rich();
    buyProducer(s, 'junior', 1); // 1
    buyProducer(s, 'cicd', 1); // 47
    addEffect(s, { id: 'coffee', name: 'Coffee', icon: '☕', kind: 'people', mult: 2, until: now + 10_000 });
    expect(derive(s, now).locPerSec).toBeCloseTo(2 + 47);
  });

  it('producer effects can zero out one producer', () => {
    const s = rich();
    buyProducer(s, 'junior', 1);
    buyProducer(s, 'cicd', 1);
    addEffect(s, { id: 'flaky', name: 'Flaky', icon: '🎲', kind: 'producer', producerId: 'cicd', mult: 0, until: now + 10_000 });
    expect(derive(s, now).locPerSec).toBeCloseTo(1);
  });

  it('click effects boost the click, not production', () => {
    const s = rich();
    buyProducer(s, 'junior', 1);
    addEffect(s, { id: 'hack', name: 'Hackathon', icon: '🔥', kind: 'click', mult: 25, until: now + 10_000 });
    const d = derive(s, now);
    expect(d.clickValue).toBeCloseTo(25);
    expect(d.locPerSec).toBeCloseTo(1);
  });

  it('replacing an effect refreshes rather than stacks', () => {
    const s = rich();
    buyProducer(s, 'junior', 1);
    addEffect(s, { id: 'x', name: 'X', icon: '✨', kind: 'production', mult: 7, until: now + 1_000 });
    addEffect(s, { id: 'x', name: 'X', icon: '✨', kind: 'production', mult: 7, until: now + 20_000 });
    expect(derive(s, now).locPerSec).toBeCloseTo(7);
  });

  it('pruning drops expired effects', () => {
    const s = newState();
    addEffect(s, { id: 'x', name: 'X', icon: '✨', kind: 'production', mult: 7, until: now + 1_000 });
    pruneEffects(s, now + 2_000);
    expect(s.effects).toHaveLength(0);
  });
});

describe('store gating', () => {
  it('upgrades unlock by condition', () => {
    const s = newState();
    expect(visibleUpgrades(s).map((u) => u.id)).not.toContain('keyboard');
    s.clicks = 10;
    expect(visibleUpgrades(s).map((u) => u.id)).toContain('keyboard');
  });

  it('architecture upgrades gate on senior developers', () => {
    const s = rich();
    expect(visibleUpgrades(s).map((u) => u.id)).not.toContain('hexagonal');
    buyProducer(s, 'senior', 5);
    expect(visibleUpgrades(s).map((u) => u.id)).toContain('hexagonal');
  });
});

describe('achievements', () => {
  it('are earned once and reported', () => {
    const s = newState();
    earn(s, 1);
    expect(checkAchievements(s, derive(s))).toContain('hello');
    expect(checkAchievements(s, derive(s))).toEqual([]);
  });

  it('counts people across all people producers', () => {
    const s = rich();
    buyProducer(s, 'intern', 4);
    buyProducer(s, 'junior', 3);
    buyProducer(s, 'senior', 3);
    expect(checkAchievements(s, derive(s))).toContain('startup');
  });
});

describe('achievement content', () => {
  it('gives every achievement an icon for the grid', () => {
    const iconless = ACHIEVEMENTS.filter((a) => !a.icon?.trim()).map((a) => a.id);
    expect(iconless).toEqual([]);
  });

  it('has no duplicate ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('event payouts', () => {
  it('pays N seconds of production with a floor', () => {
    const s = rich();
    expect(productionPayout(derive(s), 600, 100)).toBe(100); // no production yet
    buyProducer(s, 'cicd', 1); // 47/s
    expect(productionPayout(derive(s), 600, 100)).toBeCloseTo(47 * 600);
  });
});
