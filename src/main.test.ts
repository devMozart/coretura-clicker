// @vitest-environment happy-dom
// main.ts is all top-level side effects, so the only way to test it is to import
// it and look at what it did. requestAnimationFrame is stubbed so the game loop
// never starts, which means the HUD is never painted — assertions read state via
// the DEV-only `__game` handle instead.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPage } from './test-dom';

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

async function boot(): Promise<void> {
  vi.resetModules();
  mountPage();
  vi.stubGlobal('requestAnimationFrame', () => 0); // do not start the loop
  await import('./main');
}

const gameState = () => (window as unknown as { __game: { state: State } }).__game.state;

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
