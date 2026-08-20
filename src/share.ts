// Renders a run card to a PNG the player can share. Canvas rather than the
// Playwright trick behind tools/social-card.html, which only works offline.

import bgUrl from './assets/bg1.avif';
import { fmt } from './format';

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const SITE = 'coretura-clicker.vercel.app';

export interface ShareTargets {
  canShare: boolean;
  canCopy: boolean;
}

/**
 * Which buttons the preview should offer. Save is always possible, so it is not
 * listed here; the other two depend on what the browser implements.
 */
export function shareTargets(nav: Navigator, win: typeof globalThis, file: File): ShareTargets {
  const share = typeof nav.share === 'function' && nav.canShare?.({ files: [file] }) === true;
  const copy = typeof nav.clipboard?.write === 'function' && typeof win.ClipboardItem === 'function';
  return { canShare: share, canCopy: copy };
}

/** "2.41Sp" is not filename-safe on every platform, so keep it to word characters. */
export function cardFilename(loc: number): string {
  const score = fmt(loc).replace(/[^\w.]/g, '');
  return `coretura-clicker-${score}-loc.png`;
}

/** Largest font size, stepping down, at which the score still fits the card. */
export function fitFontSize(measure: (size: number) => number, maxWidth: number, sizes: number[]): number {
  for (const size of sizes) {
    if (measure(size) <= maxWidth) return size;
  }
  return sizes[sizes.length - 1];
}

const HERO_SIZES = [190, 170, 150, 130, 112, 96];
/** The magnitude suffix is set smaller than the digits, and held off them. */
const UNIT_SCALE = 0.74;
const UNIT_GAP = 0.15;

/** "2.41Sx" -> digits and suffix, so the two can be set apart. */
export function splitScore(score: string): { value: string; unit: string } {
  const m = /^(-?[\d.]+)(.*)$/.exec(score);
  return m ? { value: m[1], unit: m[2] } : { value: score, unit: '' };
}

