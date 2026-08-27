import { beforeEach, describe, expect, it } from 'vitest';

// save.ts talks to localStorage, so stand one up before importing it
const store = new Map<string, string>();
let failWrites = false;
let failReads = false;
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => {
    if (failReads) throw new Error('unavailable');
    return store.get(k) ?? null;
  },
  setItem: (k: string, v: string) => {
    if (failWrites) throw new Error('quota exceeded');
    store.set(k, v);
  },
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

const {
  SAVE_VERSION,
  applySettings,
  exportFilename,
  exportSave,
  importSave,
  load,
  runMigrations,
  save,
  saveSettings,
  wipe,
} = await import('./save');
const { newState } = await import('./game');

const SAVE_KEY = 'coretura-clicker-save';
const BROKEN_KEY = 'coretura-clicker-save-broken';
const SETTINGS_KEY = 'coretura-clicker-settings';

/** Writes a save blob straight to storage, bypassing save(). */
const put = (v: unknown, state: unknown) => store.set(SAVE_KEY, JSON.stringify({ v, state }));
const stored = () => JSON.parse(store.get(SAVE_KEY)!) as { v: number; state: Record<string, unknown> };

beforeEach(() => {
  store.clear();
  failWrites = false;
  failReads = false;
});

describe('runMigrations', () => {
  it('leaves data alone when there is nothing to apply', () => {
    const data = { loc: 5 };
    expect(runMigrations(1, data, [])).toEqual({ loc: 5 });
  });

  it('applies one migration', () => {
    const bump = (d: Record<string, unknown>) => ({ ...d, rounds: 0 });
    expect(runMigrations(1, { loc: 5 }, [bump])).toEqual({ loc: 5, rounds: 0 });
  });

  it('chains migrations in order', () => {
    const steps = [
      (d: Record<string, unknown>) => ({ ...d, trail: [...((d.trail as string[]) ?? []), 'first'] }),
      (d: Record<string, unknown>) => ({ ...d, trail: [...((d.trail as string[]) ?? []), 'second'] }),
    ];
    expect(runMigrations(1, {}, steps)).toEqual({ trail: ['first', 'second'] });
  });

  it('starts partway when the save is already half-migrated', () => {
    const steps = [
      (d: Record<string, unknown>) => ({ ...d, first: true }),
      (d: Record<string, unknown>) => ({ ...d, second: true }),
    ];
    // a v2 save has already been through the first migration
    expect(runMigrations(2, {}, steps)).toEqual({ second: true });
  });

  it('applies nothing to a save already at the current version', () => {
    const steps = [(d: Record<string, unknown>) => ({ ...d, touched: true })];
    expect(runMigrations(2, { loc: 1 }, steps)).toEqual({ loc: 1 });
  });

  it('does not mutate the data it is given', () => {
    const data = { loc: 5 };
    runMigrations(1, data, [(d) => ({ ...d, extra: 1 })]);
    expect(data).toEqual({ loc: 5 });
  });
});

describe('round trip', () => {
  it('restores progress through a save and load', () => {
    const s = newState();
    s.loc = 1234.5;
    s.funding = 99;
    s.clicks = 42;
    s.owned = { intern: 7, junior: 2 };
    s.upgrades = new Set(['keyboard']);
    s.achievements = new Set(['hello', 'kilo']);
    save(s);

    const result = load();
    expect(result.kind).toBe('loaded');
    expect(result.state.loc).toBe(1234.5);
    expect(result.state.funding).toBe(99);
    expect(result.state.clicks).toBe(42);
    expect(result.state.owned).toEqual({ intern: 7, junior: 2 });
    expect([...result.state.upgrades]).toEqual(['keyboard']);
    expect([...result.state.achievements]).toEqual(['hello', 'kilo']);
  });

  it('stamps the current version into the envelope', () => {
    save(newState());
    expect(stored().v).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBeGreaterThanOrEqual(1);
  });

  it('keeps progress under `state`, separate from the version', () => {
    const s = newState();
    s.loc = 10;
    save(s);
    expect(Object.keys(stored()).sort()).toEqual(['state', 'v']);
    expect(stored().state.loc).toBe(10);
  });

  it('does not persist timed effects, which are transient', () => {
    const s = newState();
    s.effects = [{ id: 'x', name: 'X', icon: '✨', kind: 'production', mult: 7, until: Date.now() + 10_000 }];
    save(s);
    expect(stored().state.effects).toBeUndefined();
    expect(load().state.effects).toEqual([]);
  });

  it('keeps the sound preference out of the save blob', () => {
    const s = newState();
    s.muted = true;
    save(s);
    expect(stored().state.muted).toBeUndefined();
  });
});

