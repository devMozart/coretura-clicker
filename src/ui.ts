import {
  ACHIEVEMENT_BY_ID,
  ACHIEVEMENTS,
  BURST_INTERVAL,
  PRODUCERS,
  PRODUCER_BY_ID,
  UPGRADE_BY_ID,
  UPGRADES,
} from './content';
import { bulkCost, buyProducer, buyUpgrade, derive, visibleUpgrades } from './game';
import { fmt, fmtRate } from './format';
import { reducedMotion, setMuted, sound, spawnCelebration, spawnFloater, spawnPulse } from './fx';
import type { State, UpgradeDef } from './types';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

export class UI {
  private locEl = el('loc');
  private lpsEl = el('lps');
  private fundingEl = el('funding');
  private qualityEl = el('quality');
  private effectsEl = el('effects');
  private effectsKey = '';
  private core = el<HTMLButtonElement>('core');
  private coreWrap = el('core-wrap');
  private floaters = el('floaters');
  private upgradeTray = el('upgrades');
  private ownedTray = el('owned');
  private ownedCount = el('owned-count');
  private achievementGrid = el('achievements');
  private achievementCount = el('ach-count');
  private producerList = el('producers');
  private toasts = el('toasts');
  private tooltip = el('tooltip');
  private menuBtn = el<HTMLButtonElement>('menu-btn');
  private menuPanel = el('menu-panel');
  private soundItem = el<HTMLButtonElement>('menu-sound');
  private restartItem = el<HTMLButtonElement>('menu-restart');
  private restartConfirm = el('menu-confirm');
  private stage = el('stage');
  private updatePrompt = el('update-prompt');
  private celebration = el('celebration');

  private buyAmount = 1;
  private producerRows = new Map<string, HTMLButtonElement>();
  private upgradeKey = '';
  private ownedKey = '';
  private achievementKey = '';
  private upgradeTab: 'store' | 'active' = 'store';

  constructor(private state: State) {
    this.wireCore();
    this.wireBuyToggle();
    this.wireUpgradeTabs();
    this.wireMenu();
    this.wireUpdatePrompt();
  }

  get stageEl(): HTMLElement {
    return this.stage;
  }

  // --- The click -------------------------------------------------------------

  onCoreClick: (x: number, y: number) => void = () => {};

