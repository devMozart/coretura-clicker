import { describe, expect, it } from 'vitest';
import { fmt, fmtRate } from './format';

describe('fmt', () => {
  it('shows integers below 1000', () => {
    expect(fmt(0)).toBe('0');
    expect(fmt(999.9)).toBe('999');
  });

  it('uses K/M/B/T with 2-3 significant figures', () => {
    expect(fmt(1234)).toBe('1.23K');
    expect(fmt(12_345)).toBe('12.3K');
    expect(fmt(123_456)).toBe('123K');
    expect(fmt(1.5e6)).toBe('1.5M');
    expect(fmt(5.1e9)).toBe('5.1B');
    expect(fmt(14e12)).toBe('14T');
  });

  it('continues into Qa/Qi and beyond', () => {
    expect(fmt(2e15)).toBe('2Qa');
    expect(fmt(3e18)).toBe('3Qi');
  });

  it('drops trailing zeros', () => {
    expect(fmt(1000)).toBe('1K');
    expect(fmt(1100)).toBe('1.1K');
  });
});

describe('fmtRate', () => {
  it('keeps one decimal below 1000', () => {
    expect(fmtRate(0.1)).toBe('0.1');
    expect(fmtRate(12)).toBe('12');
    expect(fmtRate(12.34)).toBe('12.3');
  });

  it('falls back to fmt above 1000', () => {
    expect(fmtRate(1234)).toBe('1.23K');
  });
});