describe('no save yet', () => {
  it('reports empty and hands back a fresh state', () => {
    const result = load();
    expect(result.kind).toBe('empty');
    expect(result.state.loc).toBe(0);
    expect(result.state.owned).toEqual({});
  });

  it('reports empty when storage cannot be read at all', () => {
    failReads = true;
    expect(load().kind).toBe('empty');
  });
});

describe('a save from a newer version', () => {
  it('refuses to load it, and says which version it saw', () => {
    put(SAVE_VERSION + 3, { loc: 5e9 });
    const result = load();
    expect(result.kind).toBe('future');
    expect(result.kind === 'future' && result.storedVersion).toBe(SAVE_VERSION + 3);
    expect(result.state.loc).toBe(0); // a fresh session, not a mangled one
  });

  it('leaves the blob exactly where it is', () => {
    put(SAVE_VERSION + 1, { loc: 5e9 });
    const before = store.get(SAVE_KEY);
    load();
    expect(store.get(SAVE_KEY)).toBe(before);
    expect(store.has(BROKEN_KEY)).toBe(false);
  });

  it('will not let save() overwrite it', () => {
    put(SAVE_VERSION + 1, { loc: 5e9 });
    const before = store.get(SAVE_KEY);

    const s = newState();
    s.loc = 1;
    save(s);

    expect(store.get(SAVE_KEY)).toBe(before);
  });

  it('still records the sound preference, which is not versioned', () => {
    put(SAVE_VERSION + 1, { loc: 5e9 });
    const s = newState();
    s.muted = true;
    save(s);
    expect(store.has(SETTINGS_KEY)).toBe(true);
  });

  it('saves again once the player deliberately wipes', () => {
    put(SAVE_VERSION + 1, { loc: 5e9 });
    wipe();

    const s = newState();
    s.loc = 7;
    save(s);
    expect(load().state.loc).toBe(7);
  });
});

