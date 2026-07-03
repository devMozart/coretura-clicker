import { BURST_INTERVAL, PRODUCERS, PRODUCER_BY_ID, UPGRADE_BY_ID } from './content';
import { bulkCost, buyProducer, buyUpgrade, derive, visibleUpgrades } from './game';
import { fmt, fmtRate } from './format';
import { reducedMotion, setMuted, sound, spawnFloater, spawnPulse } from './fx';
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
  private producerList = el('producers');
  private toasts = el('toasts');
  private tooltip = el('tooltip');
  private muteBtn = el<HTMLButtonElement>('mute');
  private stage = el('stage');

  private buyAmount = 1;
  private producerRows = new Map<string, HTMLButtonElement>();
  private upgradeKey = '';

  constructor(private state: State) {
    this.wireCore();
    this.wireBuyToggle();
    this.wireMute();
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

  private wireMute(): void {
    this.renderMute();
    this.muteBtn.addEventListener('click', () => {
      this.state.muted = !this.state.muted;
      setMuted(this.state.muted);
      this.renderMute();
    });
  }

  private renderMute(): void {
    this.muteBtn.textContent = this.state.muted ? '🔇' : '🔊';
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
    document.title = `${fmt(s.loc)} LoC — Coretura Clicker`;

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

  /** Consultant deliverable landing: a chunky floater near the Core. */
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
  }

  private renderProducers(): void {
    const s = this.state;
    for (const p of PRODUCERS) {
      if (!s.revealed.has(p.id)) continue;
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
        btn.className = 'upgrade-btn';
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
    this.upgradeTray.querySelectorAll<HTMLButtonElement>('.upgrade-btn').forEach((btn) => {
      const u = UPGRADE_BY_ID[btn.dataset.id!];
      btn.classList.toggle('unaffordable', s.funding < u.cost);
    });
    this.upgradeTray.classList.toggle('empty', visible.length === 0);
  }

  private upgradeTooltip(u: UpgradeDef): string {
    return `<strong>${u.icon} ${u.name}</strong><em>${u.flavor}</em><span>€${fmt(u.cost)}</span>`;
  }

  // --- Tooltip -----------------------------------------------------------------

  private attachTooltip(target: HTMLElement, html: () => string): void {
    target.addEventListener('pointerenter', () => {
      this.tooltip.innerHTML = html();
      this.tooltip.classList.remove('hidden');
      const r = target.getBoundingClientRect();
      const t = this.tooltip.getBoundingClientRect();
      const left = Math.max(8, r.left - t.width - 12);
      const top = Math.min(Math.max(8, r.top + r.height / 2 - t.height / 2), window.innerHeight - t.height - 8);
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${top}px`;
    });
    target.addEventListener('pointerleave', () => this.hideTooltip());
  }

  private hideTooltip(): void {
    this.tooltip.classList.add('hidden');
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
