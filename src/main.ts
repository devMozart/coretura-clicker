import './style.css';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, BURST_INTERVAL, MILESTONES } from './content';
import { accrue, checkAchievements, click, derive, earn, pruneEffects, tick } from './game';
import { EventDirector } from './events';
import { fmt } from './format';
import { applySettings, load, OFFLINE_CAP_SECONDS, save, saveSettings, wipe } from './save';
import { UI } from './ui';
import { sound } from './fx';
import { inject } from '@vercel/analytics';

// Production only: in dev this would pull a script off Vercel's CDN, and the
// rest of the game is deliberately self-hosted and offline-capable.
if (import.meta.env.PROD) inject();

const loaded = load();
const state = loaded.state;
applySettings(state);
const ui = new UI(state);

if (loaded.kind === 'broken') {
  ui.toast(
    '⚠️',
    'Save could not be read',
    'Starting fresh — the old data was set aside, not deleted.',
    'toast-bad',
  );
} else if (loaded.kind === 'future') {
  ui.toast(
    '⏳',
    'Save is newer than this version',
    'Your progress is safe and untouched. Reload to pick up the newer version.',
    'toast-bad',
  );
}

// Offline progress: production continues while away, capped. Only a save that
// actually loaded has elapsed time worth paying out.
if (loaded.kind === 'loaded') {
  const away = (Date.now() - state.lastSaved) / 1000;
  if (away > 10) {
    const d = derive(state);
    const earned = d.locPerSec * Math.min(away, OFFLINE_CAP_SECONDS);
    if (earned > 0) {
      state.loc += earned;
      state.funding += earned;
      ui.toast('🌙', 'While you were away…', `The team shipped ${fmt(earned)} LoC`, 'toast-good');
    }
  }
}

const announceAchievement = (id: string) => {
  const a = ACHIEVEMENT_BY_ID[id];
  if (!a) return;
  ui.toast('🏆', a.name, `${a.desc} (+1% code quality)`);
  const milestone = MILESTONES[id];
  if (milestone) {
    ui.celebrate(milestone, a.name);
    sound.milestone();
  } else {
    sound.achievement();
  }
};

const events = new EventDirector(state, ui.stageEl, {
  toast: (icon, title, body, cls) => ui.toast(icon, title, body, cls),
  achievementEarned: announceAchievement,
  fmt,
});

ui.onCoreClick = (x, y) => {
  const gained = click(state, derive(state));
  ui.clickFeedback(gained, x, y);
};
ui.onPurchase = () => runChecks();
ui.onRestart = () => hardReset();

function runChecks(): void {
  for (const id of checkAchievements(state, derive(state))) announceAchievement(id);
}

/** Long enough away that the catch-up is worth a word, rather than a silent jump. */
const CATCH_UP_TOAST_SECONDS = 60;

// Production runs off elapsed wall-clock time, not off frames: a hidden tab
// stops firing requestAnimationFrame, so anything driven by frame deltas simply
// stops earning. settle() is called from the loop, before every save, and when
// the tab comes back, so no stretch of time goes unpaid.
let lastAccrual = Date.now();
let burstClock = 0;

function settle(now = Date.now()): void {
  const elapsed = (now - lastAccrual) / 1000;
  lastAccrual = now;

  const d = derive(state, now);
  const a = accrue(elapsed, burstClock, OFFLINE_CAP_SECONDS);
  burstClock = a.burstClock;
  tick(state, d, a.seconds);

  // Consultants deliver in lumps, and a long stretch owes every lump in it.
  if (a.bursts > 0 && d.burstPerSec > 0) {
    const amount = a.bursts * d.burstPerSec * BURST_INTERVAL;
    earn(state, amount);
    // a floater is cleaned up by animationend, which never fires while hidden
    if (document.visibilityState === 'visible') ui.burstFeedback(amount);
  }
}

function frame(): void {
  const now = Date.now();
  settle(now);
  events.update(now);
  ui.updateHud(now);
  requestAnimationFrame(frame);
}

// Background timers still fire now and then, so part of a long absence is paid
// off before the player looks again. Measuring from the moment the tab went away
// reports what the whole absence earned rather than only the last unpaid slice.
let hiddenAt: number | null = null;
let locWhenHidden = 0;

document.addEventListener('visibilitychange', () => {
  settle();
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    locWhenHidden = state.loc;
    return;
  }
  if (hiddenAt === null) return;
  const away = (Date.now() - hiddenAt) / 1000;
  const earned = state.loc - locWhenHidden;
  hiddenAt = null;
  if (away >= CATCH_UP_TOAST_SECONDS && earned > 0) {
    ui.toast('🌙', 'Caught up', `The team shipped ${fmt(earned)} LoC while you were away`, 'toast-good');
  }
});

// Store + unlock checks a few times per second — cheaper than per-frame.
setInterval(() => {
  pruneEffects(state, Date.now());
  runChecks();
  ui.refreshStore();
}, 250);

setInterval(() => {
  settle();
  save(state);
}, 5000);
const saveOnUnload = () => {
  settle();
  save(state);
};
window.addEventListener('beforeunload', saveOnUnload);

function hardReset(): void {
  window.removeEventListener('beforeunload', saveOnUnload);
  saveSettings(state); // progress goes, the sound choice stays
  wipe();
  location.reload();
}

document.getElementById('ach-total')!.textContent = String(ACHIEVEMENTS.length);

runChecks();
ui.refreshStore();
requestAnimationFrame(frame);

// Dev-only console handle for balancing/testing: __game.state, __game.earn(1e6)…
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = {
    state,
    earn: (n: number) => {
      state.loc += n;
      state.funding += n;
    },
    derive: () => derive(state),
    events,
    reset: hardReset,
  };
}
