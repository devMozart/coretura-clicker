import { describe, expect, it } from 'vitest';
import { PICKUP_MIN_SCALE, pickupScale, pickupSpot } from './events';

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
  it('starts at full size before any clicks', () => {
    expect(pickupScale(0)).toBe(1);
  });

  it('shrinks a little on every click', () => {
    expect(pickupScale(1)).toBeLessThan(pickupScale(0));
    expect(pickupScale(2)).toBeLessThan(pickupScale(1));
    expect(pickupScale(3)).toBeLessThan(pickupScale(2));
  });

  it('bottoms out at the floor so the pickup stays easy to hit', () => {
    expect(pickupScale(10)).toBe(PICKUP_MIN_SCALE);
    expect(pickupScale(50)).toBe(PICKUP_MIN_SCALE);
    expect(pickupScale(1e6)).toBe(PICKUP_MIN_SCALE);
  });

  it('keeps the floor generous enough to click — at least 2/3 of full size', () => {
    expect(PICKUP_MIN_SCALE).toBeGreaterThanOrEqual(2 / 3);
  });
});
