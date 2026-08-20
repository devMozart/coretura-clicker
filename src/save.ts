import { ACHIEVEMENT_BY_ID, PRODUCER_BY_ID, UPGRADE_BY_ID } from './content';
import { newState } from './game';
import type { State } from './types';

const KEY = 'coretura-clicker-save';
/** Where an unreadable save is parked, so a bad blob is recoverable by hand. */
const BROKEN_KEY = 'coretura-clicker-save-broken';
/** Sound is a device preference rather than progress, so restarting must not clear it. */
const SETTINGS_KEY = 'coretura-clicker-settings';

/** Offline earnings are capped at this many seconds of production. */
export const OFFLINE_CAP_SECONDS = 2 * 60 * 60;

/** A save's contents before validation: plain JSON, not yet trusted. */
export type SaveData = Record<string, unknown>;

export type Migration = (data: SaveData) => SaveData;

/**
 * Index i migrates version i+1 → i+2. To add one, append a function and leave
 * the existing entries alone; SAVE_VERSION follows the list, so it cannot drift:
 *
 *   const MIGRATIONS: Migration[] = [
 *     (d) => ({ ...d, rounds: 0, seedMult: 1 }), // v1 → v2: prestige arrives
 *   ];
 *
 * Migrations get whatever was on disk, so they must not assume a field is present.
 * Validation is not their job — sanitize() runs over the result either way.
 */
const MIGRATIONS: Migration[] = [];

export const SAVE_VERSION = MIGRATIONS.length + 1;

/** Applies every migration between `from` and the current version. Pure. */
export function runMigrations(from: number, data: SaveData, migrations: Migration[]): SaveData {
  let out = data;
  for (let i = Math.max(0, from - 1); i < migrations.length; i++) out = migrations[i](out);
  return out;
}

interface Envelope {
  v: number;
  state: SaveData;
}

interface SettingsShape {
  muted: boolean;
}

/**
 * `state` is always usable, so callers can play on regardless; `kind` only says
 * where it came from, and whether the player needs telling.
 */
export type LoadResult =
  | { kind: 'loaded'; state: State }
  | { kind: 'empty'; state: State }
  | { kind: 'broken'; state: State }
  | { kind: 'future'; state: State; storedVersion: number };

// --- Reading ------------------------------------------------------------------

export function load(): LoadResult {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { kind: 'empty', state: newState() };
  }
  if (!raw) return { kind: 'empty', state: newState() };

  const envelope = parseEnvelope(raw);
  if (!envelope) {
    quarantine(raw);
    return { kind: 'broken', state: newState() };
  }

  // A newer save means a stale bundle or a rollback. Leave it untouched and
  // start a throwaway session — save() will refuse to write over it.
  if (envelope.v > SAVE_VERSION) {
    return { kind: 'future', state: newState(), storedVersion: envelope.v };
  }

  try {
    const migrated = runMigrations(envelope.v, envelope.state, MIGRATIONS);
    return { kind: 'loaded', state: sanitize(migrated) };
  } catch {
    quarantine(raw);
    return { kind: 'broken', state: newState() };
  }
}

function parseEnvelope(raw: string): Envelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const { v, state } = parsed;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return null;
  if (!isRecord(state)) return null;
  return { v, state };
}

/** Parks an unreadable blob, and only drops the original once it is safely copied. */
function quarantine(raw: string): void {
  try {
    localStorage.setItem(BROKEN_KEY, raw);
  } catch {
    return; // keeping the original beats losing it
  }
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// --- Validation ---------------------------------------------------------------

/**
 * Turns migrated data into a State that the rest of the game can trust, so the
 * invariant afterwards is that every id in State is one content.ts still knows.
 */
function sanitize(d: SaveData): State {
  const s = newState();
  s.loc = num(d.loc);
  s.funding = num(d.funding);
  s.clicks = Math.floor(num(d.clicks));
  s.owned = ownedFrom(d.owned);
  s.upgrades = knownIds(d.upgrades, UPGRADE_BY_ID);
  s.achievements = knownIds(d.achievements, ACHIEVEMENT_BY_ID);
  s.lastSaved = lastSavedFrom(d.lastSaved);
  return s;
}

/** Only producers that still exist, at whole positive counts. */
function ownedFrom(v: unknown): Record<string, number> {
  const owned: Record<string, number> = {};
  if (!isRecord(v)) return owned;
  for (const [id, count] of Object.entries(v)) {
    if (!(id in PRODUCER_BY_ID)) continue;
    const n = Math.floor(num(count));
    if (n > 0) owned[id] = n;
  }
  return owned;
}

/**
 * Ids that content.ts no longer knows are dropped rather than kept: derive()
 * skips them when working out output, but `upgrades.size` drives AI Assistant
 * output and `achievements.size` drives code quality, so a stale id would be a
 * permanent free multiplier.
 */
function knownIds(v: unknown, known: Record<string, unknown>): Set<string> {
  if (!Array.isArray(v)) return new Set();
  const ids: unknown[] = v;
  return new Set(ids.filter((id): id is string => typeof id === 'string' && id in known));
}

/** A missing or future timestamp would pay out offline earnings on the next load. */
function lastSavedFrom(v: unknown): number {
  const now = Date.now();
  const t = num(v);
  return t > 0 && t <= now ? t : now;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Finite and non-negative, or zero — nothing else is worth trusting. */
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);

// --- Writing ------------------------------------------------------------------

export function save(s: State): void {
  saveSettings(s); // a device preference, so it is written either way

  // Guarding here rather than in the caller means no call site can get it wrong,
  // and it also covers two tabs running different bundles.
  if (storedVersion() > SAVE_VERSION) return;

  s.lastSaved = Date.now();
  const envelope: Envelope = {
    v: SAVE_VERSION,
    state: {
      loc: s.loc,
      funding: s.funding,
      clicks: s.clicks,
      owned: s.owned,
      upgrades: [...s.upgrades],
      achievements: [...s.achievements],
      lastSaved: s.lastSaved,
    },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // storage full or unavailable — the game keeps running in memory
  }
}

/** The version on disk, or 0 when there is nothing readable there. */
function storedVersion(): number {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (parseEnvelope(raw)?.v ?? 0) : 0;
  } catch {
    return 0;
  }
}

export function wipe(): void {
  for (const key of [KEY, BROKEN_KEY]) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}

// --- Settings -----------------------------------------------------------------

export function saveSettings(s: State): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: s.muted } satisfies SettingsShape));
  } catch {
    // storage full or unavailable
  }
}

/** Overlays the stored preference, leaving whatever the state had if there is none. */
export function applySettings(s: State): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (isRecord(parsed) && typeof parsed.muted === 'boolean') s.muted = parsed.muted;
  } catch {
    // ignore
  }
}
