import { newState } from './game';
import type { State } from './types';

// v2: producer roster changed in the gameplay expansion — old saves are incompatible.
const KEY = 'coretura-clicker-save-v2';
/** Sound is a device preference rather than progress, so restarting must not clear it. */
const SETTINGS_KEY = 'coretura-clicker-settings';

/** Offline earnings are capped at this many seconds of production. */
export const OFFLINE_CAP_SECONDS = 2 * 60 * 60;

interface SaveShape {
  loc: number;
  funding: number;
  clicks: number;
  owned: Record<string, number>;
  upgrades: string[];
  achievements: string[];
  /** only read now — the sound preference lives under SETTINGS_KEY */
  muted?: boolean;
  lastSaved: number;
}

interface SettingsShape {
  muted: boolean;
}

export function saveSettings(s: State): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ muted: s.muted } satisfies SettingsShape));
  } catch {
    // storage full or unavailable
  }
}

/** Overlays the stored preference, leaving whatever the save had if there is none. */
export function applySettings(s: State): void {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) s.muted = (JSON.parse(raw) as SettingsShape).muted ?? s.muted;
  } catch {
    // ignore
  }
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
    lastSaved: s.lastSaved,
  };
  saveSettings(s);
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