  private wireCore(): void {
    this.core.addEventListener('click', (e) => {
      const rect = this.stage.getBoundingClientRect();
      const coreRect = this.core.getBoundingClientRect();
      const x = e.clientX || coreRect.left + coreRect.width / 2;
      const y = e.clientY || coreRect.top + coreRect.height / 4;
      this.onCoreClick(x - rect.left, y - rect.top);
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && e.target === document.body) {
        e.preventDefault();
        this.core.click();
      }
    });
  }

  clickFeedback(gained: number, x: number, y: number): void {
    spawnFloater(this.floaters, x, y - 30, `+${fmtRate(gained)}`);
    spawnPulse(this.coreWrap);
    sound.click();
    if (!reducedMotion()) {
      this.core.classList.remove('squash');
      void this.core.offsetWidth; // restart the animation
      this.core.classList.add('squash');
    }
  }

  // --- Controls ---------------------------------------------------------------

  private wireBuyToggle(): void {
    const toggle = el('buy-toggle');
    toggle.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.buyAmount = Number(btn.dataset.amount);
        toggle.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
        this.refreshStore();
      });
    });
  }

  private wireUpgradeTabs(): void {
    const tabs = el('upgrade-tabs');
    tabs.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.upgradeTab = btn.dataset.tab === 'active' ? 'active' : 'store';
        tabs.querySelectorAll('button').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
        });
        this.hideTooltip(); // the tile it belonged to is about to be hidden
        this.showUpgradeTab();
      });
    });
  }

  private showUpgradeTab(): void {
    const store = this.upgradeTab === 'store';
    this.upgradeTray.classList.toggle('hidden', !store);
    this.ownedTray.classList.toggle('hidden', store);
  }

  onRestart: () => void = () => {};

  private wireMenu(): void {
    this.renderSound();

    this.menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMenu(this.menuPanel.classList.contains('hidden'));
    });

    this.soundItem.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      this.renderSound();
    });

    // Restarting wipes the save, so it takes a second tap to go through.
    this.restartItem.addEventListener('click', () => this.armRestart(true));
    el('menu-cancel').addEventListener('click', () => this.armRestart(false));
    el('menu-wipe').addEventListener('click', () => this.onRestart());

    this.menuPanel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => this.toggleMenu(false));
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.menuPanel.classList.contains('hidden')) {
        this.toggleMenu(false);
        this.menuBtn.focus();
      }
    });
  }

  private toggleMenu(open: boolean): void {
    this.menuPanel.classList.toggle('hidden', !open);
    this.menuBtn.setAttribute('aria-expanded', String(open));
    if (!open) this.armRestart(false); // never reopen with a half-armed confirm
  }

  private armRestart(armed: boolean): void {
    this.restartItem.classList.toggle('hidden', armed);
    this.restartConfirm.classList.toggle('hidden', !armed);
  }

  // --- Update prompt --------------------------------------------------------

  /** Fired when the player accepts the waiting service worker. */
  onUpdateAccept: () => void = () => {};

  private updateAccepted = false;

  private wireUpdatePrompt(): void {
    el('update-now').addEventListener('click', () => {
      if (this.updateAccepted) return; // reloading takes a moment; only go once
      this.updateAccepted = true;
      const now = el<HTMLButtonElement>('update-now');
      const later = el<HTMLButtonElement>('update-later');
      now.disabled = true;
      later.disabled = true;
      now.textContent = 'Updating…'; // the prompt stays up until the reload lands
      this.onUpdateAccept();
    });
    el('update-later').addEventListener('click', () => this.hideUpdatePrompt());
  }

  /** A new version is waiting — ask rather than swapping it in underneath them. */
  showUpdatePrompt(): void {
    this.updatePrompt.classList.remove('hidden');
  }

  private hideUpdatePrompt(): void {
    this.updatePrompt.classList.add('hidden');
  }

  private renderSound(): void {
    const on = !this.state.muted;
    el('menu-sound-icon').textContent = on ? '🔊' : '🔇';
    el('menu-sound-label').textContent = on ? 'Sound on' : 'Sound off';
    this.soundItem.setAttribute('aria-checked', String(on));
    setMuted(this.state.muted);
  }

  // --- HUD (every frame) --------------------------------------------------------

  updateHud(now: number): void {
    const s = this.state;
    const d = derive(s, now);
    this.locEl.textContent = fmt(s.loc);
    this.lpsEl.textContent = `${fmtRate(d.locPerSec)} LoC/s`;
    this.fundingEl.textContent = `€${fmt(s.funding)}`;
    this.qualityEl.textContent = `+${s.achievements.size}%`;
    // Leave the descriptive title alone until there's a score, so crawlers index that one.
    if (s.loc > 0) document.title = `${fmt(s.loc)} LoC — Coretura Clicker`;

    const chips = s.effects
      .filter((e) => e.until > now)
      .map((e) => {
        const left = Math.ceil((e.until - now) / 1000);
        const label = e.mult >= 1 ? `×${e.mult}` : e.mult === 0 ? 'blocked' : `×${e.mult}`;
        const tone = e.mult >= 1 ? 'chip-good' : 'chip-bad';
        return `<span class="effect-chip ${tone}">${e.icon} ${e.name} ${label} — ${left}s</span>`;
      })
      .join('');
    if (chips !== this.effectsKey) {
      this.effectsKey = chips;
      this.effectsEl.innerHTML = chips;
    }
  }

  burstFeedback(amount: number): void {
    const stageRect = this.stage.getBoundingClientRect();
    const coreRect = this.core.getBoundingClientRect();
    const x = coreRect.left - stageRect.left + coreRect.width * (0.2 + Math.random() * 0.6);
    const y = coreRect.top - stageRect.top;
    spawnFloater(this.floaters, x, y, `💼 +${fmt(amount)}`, 'floater-burst');
  }

  // --- Store (a few times per second) --------------------------------------------

  onPurchase: () => void = () => {};

  refreshStore(): void {
    this.renderProducers();
    this.renderUpgrades();
    this.renderAchievements();
  }

  private renderAchievements(): void {
    const s = this.state;
    this.achievementCount.textContent = String(s.achievements.size);
    const key = ACHIEVEMENTS.map((a) => (s.achievements.has(a.id) ? a.id : '')).join(',');
    if (key === this.achievementKey) return;
    this.achievementKey = key;

    this.achievementGrid.innerHTML = '';
    for (const a of ACHIEVEMENTS) {
      const earned = s.achievements.has(a.id);
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = earned ? 'tile inert' : 'tile inert locked';
      tile.dataset.id = a.id;
      tile.innerHTML = `<span>${a.icon}</span>`;
      this.attachTooltip(tile, () => this.achievementTooltip(a.id));
      this.achievementGrid.appendChild(tile);
    }
  }

  private achievementTooltip(id: string): string {
    const a = ACHIEVEMENT_BY_ID[id];
    const earned = this.state.achievements.has(id);
    const status = earned ? 'Earned · +1% code quality' : 'Locked';
    return `<strong>${a.icon} ${a.name}</strong><em>${a.desc}</em><span>${status}</span>`;
  }

  private renderProducers(): void {
    const s = this.state;
    for (const p of PRODUCERS) {
      let row = this.producerRows.get(p.id);
      if (!row) {
        row = this.buildProducerRow(p.id);
        this.producerRows.set(p.id, row);
        this.producerList.appendChild(row);
      }
      const owned = s.owned[p.id] ?? 0;
      const cost = bulkCost(PRODUCER_BY_ID[p.id], owned, this.buyAmount);
      row.querySelector('.p-cost')!.textContent =
        this.buyAmount > 1 ? `€${fmt(cost)} for ${this.buyAmount}` : `€${fmt(cost)}`;
      row.querySelector('.p-owned')!.textContent = owned ? String(owned) : '';
      row.classList.toggle('unaffordable', s.funding < cost);
    }
  }

  private buildProducerRow(id: string): HTMLButtonElement {
    const p = PRODUCER_BY_ID[id];
    const row = document.createElement('button');
    row.className = 'producer-row';
    row.dataset.id = id;
    row.innerHTML = `
      <span class="p-icon">${p.icon}</span>
      <span class="p-main">
        <span class="p-name">${p.name}</span>
        <span class="p-cost"></span>
      </span>
      <span class="p-owned"></span>`;
    row.addEventListener('click', () => {
      if (buyProducer(this.state, id, this.buyAmount)) {
        sound.buy();
        this.refreshStore();
        this.onPurchase();
      }
    });
    this.attachTooltip(row, () => this.producerTooltip(id));
    return row;
  }

  private producerTooltip(id: string): string {
    const p = PRODUCER_BY_ID[id];
    const s = this.state;
    const owned = s.owned[id] ?? 0;
    const verb = p.kind === 'people' ? 'Hire' : p.kind === 'joke' ? 'Schedule' : 'Provision';
    let html = `<strong>${p.icon} ${p.name}</strong><em>${p.flavor}</em>
      <span>${verb} for €${fmt(costOfNext(s, id))} · ${fmtRate(Math.abs(p.baseCps))} LoC/s each${p.baseCps < 0 ? ' (negative!)' : ''}</span>`;
    const special = SPECIAL_NOTES[p.special ?? ''];
    if (special) html += `<span class="tip-special">${special}</span>`;
    if (owned > 0) {
      // Marginal contribution: what the whole game loses if these were gone.
      const d = derive(s);
      const without = derive({ ...s, owned: { ...s.owned, [id]: 0 } });
      const contribution = d.locPerSec - without.locPerSec;
      const pct = d.locPerSec > 0 ? Math.round((contribution / d.locPerSec) * 100) : 0;
      html += `<span>You have ${owned}, contributing ${fmtRate(contribution)} LoC/s (${pct}% of total)</span>`;
    }
    return html;
  }

  private renderUpgrades(): void {
    const s = this.state;
    const visible = visibleUpgrades(s);
    const key = visible.map((u) => u.id).join(',');
    if (key !== this.upgradeKey) {
      this.upgradeKey = key;
      this.upgradeTray.innerHTML = '';
      for (const u of visible) {
        const btn = document.createElement('button');
        btn.className = 'tile';
        btn.dataset.id = u.id;
        btn.innerHTML = `<span>${u.icon}</span>`;
        btn.addEventListener('click', () => {
          if (buyUpgrade(s, u.id)) {
            sound.upgrade();
            this.hideTooltip();
            this.refreshStore();
            this.onPurchase();
          }
        });
        this.attachTooltip(btn, () => this.upgradeTooltip(u));
        this.upgradeTray.appendChild(btn);
      }
    }
    this.upgradeTray.querySelectorAll<HTMLButtonElement>('.tile').forEach((btn) => {
      const u = UPGRADE_BY_ID[btn.dataset.id!];
      btn.classList.toggle('unaffordable', s.funding < u.cost);
    });
    this.upgradeTray.classList.toggle('empty', visible.length === 0);
    this.renderOwned();
  }

  private renderOwned(): void {
    const s = this.state;
    const owned = UPGRADES.filter((u) => s.upgrades.has(u.id));
    this.ownedCount.textContent = String(owned.length);
    const key = owned.map((u) => u.id).join(',');
    if (key === this.ownedKey) return;
    this.ownedKey = key;

    this.ownedTray.innerHTML = '';
    for (const u of owned) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile inert';
      tile.dataset.id = u.id;
      tile.innerHTML = `<span>${u.icon}</span>`;
      this.attachTooltip(tile, () => this.upgradeTooltip(u, true));
      this.ownedTray.appendChild(tile);
    }
    this.ownedTray.classList.toggle('empty', owned.length === 0);
    this.showUpgradeTab();
  }

  private upgradeTooltip(u: UpgradeDef, owned = false): string {
    const price = owned ? 'Owned' : `€${fmt(u.cost)}`;
    return `<strong>${u.icon} ${u.name}</strong><em>${u.flavor}</em><span>${price}</span>`;
  }

  // --- Tooltip -----------------------------------------------------------------

  private attachTooltip(target: HTMLElement, html: () => string): void {
    target.addEventListener('pointerenter', () => {
      this.tooltip.innerHTML = html();
      this.tooltip.classList.remove('hidden');
      const r = target.getBoundingClientRect();
      const t = this.tooltip.getBoundingClientRect();
      const left = Math.max(8, r.left - t.width - 12);
      const top = Math.min(
        Math.max(8, r.top + r.height / 2 - t.height / 2),
        window.innerHeight - t.height - 8,
      );
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    });
    target.addEventListener('pointerleave', () => this.hideTooltip());
  }

  private hideTooltip(): void {
    this.tooltip.classList.add('hidden');
  }

  // --- Milestones -----------------------------------------------------------------

  /** A screen-wide moment for the thresholds that deserve one. */
  celebrate(headline: string, sub: string): void {
    spawnCelebration(this.celebration, headline, sub);
  }

  // --- Toasts ---------------------------------------------------------------------

  toast(icon: string, title: string, body: string, cls = ''): void {
    const node = document.createElement('div');
    node.className = `toast ${cls}`;
    node.innerHTML = `<span class="toast-icon">${icon}</span>
      <span class="toast-text"><strong>${title}</strong><span>${body}</span></span>`;
    this.toasts.appendChild(node);
    setTimeout(() => {
      node.classList.add('leaving');
      node.addEventListener('transitionend', () => node.remove(), { once: true });
      setTimeout(() => node.remove(), 600); // fallback
    }, 4200);
    while (this.toasts.children.length > 4) this.toasts.firstElementChild?.remove();
  }
}

const SPECIAL_NOTES: Record<string, string> = {
  burst: `Delivers everything as one lump every ${BURST_INTERVAL}s`,
  techlead: 'Each one: +2% output to all people',
  ai: 'Own output +5% per upgrade you own',
  devops: 'Each one: +1% to ALL production',
};

function costOfNext(s: State, id: string): number {
  return bulkCost(PRODUCER_BY_ID[id], s.owned[id] ?? 0, 1);
}
