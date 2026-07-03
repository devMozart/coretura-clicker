import { newState } from './game';
import type { State } from './types';

// v2: producer roster changed in the gameplay expansion — old saves are incompatible.
const KEY = 'coretura-clicker-save-v2';

/** Offline earnings are capped at this many seconds of production. */
export const OFFLINE_CAP_SECONDS = 2 * 60 * 60;

interface SaveShape {
  loc: number;
  funding: number;
  clicks: number;
  owned: Record<string, number>;
  upgrades: string[];
  achievements: string[];
  revealed: string[];
  muted: boolean;
  lastSaved: number;
}

export function save(s: State): void {
  s.lastSaved = Date.now();
  const data: SaveShape = {
    loc: s.loc,
    funding: s.funding,
    clicks: s.clicks,
    owned: s.owned,
    upgrades: [...s.upgrades],
    achievements: [...s.achievements],
    revealed: [...s.revealed],
    muted: s.muted,
    lastSaved: s.lastSaved,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable — the game keeps running in memory
  }
}

export function load(): State | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<SaveShape>;
    const s = newState();
    s.loc = data.loc ?? 0;
    s.funding = data.funding ?? 0;
    s.clicks = data.clicks ?? 0;
    s.owned = data.owned ?? {};
    s.upgrades = new Set(data.upgrades ?? []);
    s.achievements = new Set(data.achievements ?? []);
    s.revealed = new Set(data.revealed ?? []);
    s.muted = data.muted ?? false;
    s.lastSaved = data.lastSaved ?? Date.now();
    return s;
  } catch {
    return null;
  }
}

export function wipe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
