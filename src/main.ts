import './style.css';
import { ACHIEVEMENT_BY_ID, ACHIEVEMENTS, BURST_INTERVAL } from './content';
import { checkAchievements, click, derive, newState, pruneEffects, tick } from './game';
import { EventDirector } from './events';
import { fmt } from './format';
import { applySettings, load, OFFLINE_CAP_SECONDS, save, saveSettings, wipe } from './save';
import { UI } from './ui';
import { sound } from './fx';

const state = load() ?? newState();
applySettings(state);
const ui = new UI(state);

// Offline progress: production continues while away, capped.
{
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
  sound.achievement();
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

// Main loop: production + HUD every frame.
let last = performance.now();
let burstClock = 0;
function frame(nowFrame: number): void {
  const dt = Math.min((nowFrame - last) / 1000, 1);
  last = nowFrame;
  const now = Date.now();
  const d = derive(state, now);
  tick(state, d, dt);

  // Consultants deliver everything as one lump on a fixed cadence.
  burstClock += dt;
  if (burstClock >= BURST_INTERVAL) {
    burstClock -= BURST_INTERVAL;
    if (d.burstPerSec > 0) {
      const amount = d.burstPerSec * BURST_INTERVAL;
      state.loc += amount;
      state.funding += amount;
      ui.burstFeedback(amount);
    }
  }

  events.update(now);
  ui.updateHud(now);
  requestAnimationFrame(frame);
}

// Store + unlock checks a few times per second — cheaper than per-frame.
setInterval(() => {
  pruneEffects(state, Date.now());
  runChecks();
  ui.refreshStore();
}, 250);

setInterval(() => save(state), 5000);
const saveOnUnload = () => save(state);
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
