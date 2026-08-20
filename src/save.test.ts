import { beforeEach, describe, expect, it } from 'vitest';

// save.ts talks to localStorage, so stand one up before importing it
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
} as Storage;

const { applySettings, load, save, saveSettings, wipe } = await import('./save');
const { newState } = await import('./game');

const SAVE_KEY = 'coretura-clicker-save-v2';

describe('sound preference', () => {
  beforeEach(() => store.clear());

  it('survives a restart, which wipes progress', () => {
    const s = newState();
    s.loc = 5e6;
    s.muted = true;
    save(s);

    wipe(); // what "Restart game" does
    expect(load()).toBeNull();

    const fresh = newState();
    applySettings(fresh);
    expect(fresh.muted).toBe(true);
    expect(fresh.loc).toBe(0);
  });

  it('is written straight away, so a toggle just before restarting is not lost', () => {
    const s = newState();
    s.muted = true;
    saveSettings(s); // no full save() in between
    wipe();

    const fresh = newState();
    applySettings(fresh);
    expect(fresh.muted).toBe(true);
  });

  it('leaves sound on when nothing was ever chosen', () => {
    const fresh = newState();
    applySettings(fresh);
    expect(fresh.muted).toBe(false);
  });

  it('carries over from a save written before settings were split out', () => {
    // an old-format save: muted lived inside the save blob, no settings key
    store.set(SAVE_KEY, JSON.stringify({ loc: 10, muted: true, lastSaved: Date.now() }));
    const loaded = load();
    expect(loaded?.muted).toBe(true);
  });

  it('prefers the settings key over a stale value in an old save', () => {
    store.set(SAVE_KEY, JSON.stringify({ loc: 10, muted: true, lastSaved: Date.now() }));
    const s = newState();
    s.muted = false;
    saveSettings(s);

    const loaded = load()!;
    applySettings(loaded);
    expect(loaded.muted).toBe(false);
  });

  it('keeps progress and preference independent', () => {
    const s = newState();
    s.loc = 1234;
    s.muted = true;
    save(s);

    const reloaded = load()!;
    applySettings(reloaded);
    expect(reloaded.loc).toBe(1234);
    expect(reloaded.muted).toBe(true);
  });
});
