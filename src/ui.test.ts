// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACHIEVEMENTS, PRODUCERS } from './content';
import { newState } from './game';
import { mountPage } from './test-dom';
import type { State } from './types';
import { UI } from './ui';

/** Fresh page markup and a fresh UI for every test. */
function setup(patch: Partial<State> = {}): { state: State; ui: UI } {
  mountPage();
  const state = { ...newState(), ...patch };
  return { state, ui: new UI(state) };
}

const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const q = (sel: string) => document.querySelector(sel)!;
const all = (sel: string) => [...document.querySelectorAll(sel)];

/** A real bubbling click — several handlers live on document, not the target. */
function click(node: Element): void {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

const hover = (node: Element) => node.dispatchEvent(new Event('pointerenter'));
const row = (id: string) => q(`.producer-row[data-id="${id}"]`);

describe('the page contract', () => {
  it('resolves every id UI needs from the shipped index.html', () => {
    // UI's constructor throws `missing #id` for anything absent, so this is the
    // guard against renaming an id in index.html and only finding out in a browser.
    expect(() => setup()).not.toThrow();
  });
});

describe('menu', () => {
  it('starts closed', () => {
    setup();
    expect(el('menu-panel').classList.contains('hidden')).toBe(true);
    expect(el('menu-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('opens and closes on the button', () => {
    setup();
    click(el('menu-btn'));
    expect(el('menu-panel').classList.contains('hidden')).toBe(false);
    expect(el('menu-btn').getAttribute('aria-expanded')).toBe('true');

    click(el('menu-btn'));
    expect(el('menu-panel').classList.contains('hidden')).toBe(true);
    expect(el('menu-btn').getAttribute('aria-expanded')).toBe('false');
  });

  it('closes when you click outside it', () => {
    setup();
    click(el('menu-btn'));
    click(document.body);
    expect(el('menu-panel').classList.contains('hidden')).toBe(true);
  });

  it('stays open when you click inside it', () => {
    setup();
    click(el('menu-btn'));
    click(el('menu-panel'));
    expect(el('menu-panel').classList.contains('hidden')).toBe(false);
  });

  it('closes on Escape and puts focus back on the button', () => {
    setup();
    click(el('menu-btn'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el('menu-panel').classList.contains('hidden')).toBe(true);
    expect(document.activeElement).toBe(el('menu-btn'));
  });

  it('ignores Escape when already closed', () => {
    setup();
    el('menu-restart').focus();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    // no focus steal, because the handler is guarded on the panel being open
    expect(document.activeElement).toBe(el('menu-restart'));
  });
});

describe('sound toggle', () => {
  it('renders the stored preference on construction', () => {
    setup({ muted: true });
    expect(el('menu-sound-icon').textContent).toBe('🔇');
    expect(el('menu-sound-label').textContent).toBe('Sound off');
    expect(el('menu-sound').getAttribute('aria-checked')).toBe('false');
  });

  it('flips state and label on click', () => {
    const { state } = setup();
    expect(el('menu-sound-label').textContent).toBe('Sound on');

    click(el('menu-sound'));
    expect(state.muted).toBe(true);
    expect(el('menu-sound-icon').textContent).toBe('🔇');
    expect(el('menu-sound').getAttribute('aria-checked')).toBe('false');

    click(el('menu-sound'));
    expect(state.muted).toBe(false);
    expect(el('menu-sound-label').textContent).toBe('Sound on');
  });
});

describe('restart confirm', () => {
  it('takes a second tap, and only then fires onRestart', () => {
    const { ui } = setup();
    const onRestart = vi.fn();
    ui.onRestart = onRestart;

    click(el('menu-btn'));
    click(el('menu-restart'));
    expect(el('menu-restart').classList.contains('hidden')).toBe(true);
    expect(el('menu-confirm').classList.contains('hidden')).toBe(false);
    expect(onRestart).not.toHaveBeenCalled();

    click(el('menu-wipe'));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('cancels back to the plain menu item', () => {
    const { ui } = setup();
    ui.onRestart = vi.fn();
    click(el('menu-btn'));
    click(el('menu-restart'));
    click(el('menu-cancel'));
    expect(el('menu-restart').classList.contains('hidden')).toBe(false);
    expect(el('menu-confirm').classList.contains('hidden')).toBe(true);
  });

  it('never reopens half-armed', () => {
    setup();
    click(el('menu-btn'));
    click(el('menu-restart')); // armed
    click(el('menu-btn')); // closed while armed
    click(el('menu-btn')); // reopened

    expect(el('menu-restart').classList.contains('hidden')).toBe(false);
    expect(el('menu-confirm').classList.contains('hidden')).toBe(true);
  });
});

describe('share dialog', () => {
  /** happy-dom has no canvas, so renderCard bails and we get the fallback. */
  const openShare = async () => {
    click(el('menu-btn'));
    click(el('menu-share'));
    await vi.waitFor(() => {
      if (el('share-pending').textContent === 'Rendering…') throw new Error('still rendering');
    });
  };

  it('starts closed', () => {
    setup();
    expect(el('share-backdrop').classList.contains('hidden')).toBe(true);
  });

  it('opens from the menu, and closes the menu behind it', async () => {
    setup();
    await openShare();
    expect(el('share-backdrop').classList.contains('hidden')).toBe(false);
    expect(el('menu-panel').classList.contains('hidden')).toBe(true);
  });

  it('says so rather than hanging when the card cannot be drawn', async () => {
    setup();
    await openShare();
    expect(el('share-pending').textContent).toContain('Could not render');
    expect(el('share-pending').classList.contains('hidden')).toBe(false);
  });

  it('offers neither Share nor Copy when the browser supports neither', async () => {
    setup();
    await openShare();
    expect(el('share-send').classList.contains('hidden')).toBe(true);
    expect(el('share-copy').classList.contains('hidden')).toBe(true);
  });

  it('closes on the Close button and hands focus back to the menu', async () => {
    setup();
    await openShare();
    click(el('share-close'));
    expect(el('share-backdrop').classList.contains('hidden')).toBe(true);
    expect(document.activeElement?.id).toBe('menu-btn');
  });

  it('closes on Escape', async () => {
    setup();
    await openShare();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(el('share-backdrop').classList.contains('hidden')).toBe(true);
  });

  it('closes when the backdrop is clicked but not the dialog itself', async () => {
    setup();
    await openShare();
    click(el('share-dialog'));
    expect(el('share-backdrop').classList.contains('hidden')).toBe(false);
    click(el('share-backdrop'));
    expect(el('share-backdrop').classList.contains('hidden')).toBe(true);
  });
});

describe('the Core', () => {
  it('reports a click', () => {
    const { ui } = setup();
    const onCoreClick = vi.fn();
    ui.onCoreClick = onCoreClick;
    click(el('core'));
    expect(onCoreClick).toHaveBeenCalledOnce();
  });

  it('is clicked by Space, but only from the page body', () => {
    const { ui } = setup();
    const onCoreClick = vi.fn();
    ui.onCoreClick = onCoreClick;

    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(onCoreClick).toHaveBeenCalledOnce();

    // typing Space while a button is focused must not double as a Core click
    el('menu-btn').dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', bubbles: true }));
    expect(onCoreClick).toHaveBeenCalledOnce();
  });

  it('spawns a floater on feedback', () => {
    const { ui } = setup();
    ui.clickFeedback(1, 10, 10);
    expect(el('floaters').children.length).toBe(1);
    expect(el('floaters').firstElementChild!.textContent).toBe('+1');
  });
});

describe('producer rows', () => {
  it('renders one row per producer', () => {
    const { ui } = setup();
    ui.refreshStore();
    expect(all('.producer-row').length).toBe(PRODUCERS.length);
    expect(q('.producer-row .p-name').textContent).toBe('Intern');
  });

  it('reuses the same row nodes across refreshes', () => {
    const { ui } = setup();
    ui.refreshStore();
    const first = row('intern');
    ui.refreshStore();
    ui.refreshStore();
    expect(all('.producer-row').length).toBe(PRODUCERS.length);
    expect(row('intern')).toBe(first);
  });

  it('shows the next unit price, and a bulk price at ×10', () => {
    const { ui } = setup();
    ui.refreshStore();
    expect(row('intern').querySelector('.p-cost')!.textContent).toBe('€15');

    click(q('#buy-toggle button[data-amount="10"]'));
    const bulk = row('intern').querySelector('.p-cost')!.textContent;
    expect(bulk).toMatch(/ for 10$/);
    expect(bulk).not.toBe('€15');
  });

  it('marks rows you cannot afford', () => {
    const { state, ui } = setup();
    ui.refreshStore();
    expect(row('intern').classList.contains('unaffordable')).toBe(true);

    state.funding = 15;
    ui.refreshStore();
    expect(row('intern').classList.contains('unaffordable')).toBe(false);
  });

  it('shows an owned count only once you own some', () => {
    const { state, ui } = setup();
    ui.refreshStore();
    expect(row('intern').querySelector('.p-owned')!.textContent).toBe('');

    state.owned.intern = 3;
    ui.refreshStore();
    expect(row('intern').querySelector('.p-owned')!.textContent).toBe('3');
  });

  it('buys on click and announces the purchase', () => {
    const { state, ui } = setup({ funding: 15 });
    const onPurchase = vi.fn();
    ui.onPurchase = onPurchase;
    ui.refreshStore();

    click(row('intern'));
    expect(state.owned.intern).toBe(1);
    expect(state.funding).toBe(0);
    expect(onPurchase).toHaveBeenCalledOnce();
    expect(row('intern').querySelector('.p-owned')!.textContent).toBe('1');
  });

  it('does nothing when you cannot afford it', () => {
    const { state, ui } = setup({ funding: 14 });
    const onPurchase = vi.fn();
    ui.onPurchase = onPurchase;
    ui.refreshStore();

    click(row('intern'));
    expect(state.owned.intern).toBeUndefined();
    expect(state.funding).toBe(14);
    expect(onPurchase).not.toHaveBeenCalled();
  });

  it('buys the whole batch at ×10', () => {
    const { state, ui } = setup({ funding: 1e6 });
    ui.refreshStore();
    click(q('#buy-toggle button[data-amount="10"]'));
    click(row('intern'));
    expect(state.owned.intern).toBe(10);
  });
});

describe('buy toggle', () => {
  it('moves the active class to the chosen amount', () => {
    setup();
    const [x1, x10] = all('#buy-toggle button');
    expect(x1.classList.contains('active')).toBe(true);

    click(x10);
    expect(x10.classList.contains('active')).toBe(true);
    expect(x1.classList.contains('active')).toBe(false);
  });
});

describe('upgrades', () => {
  it('shows nothing, and reads as empty, before any unlock', () => {
    const { ui } = setup();
    ui.refreshStore();
    expect(all('#upgrades .tile').length).toBe(0);
    expect(el('upgrades').classList.contains('empty')).toBe(true);
  });

  it('reveals an upgrade once its unlock condition is met', () => {
    const { ui } = setup({ clicks: 10 });
    ui.refreshStore();
    expect(all('#upgrades .tile').map((t) => (t as HTMLElement).dataset.id)).toEqual(['keyboard']);
    expect(el('upgrades').classList.contains('empty')).toBe(false);
  });

  it('marks upgrades you cannot afford', () => {
    const { state, ui } = setup({ clicks: 10 });
    ui.refreshStore();
    expect(q('#upgrades .tile').classList.contains('unaffordable')).toBe(true);

    state.funding = 100;
    ui.refreshStore();
    expect(q('#upgrades .tile').classList.contains('unaffordable')).toBe(false);
  });

  it('moves a bought upgrade into the Active tray', () => {
    const { state, ui } = setup({ clicks: 10, funding: 100 });
    const onPurchase = vi.fn();
    ui.onPurchase = onPurchase;
    ui.refreshStore();

    click(q('#upgrades .tile'));
    expect(state.upgrades.has('keyboard')).toBe(true);
    expect(state.funding).toBe(0);
    expect(onPurchase).toHaveBeenCalledOnce();

    expect(all('#upgrades .tile').length).toBe(0);
    expect(all('#owned .tile').map((t) => (t as HTMLElement).dataset.id)).toEqual(['keyboard']);
    expect(q('#owned .tile').classList.contains('inert')).toBe(true);
    expect(el('owned-count').textContent).toBe('1');
  });
});

describe('upgrade tabs', () => {
  it('swaps which tray is visible', () => {
    setup();
    const [store, active] = all('#upgrade-tabs button');

    click(active);
    expect(el('upgrades').classList.contains('hidden')).toBe(true);
    expect(el('owned').classList.contains('hidden')).toBe(false);
    expect(active.getAttribute('aria-selected')).toBe('true');
    expect(store.getAttribute('aria-selected')).toBe('false');

    click(store);
    expect(el('upgrades').classList.contains('hidden')).toBe(false);
    expect(el('owned').classList.contains('hidden')).toBe(true);
    expect(store.getAttribute('aria-selected')).toBe('true');
  });

  it('keeps the chosen tab across a store refresh', () => {
    const { ui } = setup();
    click(all('#upgrade-tabs button')[1]);
    ui.refreshStore();
    expect(el('owned').classList.contains('hidden')).toBe(false);
    expect(el('upgrades').classList.contains('hidden')).toBe(true);
  });

  it('hides the tooltip, since the tile it belonged to is going away', () => {
    const { ui } = setup();
    ui.refreshStore();
    hover(row('intern'));
    expect(el('tooltip').classList.contains('hidden')).toBe(false);

    click(all('#upgrade-tabs button')[1]);
    expect(el('tooltip').classList.contains('hidden')).toBe(true);
  });
});

describe('achievements', () => {
  it('renders every achievement, locked to begin with', () => {
    const { ui } = setup();
    ui.refreshStore();
    expect(all('#achievements .tile').length).toBe(ACHIEVEMENTS.length);
    expect(all('#achievements .tile.locked').length).toBe(ACHIEVEMENTS.length);
    expect(el('ach-count').textContent).toBe('0');
  });

  it('unlocks the tile that was earned, and counts it', () => {
    const { state, ui } = setup();
    ui.refreshStore();
    state.achievements.add('hello');
    ui.refreshStore();

    expect(q('#achievements .tile[data-id="hello"]').classList.contains('locked')).toBe(false);
    expect(all('#achievements .tile.locked').length).toBe(ACHIEVEMENTS.length - 1);
    expect(el('ach-count').textContent).toBe('1');
  });
});

describe('tooltips', () => {
  it('fills in and reveals on hover, and hides again on leave', () => {
    const { ui } = setup();
    ui.refreshStore();
    expect(el('tooltip').classList.contains('hidden')).toBe(true);

    hover(row('intern'));
    expect(el('tooltip').classList.contains('hidden')).toBe(false);
    expect(el('tooltip').textContent).toContain('Intern');
    expect(el('tooltip').textContent).toContain('Hire for €15');

    row('intern').dispatchEvent(new Event('pointerleave'));
    expect(el('tooltip').classList.contains('hidden')).toBe(true);
  });

  it('adds a contribution line once you own some', () => {
    const { state, ui } = setup();
    ui.refreshStore();
    hover(row('intern'));
    expect(el('tooltip').textContent).not.toContain('You have');

    state.owned.intern = 3;
    ui.refreshStore();
    hover(row('intern'));
    expect(el('tooltip').textContent).toContain('You have 3');
    expect(el('tooltip').textContent).toContain('100% of total');
  });

  it('explains a producer special', () => {
    const { ui } = setup();
    ui.refreshStore();
    hover(row('techlead'));
    expect(q('.tip-special').textContent).toBe('Each one: +2% output to all people');
  });
});

describe('HUD', () => {
  it('writes the four readouts', () => {
    const { state, ui } = setup({ loc: 1234, funding: 5678 });
    state.achievements.add('hello');
    state.achievements.add('kilo');
    ui.updateHud(Date.now());

    expect(el('loc').textContent).toBe('1.23K');
    expect(el('funding').textContent).toBe('€5.68K');
    expect(el('quality').textContent).toBe('+2%');
    expect(el('lps').textContent).toBe('0 LoC/s');
  });

  it('leaves the descriptive title alone until there is a score', () => {
    const { state, ui } = setup();
    document.title = 'Coretura Clicker — an incremental game about shipping code';
    ui.updateHud(Date.now());
    expect(document.title).toBe('Coretura Clicker — an incremental game about shipping code');

    state.loc = 5000;
    ui.updateHud(Date.now());
    expect(document.title).toBe('5K LoC — Coretura Clicker');
  });

  it('shows a chip per live effect and drops the expired ones', () => {
    const now = Date.now();
    const { ui } = setup({
      effects: [
        { id: 'crunch', name: 'Crunch', icon: '🔥', kind: 'production', mult: 2, until: now + 5000 },
        { id: 'outage', name: 'Outage', icon: '💀', kind: 'production', mult: 0, until: now - 1 },
      ],
    });
    ui.updateHud(now);

    const chips = all('.effect-chip');
    expect(chips.length).toBe(1);
    expect(chips[0].textContent).toBe('🔥 Crunch ×2 — 5s');
    expect(chips[0].classList.contains('chip-good')).toBe(true);
  });

  it('labels a debuff as bad, and a total block as blocked', () => {
    const now = Date.now();
    const { ui } = setup({
      effects: [{ id: 'bug', name: 'Bug', icon: '🐛', kind: 'production', mult: 0, until: now + 3000 }],
    });
    ui.updateHud(now);
    expect(q('.effect-chip').textContent).toBe('🐛 Bug blocked — 3s');
    expect(q('.effect-chip').classList.contains('chip-bad')).toBe(true);
  });

  it('only rewrites the chips when they actually change', () => {
    const now = Date.now();
    const { ui } = setup({
      effects: [{ id: 'crunch', name: 'Crunch', icon: '🔥', kind: 'production', mult: 2, until: now + 5000 }],
    });
    ui.updateHud(now);
    const chip = q('.effect-chip');

    ui.updateHud(now); // same second — the memo should skip the innerHTML write
    expect(q('.effect-chip')).toBe(chip);

    ui.updateHud(now + 1500); // the countdown moved, so it must re-render
    expect(q('.effect-chip')).not.toBe(chip);
  });
});

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('appends with its icon, title and body', () => {
    const { ui } = setup();
    ui.toast('🌙', 'While you were away…', 'The team shipped 5K LoC', 'toast-good');

    const toast = q('.toast');
    expect(toast.classList.contains('toast-good')).toBe(true);
    expect(q('.toast-icon').textContent).toBe('🌙');
    expect(q('.toast-text strong').textContent).toBe('While you were away…');
  });

  it('keeps only the four most recent', () => {
    const { ui } = setup();
    for (const n of [1, 2, 3, 4, 5, 6]) ui.toast('🏆', `Toast ${n}`, 'body');

    const titles = all('.toast-text strong').map((n) => n.textContent);
    expect(titles).toEqual(['Toast 3', 'Toast 4', 'Toast 5', 'Toast 6']);
  });

  it('leaves, then removes itself', () => {
    const { ui } = setup();
    ui.toast('🏆', 'Hello, world', 'body');
    expect(q('.toast').classList.contains('leaving')).toBe(false);

    vi.advanceTimersByTime(4200);
    expect(q('.toast').classList.contains('leaving')).toBe(true);

    vi.advanceTimersByTime(600); // the fallback, for when transitionend never fires
    expect(document.querySelector('.toast')).toBeNull();
  });
});

describe('milestone celebration', () => {
  it('starts with an empty layer', () => {
    setup();
    expect(el('celebration').children.length).toBe(0);
  });

  it('shows the headline and the achievement name', () => {
    const { ui } = setup();
    ui.celebrate('1 MILLION LINES', 'Merge master');

    const banner = q('.milestone');
    expect(banner.querySelector('strong')!.textContent).toBe('1 MILLION LINES');
    expect(banner.querySelector('span')!.textContent).toBe('Merge master');
  });

  it('fills the screen with confetti', () => {
    const { ui } = setup();
    ui.celebrate('1 BILLION LINES', 'Billion-line codebase');
    expect(all('.confetti').length).toBeGreaterThan(20);
  });

  it('varies each piece, so it does not fall as one block', () => {
    const { ui } = setup();
    ui.celebrate('1 TRILLION LINES', 'Trillion-line era');
    const pieces = all('.confetti') as HTMLElement[];
    expect(new Set(pieces.map((p) => p.style.left)).size).toBeGreaterThan(10);
    expect(new Set(pieces.map((p) => p.style.animationDelay)).size).toBeGreaterThan(10);
    expect(new Set(pieces.map((p) => p.style.background)).size).toBe(4); // the brand palette
  });

  it('stays still for anyone who asked for reduced motion', () => {
    const { ui } = setup();
    vi.stubGlobal('matchMedia', () => ({ matches: true }) as MediaQueryList);
    ui.celebrate('1 MILLION LINES', 'Merge master');
    // no banner, no confetti — the achievement toast still carries the news
    expect(el('celebration').children.length).toBe(0);
    vi.unstubAllGlobals();
  });

  it('clears itself up as the animations end', () => {
    const { ui } = setup();
    ui.celebrate('1 MILLION LINES', 'Merge master');
    const layer = el('celebration');
    expect(layer.children.length).toBeGreaterThan(20);

    for (const node of [...layer.children]) node.dispatchEvent(new Event('animationend'));
    expect(layer.children.length).toBe(0);
  });
});

describe('save and load from a file', () => {
  /** A picked file, as the input would report it. */
  function pick(text: string): void {
    const input = el<HTMLInputElement>('import-file');
    const file = new File([text], 'save.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
  }

  it('asks the game for a file to save, and closes the menu', () => {
    const { ui } = setup();
    const onExport = vi.fn();
    ui.onExport = onExport;

    click(el('menu-btn'));
    click(el('menu-export'));

    expect(onExport).toHaveBeenCalledOnce();
    expect(el('menu-panel').classList.contains('hidden')).toBe(true);
  });

  it('opens the file picker from the menu', () => {
    setup();
    const input = el<HTMLInputElement>('import-file');
    const opened = vi.spyOn(input, 'click');

    click(el('menu-btn'));
    click(el('menu-import'));

    expect(opened).toHaveBeenCalledOnce();
  });

  it('does not import until the overwrite is confirmed', async () => {
    const { ui } = setup();
    const onImport = vi.fn();
    ui.onImport = onImport;

    click(el('menu-btn'));
    pick('{"v":1,"state":{"loc":5}}');
    await vi.waitFor(() => expect(el('import-confirm').classList.contains('hidden')).toBe(false));
    expect(onImport).not.toHaveBeenCalled();

    click(el('import-load'));
    expect(onImport).toHaveBeenCalledWith('{"v":1,"state":{"loc":5}}');
  });

  it('drops the pending file when the confirm is cancelled', async () => {
    const { ui } = setup();
    const onImport = vi.fn();
    ui.onImport = onImport;

    click(el('menu-btn'));
    pick('{"v":1,"state":{"loc":5}}');
    await vi.waitFor(() => expect(el('import-confirm').classList.contains('hidden')).toBe(false));

    click(el('import-cancel'));
    expect(el('import-confirm').classList.contains('hidden')).toBe(true);

    click(el('import-load')); // a stale press must do nothing
    expect(onImport).not.toHaveBeenCalled();
  });

  it('disarms the confirm when the menu closes, so it cannot fire later', async () => {
    const { ui } = setup();
    const onImport = vi.fn();
    ui.onImport = onImport;

    click(el('menu-btn'));
    pick('{"v":1,"state":{"loc":5}}');
    await vi.waitFor(() => expect(el('import-confirm').classList.contains('hidden')).toBe(false));

    click(document.body); // click away
    expect(el('import-confirm').classList.contains('hidden')).toBe(true);

    click(el('import-load'));
    expect(onImport).not.toHaveBeenCalled();
  });

  it('hands the file straight through, so validation stays in one place', async () => {
    const { ui } = setup();
    const onImport = vi.fn();
    ui.onImport = onImport;

    click(el('menu-btn'));
    pick('not a save at all');
    await vi.waitFor(() => expect(el('import-confirm').classList.contains('hidden')).toBe(false));
    click(el('import-load'));

    expect(onImport).toHaveBeenCalledWith('not a save at all');
  });

  it('offers a download without leaking the blob url', () => {
    const { ui } = setup();
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    ui.download('{"v":1}', 'run.json');

    expect(created).toHaveBeenCalledOnce();
    expect(revoked).toHaveBeenCalledWith('blob:test');
    created.mockRestore();
    revoked.mockRestore();
  });
});
