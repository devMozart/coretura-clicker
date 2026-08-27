import { describe, expect, it, vi } from 'vitest';
import { EVENT_TYPES, PICKUP_MIN_SCALE, pickupScale, pickupSpot } from './events';
import { buyProducer, newState } from './game';
import type { State } from './types';

const stage = { width: 390, height: 700 }; // a phone-sized stage
const pill = { width: 210, height: 44 }; // "🧶 Merge Conflict 0/10"

describe('pickupSpot', () => {
  it('keeps a wide pickup fully inside a narrow stage', () => {
    const { x, y } = pickupSpot(stage, pill, { x: 1, y: 1 }); // furthest corner
    expect(x + pill.width).toBeLessThanOrEqual(stage.width);
    expect(y + pill.height).toBeLessThanOrEqual(stage.height);
  });

  it('never places a pickup off the top or left edge', () => {
    const { x, y } = pickupSpot(stage, pill, { x: 0, y: 0 });
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeGreaterThanOrEqual(0);
  });

  it('honours the requested spot when it already fits', () => {
    const roomy = { width: 1200, height: 800 };
    expect(pickupSpot(roomy, pill, { x: 0.5, y: 0.25 })).toEqual({ x: 600, y: 200 });
  });

  it('pins a pickup wider than the stage to the left margin instead of going negative', () => {
    const tiny = { width: 200, height: 300 };
    const { x } = pickupSpot(tiny, pill, { x: 1, y: 0.5 });
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(pill.width);
  });

  it('leaves a margin for the bob animation at every corner', () => {
    for (const fx of [0, 0.5, 1]) {
      for (const fy of [0, 0.5, 1]) {
        const { x, y } = pickupSpot(stage, pill, { x: fx, y: fy });
        expect(x).toBeGreaterThanOrEqual(10);
        expect(y).toBeGreaterThanOrEqual(10);
        expect(x + pill.width).toBeLessThanOrEqual(stage.width - 10);
        expect(y + pill.height).toBeLessThanOrEqual(stage.height - 10);
      }
    }
  });
});

describe('pickupScale', () => {
  const REQUIRED = 8;

  it('starts at full size before any clicks', () => {
    expect(pickupScale(0, REQUIRED)).toBe(1);
  });

  it('shrinks a little on every click', () => {
    expect(pickupScale(1, REQUIRED)).toBeLessThan(pickupScale(0, REQUIRED));
    expect(pickupScale(2, REQUIRED)).toBeLessThan(pickupScale(1, REQUIRED));
    expect(pickupScale(7, REQUIRED)).toBeLessThan(pickupScale(6, REQUIRED));
  });

  it('reaches the floor exactly as the counter fills, not before', () => {
    // the old version bottomed out at a fixed click count while the pickup
    // carried on, so shrinking stopped meaning anything
    expect(pickupScale(REQUIRED - 1, REQUIRED)).toBeGreaterThan(PICKUP_MIN_SCALE);
    expect(pickupScale(REQUIRED, REQUIRED)).toBe(PICKUP_MIN_SCALE);
  });

  it('tracks progress rather than a fixed step, so any requirement fits', () => {
    expect(pickupScale(5, 10)).toBe(pickupScale(10, 20));
    expect(pickupScale(20, 20)).toBe(PICKUP_MIN_SCALE);
  });

  it('never goes below the floor, however many extra clicks land', () => {
    expect(pickupScale(REQUIRED + 50, REQUIRED)).toBe(PICKUP_MIN_SCALE);
  });

  it('keeps the floor generous enough to click — at least 2/3 of full size', () => {
    expect(PICKUP_MIN_SCALE).toBeGreaterThanOrEqual(2 / 3);
  });

  it('stays full size for a pickup with no finite requirement', () => {
    expect(pickupScale(3, Infinity)).toBe(1);
    expect(pickupScale(3, 0)).toBe(1);
  });
});

describe('the Critical Hotfix', () => {
  const hotfix = EVENT_TYPES.find((e) => e.id === 'hotfix')!;

  /** A state that actually produces, so payouts are not just the floor. */
  function producing(): State {
    const s = newState();
    s.funding = 1e12;
    buyProducer(s, 'cicd', 20);
    return s;
  }

  const ctx = (state: State) => ({
    state,
    now: Date.now(),
    cb: {
      toast: vi.fn(),
      achievementEarned: vi.fn(),
      fmt: (n: number) => String(Math.round(n)),
    },
  });

  it('can be finished by clicking, not only by running out of time', () => {
    // it used to require Infinity clicks, so clicking could never end it and the
    // shrinking pickup was promising a completion that did not exist
    expect(Number.isFinite(hotfix.clicksRequired)).toBe(true);
    expect(hotfix.clicksRequired!).toBeGreaterThan(1);
  });

  it('pays nothing per click, so mashing speed is not the reward', () => {
    expect(hotfix.onClickEach).toBeUndefined();
  });

  it('pays out once, when it is fixed', () => {
    const s = producing();
    const before = s.loc;
    const c = ctx(s);
    hotfix.onResolve!(c);
    expect(s.loc - before).toBeGreaterThan(0);
    expect(c.cb.toast).toHaveBeenCalledOnce();
  });

  it('pays less than a Merge Conflict, which asks for more clicks', () => {
    const merge = EVENT_TYPES.find((e) => e.id === 'merge_conflict')!;
    const a = producing();
    const b = producing();
    hotfix.onResolve!(ctx(a));
    merge.onResolve!(ctx(b));
    expect(a.loc).toBeLessThan(b.loc);
    expect(hotfix.clicksRequired!).toBeLessThan(merge.clicksRequired!);
  });

  it('awards Hotfix hero for fixing one, and only the first time', () => {
    const s = producing();
    const first = ctx(s);
    hotfix.onResolve!(first);
    expect(first.cb.achievementEarned).toHaveBeenCalledWith('hotfixhero');

    const second = ctx(s);
    hotfix.onResolve!(second);
    expect(second.cb.achievementEarned).not.toHaveBeenCalled();
  });

  it('awards nothing at all when it expires unresolved', () => {
    const s = producing();
    const before = s.loc;
    const c = ctx(s);
    hotfix.onExpire!(c);
    expect(s.loc).toBe(before);
    expect(s.achievements.has('hotfixhero')).toBe(false);
    // and it no longer congratulates the player for ignoring it
    expect(c.cb.toast.mock.calls[0]?.[3]).not.toBe('toast-good');
  });

  it('is the only pickup that shrinks', () => {
    expect(hotfix.shrinks).toBe(true);
    expect(EVENT_TYPES.filter((e) => e.shrinks).map((e) => e.id)).toEqual(['hotfix']);
  });
});
