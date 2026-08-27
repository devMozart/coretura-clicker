// @vitest-environment happy-dom
// main.ts is all top-level side effects, so the only way to test it is to import
// it and look at what it did. requestAnimationFrame is stubbed so the game loop
// never starts, which means the HUD is never painted — assertions read state via
// the DEV-only `__game` handle instead.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { mountPage } from './test-dom';
import { BURST_INTERVAL, PRODUCER_BY_ID } from './content';
import { OFFLINE_CAP_SECONDS } from './save';
import { fmt } from './format';

import type { State } from './types';

// happy-dom supplies no localStorage here (it defers to Node's experimental one,
// which is off), so stand up the same Map-backed stub save.test.ts uses.
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

const SAVE_KEY = 'coretura-clicker-save';
const BROKEN_KEY = 'coretura-clicker-save-broken';

let frames: FrameRequestCallback[] = [];

async function boot(): Promise<void> {
  vi.resetModules();
  mountPage();
  frames = [];
  // hold the loop instead of running it, so the tests decide when a frame lands
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  await import('./main');
}

/** happy-dom has no real tab, so drive visibilityState by hand. */
function setVisibility(value: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Runs the pending frame, as a visible tab would. */
function runFrame(): void {
  const cb = frames.pop();
  frames = [];
  cb?.(0);
}

const gameState = () => (window as unknown as { __game: { state: State } }).__game.state;

const rateOf = () =>
  (window as unknown as { __game: { derive: () => { locPerSec: number } } }).__game.derive().locPerSec;

const toasts = () => [...document.querySelectorAll('.toast-text strong')].map((n) => n.textContent);

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

describe('main.ts boot', () => {
  it('starts a fresh game with no save, and no toast', async () => {
    await boot();
    expect(document.getElementById('loc')!.textContent).toBe('0');
    expect(toasts()).toEqual([]);
    expect(document.querySelectorAll('.producer-row').length).toBeGreaterThan(0);
    expect(document.getElementById('ach-total')!.textContent).not.toBe('0');
  });

  it('loads a v1 save and pays out offline earnings', async () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({
        v: 1,
        state: {
          loc: 1000,
          funding: 1000,
          clicks: 5,
          owned: { intern: 10 },
          upgrades: [],
          achievements: [],
          lastSaved: Date.now() - 60_000, // a minute away
        },
      }),
    );
    await boot();
    expect(toasts()).toContain('While you were away…');
    const s = gameState();
    expect(s.owned).toEqual({ intern: 10 }); // survived the round trip
    expect(s.loc).toBeGreaterThan(1000); // 10 interns x 0.1 LoC/s x 60s on top
    expect(s.loc).toBeLessThan(1100);
  });

  it('warns about a save from a newer version and leaves it alone', async () => {
    const blob = JSON.stringify({ v: 99, state: { loc: 5e9 } });
    localStorage.setItem(SAVE_KEY, blob);
    await boot();
    expect(toasts()).toContain('Save is newer than this version');
    expect(localStorage.getItem(SAVE_KEY)).toBe(blob); // untouched
    expect(document.getElementById('loc')!.textContent).toBe('0');
  });

  it('warns about an unreadable save and quarantines it', async () => {
    localStorage.setItem(SAVE_KEY, '{{{ truncated');
    await boot();
    expect(toasts()).toContain('Save could not be read');
    expect(localStorage.getItem(BROKEN_KEY)).toBe('{{{ truncated');
  });

  it('does not pay out offline earnings for a fresh or rejected save', async () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 99, state: { loc: 5e9 } }));
    await boot();
    expect(toasts()).not.toContain('While you were away…');
  });
});

describe('milestones', () => {
  const savedAt = (loc: number) =>
    JSON.stringify({
      v: 1,
      state: {
        loc,
        funding: loc,
        clicks: 0,
        owned: {},
        upgrades: [],
        achievements: [],
        lastSaved: Date.now(),
      },
    });

  it('throws a screen-wide moment when a million lines land', async () => {
    localStorage.setItem('coretura-clicker-save', savedAt(1e6));
    await boot();
    expect(document.querySelector('.milestone strong')!.textContent).toBe('1 MILLION LINES');
    expect(document.querySelectorAll('.confetti').length).toBeGreaterThan(20);
  });

  it('stays quiet for the smaller achievements', async () => {
    localStorage.setItem('coretura-clicker-save', savedAt(1e3));
    await boot();
    // 'kilo' is earned and toasted, but it is not a milestone
    expect(toasts()).toContain('Kilo-coder');
    expect(document.querySelector('.milestone')).toBeNull();
    expect(document.querySelectorAll('.confetti').length).toBe(0);
  });

  it('does not celebrate again for a milestone already earned', async () => {
    const blob = JSON.parse(savedAt(1e6)) as { v: number; state: Record<string, unknown> };
    blob.state.achievements = ['hello', 'kilo', 'merge'];
    localStorage.setItem('coretura-clicker-save', JSON.stringify(blob));
    await boot();
    expect(document.querySelector('.milestone')).toBeNull();
  });
});