/** Serialises the Core already in the page: no fetch, and it works offline. */
function coreImage(): Promise<HTMLImageElement | null> {
  const svg = document.querySelector('#core svg');
  if (!svg) return Promise.resolve(null);
  const copy = svg.cloneNode(true) as SVGElement;
  // an SVG with only a viewBox has no intrinsic size, which some browsers
  // refuse to draw, so pin it before serialising
  copy.setAttribute('width', '180');
  copy.setAttribute('height', '180');
  const markup = new XMLSerializer().serializeToString(copy);
  return loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function paintBackdrop(ctx: CanvasRenderingContext2D, bg: HTMLImageElement | null): void {
  ctx.fillStyle = '#001220';
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  if (bg) {
    // cover, so the gradient fills the card whatever the source ratio is
    const scale = Math.max(CARD_WIDTH / bg.width, CARD_HEIGHT / bg.height);
    const w = bg.width * scale;
    const h = bg.height * scale;
    ctx.drawImage(bg, (CARD_WIDTH - w) / 2, (CARD_HEIGHT - h) / 2, w, h);
  } else {
    // no decode: approximate the brand gradient so the card still looks right
    const glow = ctx.createRadialGradient(820, 300, 40, 820, 300, 700);
    glow.addColorStop(0, 'rgba(0, 143, 201, 0.55)');
    glow.addColorStop(0.55, 'rgba(0, 143, 201, 0.16)');
    glow.addColorStop(1, 'rgba(0, 18, 32, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
    const blush = ctx.createRadialGradient(240, 520, 20, 240, 520, 560);
    blush.addColorStop(0, 'rgba(246, 67, 112, 0.3)');
    blush.addColorStop(1, 'rgba(246, 67, 112, 0)');
    ctx.fillStyle = blush;
    ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
  }

  // the stage's shade, so text stays legible over any part of the gradient
  const shade = ctx.createRadialGradient(
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    80,
    CARD_WIDTH / 2,
    CARD_HEIGHT / 2,
    CARD_WIDTH * 0.62,
  );
  shade.addColorStop(0, 'rgba(0, 18, 32, 0.25)');
  shade.addColorStop(1, 'rgba(0, 18, 32, 0.78)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  // blueprint grid, fading out towards the edges
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = 'rgba(6, 175, 227, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 60; x < CARD_WIDTH; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, CARD_HEIGHT);
    ctx.stroke();
  }
  for (let y = 60; y < CARD_HEIGHT; y += 60) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(CARD_WIDTH, y + 0.5);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws the card. Exported for the preview; call after fonts are ready. */
export function drawCard(
  ctx: CanvasRenderingContext2D,
  loc: number,
  bg: HTMLImageElement | null,
  core: HTMLImageElement | null,
): void {
  paintBackdrop(ctx, bg);

  const markSize = 54;
  const left = 72;
  const wordmarkY = 84;

  if (core) {
    ctx.save();
    ctx.shadowColor = 'rgba(6, 175, 227, 0.55)';
    ctx.shadowBlur = 26;
    ctx.drawImage(core, left, wordmarkY - markSize / 2 - 9, markSize, markSize);
    ctx.restore();
  }

  const textLeft = core ? left + markSize + 20 : left;
  ctx.textBaseline = 'middle';
  ctx.font = '700 30px "Space Grotesk", system-ui, sans-serif';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = '#f2f1ed';
  ctx.fillText('CORETURA ', textLeft, wordmarkY - 8);
  const coretura = ctx.measureText('CORETURA ').width;
  ctx.fillStyle = '#06afe3';
  ctx.fillText('CLICKER', textLeft + coretura, wordmarkY - 8);
  ctx.letterSpacing = '0px';

  // the score is the whole point of the card, so it gets the room
  const { value, unit } = splitScore(fmt(loc));
  const hero = (s: number) => `700 ${s}px "Space Grotesk", system-ui, sans-serif`;
  const unitSize = (s: number) => Math.round(s * UNIT_SCALE);
  const widths = (s: number) => {
    ctx.font = hero(s);
    const v = ctx.measureText(value).width;
    if (!unit) return { v, u: 0, gap: 0, total: v };
    ctx.font = hero(unitSize(s));
    const u = ctx.measureText(unit).width;
    const gap = s * UNIT_GAP;
    return { v, u, gap, total: v + gap + u };
  };
  const size = fitFontSize((s) => widths(s).total, CARD_WIDTH - 200, HERO_SIZES);
  const w = widths(size);

  // baseline-aligned, so the smaller suffix sits on the digits' feet. The offset
  // centres the number and its label together rather than the digits alone.
  const baseline = CARD_HEIGHT / 2 + size * 0.17;
  const startX = (CARD_WIDTH - w.total) / 2;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.save();
  ctx.shadowColor = 'rgba(6, 175, 227, 0.5)';
  ctx.shadowBlur = 44;
  ctx.fillStyle = '#f2f1ed';
  ctx.font = hero(size);
  ctx.fillText(value, startX, baseline);
  if (unit) {
    ctx.font = hero(unitSize(size));
    ctx.fillStyle = 'rgba(242, 241, 237, 0.92)';
    ctx.fillText(unit, startX + w.v + w.gap, baseline);
  }
  ctx.restore();

  ctx.textAlign = 'center';
  ctx.font = '500 27px "Space Grotesk", system-ui, sans-serif';
  ctx.letterSpacing = '10px';
  ctx.fillStyle = 'rgba(242, 241, 237, 0.72)';
  ctx.fillText('LINES OF CODE', CARD_WIDTH / 2 + 5, baseline + 58);
  ctx.letterSpacing = '0px';

  ctx.textAlign = 'right';
  ctx.font = '500 20px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = 'rgba(242, 241, 237, 0.45)';
  ctx.fillText(SITE, CARD_WIDTH - 72, CARD_HEIGHT - 54);

  ctx.textAlign = 'left';
}

/** Renders the run card and hands back a PNG. */
export async function renderCard(loc: number): Promise<Blob | null> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // without this the fonts silently fall back to the system stack
  await document.fonts?.ready;
  const [bg, core] = await Promise.all([loadImage(bgUrl), coreImage()]);
  drawCard(ctx, loc, bg, core);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}
