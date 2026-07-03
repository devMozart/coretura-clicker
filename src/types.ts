export type ProducerKind = 'people' | 'infra' | 'joke';

/**
 * Mechanical identity beyond plain LoC/s:
 * - burst:    output is delivered as one lump every few seconds instead of continuously
 * - techlead: each owned gives +2% output to all 'people' producers
 * - ai:       output scales +5% per upgrade owned anywhere
 * - devops:   each owned gives +1% to ALL production
 */
export type ProducerSpecial = 'burst' | 'techlead' | 'ai' | 'devops';

export interface ProducerDef {
  id: string;
  name: string;
  icon: string;
  baseCost: number;
  baseCps: number;
  flavor: string;
  kind: ProducerKind;
  special?: ProducerSpecial;
}

export type UpgradeEffect =
  | { type: 'click'; mult: number }
  | { type: 'clickCpsPercent'; percent: number }
  | { type: 'global'; mult: number }
  | { type: 'producer'; producerId: string; mult: number }
  /** target gains +percent% output per owned unit of `per` */
  | { type: 'synergy'; producerId: string; per: string; percent: number }
  /** replaces a producer's base LoC/s outright (the Meeting redemption arc) */
  | { type: 'override'; producerId: string; cps: number };

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  flavor: string;
  effect: UpgradeEffect;
  unlocked: (s: State) => boolean;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (s: State, d: Derived) => boolean;
}

/** A timed buff or debuff, usually from an event. Several can be active at once. */
export interface TimedEffect {
  id: string;
  name: string;
  icon: string;
  /** what the multiplier applies to */
  kind: 'production' | 'click' | 'people' | 'producer';
  producerId?: string;
  mult: number;
  until: number; // ms epoch
}

export interface State {
  /** All-time Lines of Code — the score. Never spent. */
  loc: number;
  /** Funding (€) — the spend currency. Earned by shipping code. */
  funding: number;
  clicks: number;
  owned: Record<string, number>;
  upgrades: Set<string>;
  achievements: Set<string>;
  revealed: Set<string>;
  effects: TimedEffect[];
  muted: boolean;
  lastSaved: number;
}

export interface Derived {
  /** headline rate incl. burst producers' average output */
  locPerSec: number;
  /** what actually trickles in every tick (excludes burst producers) */
  continuousPerSec: number;
  /** average LoC/s delivered via bursts */
  burstPerSec: number;
  clickValue: number;
  globalMult: number;
}