describe('production while the tab is away', () => {
  const T0 = 1_700_000_000_000;

  beforeEach(() => {
    // only Date is faked: setInterval and the stubbed rAF have to stay real
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(T0);
  });

  afterEach(() => vi.useRealTimers());

  it('pays for the whole time away, not just the last frame', async () => {
    // a hidden tab fires no frames at all, so the first frame back carries the
    // entire gap. Clamping that gap used to throw all but a second of it away.
    await boot();
    const state = gameState();
    state.owned = { cicd: 10 };
    const rate = rateOf();
    runFrame();

    const before = state.loc;
    vi.setSystemTime(T0 + 60_000);
    runFrame();

    expect(state.loc - before).toBeCloseTo(rate * 60, 0);
  });

  it('pays every consultant lump the gap contained', async () => {
    await boot();
    const state = gameState();
    state.owned = { consultant: 1 };
    runFrame();

    const before = state.loc;
    vi.setSystemTime(T0 + 60_000); // six whole burst intervals
    runFrame();

    const perLump = PRODUCER_BY_ID['consultant'].baseCps * BURST_INTERVAL;
    expect(state.loc - before).toBeCloseTo(perLump * 6, 0);
  });

  it('ships the time away into funding too, not just the score', async () => {
    // funding is the spend currency: if it stood still while hidden, the idle
    // half of the game would earn a score it could never spend
    await boot();
    const state = gameState();
    state.owned = { cicd: 10 };
    const rate = rateOf();
    runFrame();

    const loc = state.loc;
    const funding = state.funding;
    vi.setSystemTime(T0 + 60_000);
    runFrame();

    expect(state.funding - funding).toBeCloseTo(rate * 60, 0);
    expect(state.funding - funding).toBeCloseTo(state.loc - loc, 0);
  });

  it('ships burst lumps into funding as well', async () => {
    await boot();
    const state = gameState();
    state.owned = { consultant: 1 };
    runFrame();

    const loc = state.loc;
    const funding = state.funding;
    vi.setSystemTime(T0 + 60_000);
    runFrame();

    expect(state.funding - funding).toBeGreaterThan(0);
    expect(state.funding - funding).toBeCloseTo(state.loc - loc, 0);
  });

  it('caps a single gap, so a machine waking from a long sleep cannot pay it all', async () => {
    await boot();
    const state = gameState();
    state.owned = { cicd: 10 };
    const rate = rateOf();
    runFrame();

    const before = state.loc;
    vi.setSystemTime(T0 + 30 * 24 * 3600 * 1000);
    runFrame();

    expect(state.loc - before).toBeCloseTo(rate * OFFLINE_CAP_SECONDS, 0);
  });

  it('settles up when the tab comes back, without waiting for a frame', async () => {
    await boot();
    const state = gameState();
    state.owned = { cicd: 10 };
    const rate = rateOf();
    runFrame();

    const before = state.loc;
    setVisibility('hidden');
    vi.setSystemTime(T0 + 120_000);
    setVisibility('visible');

    expect(state.loc - before).toBeCloseTo(rate * 120, 0);
    expect(toasts()).toContain('Caught up');
  });

  it('reports the whole absence, not just the part still unpaid', async () => {
    await boot();
    const state = gameState();
    state.owned = { cicd: 10 };
    const rate = rateOf();
    runFrame();

    setVisibility('hidden');
    // a throttled background timer pays off part of the absence early
    vi.setSystemTime(T0 + 100_000);
    window.dispatchEvent(new Event('beforeunload')); // settles, as any save does
    vi.setSystemTime(T0 + 200_000);
    setVisibility('visible');

    const body = [...document.querySelectorAll('.toast-text span')].map((n) => n.textContent);
    expect(toasts()).toContain('Caught up');
    // 200s of production, not the 100s that was left unpaid
    expect(body.join(' ')).toContain(fmt(rate * 200));
  });

  it('says nothing for a glance away', async () => {
    await boot();
    gameState().owned = { cicd: 10 };
    runFrame();

    setVisibility('hidden');
    vi.setSystemTime(T0 + 3_000);
    setVisibility('visible');

    expect(toasts()).not.toContain('Caught up');
  });

  it('settles before saving, so closing a hidden tab keeps the gap', async () => {
    await boot();
    const state = gameState();
    state.owned = { cicd: 10 };
    const rate = rateOf();
    runFrame();

    // no frame runs while hidden; the tab is simply closed an hour later
    vi.setSystemTime(T0 + 3_600_000);
    window.dispatchEvent(new Event('beforeunload'));

    const saved = JSON.parse(localStorage.getItem(SAVE_KEY)!) as { state: { loc: number } };
    expect(saved.state.loc).toBeCloseTo(rate * 3600, 0);
  });
});

