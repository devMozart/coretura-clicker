// Click/feedback effects: floaters, pulse rings, and tiny synthesized sounds.
// No audio assets needed — everything is generated with WebAudio.

let audioCtx: AudioContext | null = null;
let isMuted = false;

export function setMuted(m: boolean): void {
  isMuted = m;
}

export const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function ctx(): AudioContext | null {
  if (isMuted) return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

function blip(
  freqFrom: number,
  freqTo: number,
  duration: number,
  volume = 0.06,
  type: OscillatorType = 'sine',
): void {
  const ac = ctx();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqTo), ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export const sound = {
  click: () => blip(520, 380, 0.07, 0.035, 'triangle'),
  buy: () => {
    blip(300, 440, 0.09, 0.05, 'sine');
    setTimeout(() => blip(440, 600, 0.1, 0.05, 'sine'), 70);
  },
  upgrade: () => {
    blip(400, 620, 0.1, 0.05, 'sine');
    setTimeout(() => blip(620, 880, 0.12, 0.05, 'sine'), 80);
  },
  achievement: () => {
    [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, f, 0.14, 0.05, 'sine'), i * 90));
  },
  milestone: () => {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, f, 0.22, 0.055, 'sine'), i * 110));
    setTimeout(() => blip(1568, 1568, 0.3, 0.04, 'triangle'), 520);
  },
  event: () => blip(700, 900, 0.12, 0.045, 'sine'),
  bad: () => blip(260, 140, 0.2, 0.05, 'sawtooth'),
};

/** Floating "+N" text rising from a point (stage coordinates). */
export function spawnFloater(layer: HTMLElement, x: number, y: number, text: string, cls = ''): void {
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.className = `floater ${cls}`;
  el.textContent = text;
  const drift = (Math.random() - 0.5) * 60;
  el.style.left = `${x + drift}px`;
  el.style.top = `${y}px`;
  el.style.setProperty('--rot', `${(Math.random() - 0.5) * 14}deg`);
  layer.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

export function spawnPulse(container: HTMLElement): void {
  if (reducedMotion()) return;
  const ring = document.createElement('div');
  ring.className = 'pulse-ring';
  container.appendChild(ring);
  ring.addEventListener('animationend', () => ring.remove());
}

const CONFETTI_COLORS = ['#06afe3', '#008fc9', '#f64370', '#f2f1ed'];
const CONFETTI_PIECES = 80;

/**
 * A screen-wide milestone moment: confetti across the viewport behind a centred
 * headline. Every piece cleans itself up on animationend, like the floaters.
 */
export function spawnCelebration(layer: HTMLElement, headline: string, sub: string): void {
  if (reducedMotion()) return; // the achievement toast still announces it

  const banner = document.createElement('div');
  banner.className = 'milestone';
  banner.innerHTML = `<strong>${headline}</strong><span>${sub}</span>`;
  banner.addEventListener('animationend', () => banner.remove());
  layer.appendChild(banner);

  for (let i = 0; i < CONFETTI_PIECES; i++) {
    const piece = document.createElement('i');
    piece.className = 'confetti';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    piece.style.width = `${5 + Math.random() * 5}px`;
    piece.style.height = `${8 + Math.random() * 8}px`;
    piece.style.setProperty('--dx', `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty('--spin', `${540 + Math.random() * 720}deg`);
    piece.style.animationDuration = `${2.4 + Math.random() * 2.2}s`;
    piece.style.animationDelay = `${Math.random() * 0.5}s`;
    piece.addEventListener('animationend', () => piece.remove());
    layer.appendChild(piece);
  }
}