describe('a save that cannot be read', () => {
  const unreadable: [string, string][] = [
    ['not JSON at all', '{{{ truncated'],
    ['JSON that is not an object', '"just a string"'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
    ['no version field', JSON.stringify({ state: { loc: 1 } })],
    ['a non-numeric version', JSON.stringify({ v: 'two', state: { loc: 1 } })],
    ['a zero version', JSON.stringify({ v: 0, state: { loc: 1 } })],
    ['a fractional version', JSON.stringify({ v: 1.5, state: { loc: 1 } })],
    ['no state field', JSON.stringify({ v: 1 })],
    ['a non-object state', JSON.stringify({ v: 1, state: 42 })],
  ];

  it.each(unreadable)('treats %s as broken', (_label, raw) => {
    store.set(SAVE_KEY, raw);
    expect(load().kind).toBe('broken');
  });

  it('sets the bad blob aside instead of destroying it', () => {
    store.set(SAVE_KEY, '{{{ truncated');
    load();
    expect(store.get(BROKEN_KEY)).toBe('{{{ truncated');
    expect(store.has(SAVE_KEY)).toBe(false); // cleared, so it is not re-quarantined
  });

  it('keeps the blob in place if it cannot be set aside', () => {
    store.set(SAVE_KEY, '{{{ truncated');
    failWrites = true;
    expect(load().kind).toBe('broken');
    expect(store.get(SAVE_KEY)).toBe('{{{ truncated'); // better kept than dropped
  });

  it('hands back a playable fresh state', () => {
    store.set(SAVE_KEY, '{{{ truncated');
    expect(load().state.loc).toBe(0);
  });
});

describe('sanitising a loaded save', () => {
  it('drops producer ids that no longer exist', () => {
    put(1, { owned: { intern: 3, sysadmin: 99, junior: 1 } });
    expect(load().state.owned).toEqual({ intern: 3, junior: 1 });
  });

  it('drops upgrade ids that no longer exist', () => {
    put(1, { upgrades: ['keyboard', 'floppy_disk', 'monitor'] });
    expect([...load().state.upgrades]).toEqual(['keyboard', 'monitor']);
  });

  it('drops achievement ids that no longer exist', () => {
    put(1, { achievements: ['hello', 'became_a_manager'] });
    expect([...load().state.achievements]).toEqual(['hello']);
  });

  it('keeps unknown ids from inflating the multipliers they feed', () => {
    // upgrades.size drives AI output, achievements.size drives code quality,
    // and the sum of owned drives upgrade unlocks — so a stale id is free value.
    put(1, {
      owned: { ghost: 500 },
      upgrades: ['ghost_a', 'ghost_b'],
      achievements: ['ghost_c', 'ghost_d'],
    });
    const s = load().state;
    expect(Object.values(s.owned).reduce((a, b) => a + b, 0)).toBe(0);
    expect(s.upgrades.size).toBe(0);
    expect(s.achievements.size).toBe(0);
  });

  it.each([
    ['a negative score', -5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['a numeric string', '1000'],
    ['null', null],
    ['an object', { nope: true }],
  ])('falls back to zero for %s', (_label, loc) => {
    put(1, { loc, funding: loc, clicks: loc });
    const s = load().state;
    expect(s.loc).toBe(0);
    expect(s.funding).toBe(0);
    expect(s.clicks).toBe(0);
  });

  it('floors fractional owned counts and drops empty ones', () => {
    put(1, { owned: { intern: 3.7, junior: 0, senior: -2, cicd: 1 } });
    expect(load().state.owned).toEqual({ intern: 3, cicd: 1 });
  });

  it('recovers when the id collections are the wrong type entirely', () => {
    put(1, { owned: 'nope', upgrades: 42, achievements: null });
    const s = load().state;
    expect(s.owned).toEqual({});
    expect(s.upgrades.size).toBe(0);
    expect(s.achievements.size).toBe(0);
  });

  it('fills in a missing lastSaved rather than granting offline time', () => {
    const before = Date.now();
    put(1, { loc: 10 });
    const { lastSaved } = load().state;
    expect(lastSaved).toBeGreaterThanOrEqual(before);
    expect(lastSaved).toBeLessThanOrEqual(Date.now());
  });

  it('clamps a lastSaved in the future, which would otherwise pay out on reload', () => {
    put(1, { loc: 10, lastSaved: Date.now() + 5 * 60 * 60 * 1000 });
    expect(load().state.lastSaved).toBeLessThanOrEqual(Date.now());
  });

  it('keeps a legitimate lastSaved', () => {
    const when = Date.now() - 60_000;
    put(1, { loc: 10, lastSaved: when });
    expect(load().state.lastSaved).toBe(when);
  });
});

describe('sound preference', () => {
  it('survives a restart, which wipes progress', () => {
    const s = newState();
    s.loc = 5e6;
    s.muted = true;
    save(s);

    wipe(); // what "Restart game" does
    expect(load().kind).toBe('empty');

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
});

describe('wipe', () => {
  it('clears progress and the quarantined blob, but keeps settings', () => {
    const s = newState();
    s.loc = 100;
    s.muted = true;
    save(s);
    store.set(BROKEN_KEY, 'old rubbish');

    wipe();

    expect(store.has(SAVE_KEY)).toBe(false);
    expect(store.has(BROKEN_KEY)).toBe(false);
    expect(store.has(SETTINGS_KEY)).toBe(true);
  });
});

describe('when storage misbehaves', () => {
  it('keeps running when the save cannot be written', () => {
    failWrites = true;
    const s = newState();
    s.loc = 10;
    expect(() => save(s)).not.toThrow();
  });

  it('keeps running when settings cannot be read', () => {
    failReads = true;
    const s = newState();
    expect(() => applySettings(s)).not.toThrow();
    expect(s.muted).toBe(false);
  });
});

describe('exporting to a file', () => {
  it('writes the same envelope shape the save key holds', () => {
    const s = newState();
    s.loc = 4242;
    s.owned = { intern: 3 };
    const parsed = JSON.parse(exportSave(s)) as { v: number; state: Record<string, unknown> };
    expect(parsed.v).toBe(SAVE_VERSION);
    expect(parsed.state.loc).toBe(4242);
    expect(parsed.state.owned).toEqual({ intern: 3 });
  });

  it('exports the live run, not whatever storage happens to hold', () => {
    const s = newState();
    s.loc = 10;
    save(s);
    s.loc = 999; // played on since the last autosave
    expect((JSON.parse(exportSave(s)) as { state: { loc: number } }).state.loc).toBe(999);
  });

  it('works when storage holds a save from a newer build, which save() refuses', () => {
    put(SAVE_VERSION + 1, { loc: 5e9 });
    const s = newState();
    s.loc = 7;
    expect((JSON.parse(exportSave(s)) as { state: { loc: number } }).state.loc).toBe(7);
  });

  it('leaves the sound preference out, since it belongs to the device', () => {
    const s = newState();
    s.muted = true;
    const parsed = JSON.parse(exportSave(s)) as { state: Record<string, unknown> };
    expect(parsed.state.muted).toBeUndefined();
  });

  it('round trips through import', () => {
    const s = newState();
    s.loc = 1234.5;
    s.clicks = 9;
    s.upgrades = new Set(['keyboard']);
    const text = exportSave(s);

    store.clear();
    expect(importSave(text)).toBe('ok');
    const back = load();
    expect(back.kind).toBe('loaded');
    expect(back.state.loc).toBe(1234.5);
    expect(back.state.clicks).toBe(9);
    expect([...back.state.upgrades]).toEqual(['keyboard']);
  });
});

describe('exportFilename', () => {
  const day = new Date('2026-08-27T10:30:00Z');

  it('carries the score and the date', () => {
    expect(exportFilename(2410, day)).toBe('coretura-clicker-2.41K-2026-08-27.json');
  });

  it('keeps the name filesystem-safe', () => {
    expect(exportFilename(Infinity, day)).toBe('coretura-clicker--2026-08-27.json');
  });

  it('handles a fresh run', () => {
    expect(exportFilename(0, day)).toBe('coretura-clicker-0-2026-08-27.json');
  });
});

describe('importing a file', () => {
  const good = () => JSON.stringify({ v: SAVE_VERSION, state: { loc: 500 } });

  it('makes a valid file the live save', () => {
    expect(importSave(good())).toBe('ok');
    expect(load().state.loc).toBe(500);
  });

  it('replaces whatever was there', () => {
    const s = newState();
    s.loc = 1;
    save(s);
    importSave(good());
    expect(load().state.loc).toBe(500);
  });

  const junk: [string, string][] = [
    ['not JSON', '{{{'],
    ['a bare string', '"hello"'],
    ['null', 'null'],
    ['an array', '[1,2]'],
    ['no version', JSON.stringify({ state: { loc: 1 } })],
    ['a non-numeric version', JSON.stringify({ v: 'one', state: { loc: 1 } })],
    ['no state', JSON.stringify({ v: 1 })],
    ['a non-object state', JSON.stringify({ v: 1, state: 5 })],
    ['an empty file', ''],
  ];

  it.each(junk)('refuses %s', (_label, text) => {
    expect(importSave(text)).toBe('unreadable');
  });

  it('refuses a file from a newer build rather than writing something it cannot read', () => {
    expect(importSave(JSON.stringify({ v: SAVE_VERSION + 1, state: { loc: 9 } }))).toBe('future');
  });

  it('leaves the existing save untouched when it refuses', () => {
    const s = newState();
    s.loc = 77;
    save(s);
    const before = store.get(SAVE_KEY);

    expect(importSave('{{{')).toBe('unreadable');
    expect(importSave(JSON.stringify({ v: SAVE_VERSION + 5, state: {} }))).toBe('future');
    expect(store.get(SAVE_KEY)).toBe(before);
  });

  it('reports a storage failure rather than claiming success', () => {
    failWrites = true;
    expect(importSave(good())).toBe('unreadable');
  });

  it('runs migrations on load, so an older file still opens', () => {
    // a v1 file, whatever the current version is
    expect(importSave(JSON.stringify({ v: 1, state: { loc: 321 } }))).toBe('ok');
    expect(load().state.loc).toBe(321);
  });
});
