import { describe, expect, it } from 'vitest';
import { cardFilename, fitFontSize, shareTargets, splitScore } from './share';

const file = new File(['x'], 'card.png', { type: 'image/png' });

/** Only the bits of Navigator/window that shareTargets looks at. */
const nav = (over: Record<string, unknown>) => over as unknown as Navigator;
const win = (over: Record<string, unknown>) => over as unknown as typeof globalThis;

describe('shareTargets', () => {
  it('offers sharing when the browser can share files', () => {
    const n = nav({ share: () => {}, canShare: () => true });
    expect(shareTargets(n, win({}), file).canShare).toBe(true);
  });

  it('does not offer sharing when canShare rejects the file', () => {
    const n = nav({ share: () => {}, canShare: () => false });
    expect(shareTargets(n, win({}), file).canShare).toBe(false);
  });

  it('does not offer sharing when share exists but canShare does not', () => {
    // older implementations share text only, and would drop the image
    const n = nav({ share: () => {} });
    expect(shareTargets(n, win({}), file).canShare).toBe(false);
  });

  it('does not offer sharing on a desktop browser without the API', () => {
    expect(shareTargets(nav({}), win({}), file).canShare).toBe(false);
  });

  it('offers copying when the clipboard takes items', () => {
    const n = nav({ clipboard: { write: () => {} } });
    expect(shareTargets(n, win({ ClipboardItem: class {} }), file).canCopy).toBe(true);
  });

  it('does not offer copying without ClipboardItem', () => {
    const n = nav({ clipboard: { write: () => {} } });
    expect(shareTargets(n, win({}), file).canCopy).toBe(false);
  });

  it('does not offer copying when the clipboard is read-only', () => {
    const n = nav({ clipboard: {} });
    expect(shareTargets(n, win({ ClipboardItem: class {} }), file).canCopy).toBe(false);
  });

  it('can end up offering neither, leaving only Save', () => {
    expect(shareTargets(nav({}), win({}), file)).toEqual({ canShare: false, canCopy: false });
  });
});

describe('cardFilename', () => {
  it('includes the score', () => {
    expect(cardFilename(2410)).toBe('coretura-clicker-2.41K-loc.png');
  });

  it('handles a small score', () => {
    expect(cardFilename(0)).toBe('coretura-clicker-0-loc.png');
  });

  it('keeps the decimal point but drops anything else unsafe', () => {
    expect(cardFilename(1.23e18)).toBe('coretura-clicker-1.23Qi-loc.png');
  });

  it('survives an infinite score without producing a broken name', () => {
    // fmt gives "∞", which is not filename-safe anywhere
    expect(cardFilename(Infinity)).toBe('coretura-clicker--loc.png');
  });
});

describe('fitFontSize', () => {
  const sizes = [190, 150, 112];

  it('takes the largest size that fits', () => {
    expect(fitFontSize((s) => s * 4, 800, sizes)).toBe(190);
  });

  it('steps down until the text fits', () => {
    // 190 is too wide at this width, 150 is not
    expect(fitFontSize((s) => s * 4, 700, sizes)).toBe(150);
  });

  it('falls back to the smallest size when nothing fits', () => {
    expect(fitFontSize((s) => s * 100, 10, sizes)).toBe(112);
  });

  it('measures with the size it is testing, not a fixed one', () => {
    const seen: number[] = [];
    fitFontSize(
      (s) => {
        seen.push(s);
        return s * 10;
      },
      1200,
      sizes,
    );
    expect(seen[0]).toBe(190);
  });
});

describe('splitScore', () => {
  it('splits digits from the magnitude suffix', () => {
    expect(splitScore('2.41Sx')).toEqual({ value: '2.41', unit: 'Sx' });
  });

  it('leaves a plain number with no suffix', () => {
    expect(splitScore('999')).toEqual({ value: '999', unit: '' });
  });

  it('handles a single-letter suffix', () => {
    expect(splitScore('1.2K')).toEqual({ value: '1.2', unit: 'K' });
  });

  it('keeps a negative sign with the digits', () => {
    expect(splitScore('-4.5M')).toEqual({ value: '-4.5', unit: 'M' });
  });

  it('passes through something with no digits at all', () => {
    expect(splitScore('∞')).toEqual({ value: '∞', unit: '' });
  });
});