describe('saving and loading a file', () => {
  const SAVE = 'coretura-clicker-save';

  const press = (id: string) =>
    document.getElementById(id)!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

  /** Swaps in a location whose reload() can be observed instead of navigating. */
  function stubReload(): Mock {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      configurable: true,
    });
    return reload;
  }

  /** Picks a file the way the input reports one, then waits for the confirm. */
  async function pickFile(text: string): Promise<void> {
    const input = document.getElementById('import-file') as HTMLInputElement;
    const file = new File([text], 'save.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() =>
      expect(document.getElementById('import-confirm')!.classList.contains('hidden')).toBe(false),
    );
  }

  it('saves the run on screen, and names the file after it', async () => {
    await boot();
    const state = gameState();
    state.loc = 4242;
    state.owned = { intern: 3 };

    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const names: string[] = [];
    const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });

    press('menu-btn');
    press('menu-export');

    // it persists first, so the file cannot disagree with the game
    const saved = JSON.parse(localStorage.getItem(SAVE)!) as { state: { loc: number } };
    expect(saved.state.loc).toBeCloseTo(4242, 0);
    expect(names[0]).toMatch(/^coretura-clicker-.*\.json$/);
    expect(revoked).toHaveBeenCalledWith('blob:x');
    expect(toasts()).toContain('Saved to a file');

    created.mockRestore();
    revoked.mockRestore();
    clicked.mockRestore();
  });

  it('loads a file the player confirms', async () => {
    await boot();
    gameState().loc = 12345; // the run being replaced

    const reload = stubReload();

    press('menu-btn');
    await pickFile(JSON.stringify({ v: 1, state: { loc: 7 } }));
    press('import-load');

    const saved = JSON.parse(localStorage.getItem(SAVE)!) as { state: { loc: number } };
    expect(saved.state.loc).toBe(7);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('stops autosaving and unload-saving first, so the import survives', async () => {
    // the race this closes: a pending autosave tick, or the unload handler,
    // writing the replaced run straight back over what was just imported
    const cleared = vi.spyOn(globalThis, 'clearInterval');
    const unhooked = vi.spyOn(window, 'removeEventListener');
    await boot();
    stubReload();

    press('menu-btn');
    await pickFile(JSON.stringify({ v: 1, state: { loc: 7 } }));
    press('import-load');

    expect(cleared).toHaveBeenCalled();
    expect(unhooked).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    cleared.mockRestore();
    unhooked.mockRestore();
  });

  it('changes nothing, and says so, when the file is not a save', async () => {
    await boot();
    gameState().loc = 500;
    window.dispatchEvent(new Event('beforeunload')); // put a save on disk
    const before = localStorage.getItem(SAVE);

    press('menu-btn');
    await pickFile('not a save at all');
    press('import-load');

    expect(localStorage.getItem(SAVE)).toBe(before);
    expect(toasts()).toContain('Could not load that file');
  });

  it('refuses a file from a newer build rather than writing it', async () => {
    await boot();
    press('menu-btn');
    await pickFile(JSON.stringify({ v: 999, state: { loc: 1 } }));
    press('import-load');

    expect(localStorage.getItem(SAVE)).toBeNull();
    expect(toasts()).toContain('Could not load that file');
  });

  it('imports nothing while the confirm is still waiting', async () => {
    await boot();
    press('menu-btn');
    await pickFile(JSON.stringify({ v: 1, state: { loc: 7 } }));

    expect(localStorage.getItem(SAVE)).toBeNull(); // not yet
  });
});
