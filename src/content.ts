import type { AchievementDef, ProducerDef, State, UpgradeDef } from './types';

// The data tables below are hand-aligned into columns, which is the only way the
// balance numbers read as a table — so each one is marked `// prettier-ignore`.

// ---------------------------------------------------------------------------
// Producers — people ladder first, then infrastructure. Balancing = editing
// these numbers. See ProducerSpecial for what the `special` flags do.
// ---------------------------------------------------------------------------

// prettier-ignore
export const PRODUCERS: ProducerDef[] = [
  { id: 'intern',     name: 'Intern',                   icon: '🧑‍💻', baseCost: 15,      baseCps: 0.1,    kind: 'people', flavor: 'Writes code. Occasionally correct code.' },
  { id: 'junior',     name: 'Junior Developer',         icon: '🧑‍🎓', baseCost: 100,     baseCps: 1,      kind: 'people', flavor: 'Ships features and the occasional footgun.' },
  { id: 'meeting',    name: 'Meeting',                  icon: '📅', baseCost: 666,     baseCps: -2,     kind: 'joke',   flavor: 'Produces −2 LoC/s. You keep scheduling them anyway.' },
  { id: 'senior',     name: 'Senior Developer',         icon: '👩‍💻', baseCost: 1.1e3,   baseCps: 8,      kind: 'people', flavor: 'Deletes more code than they write. It’s faster now.' },
  { id: 'cicd',       name: 'CI/CD Pipeline',           icon: '🔁', baseCost: 12e3,    baseCps: 47,     kind: 'infra',  flavor: 'Green means go. Red means Monday.' },
  { id: 'consultant', name: 'Consultant',               icon: '💼', baseCost: 130e3,   baseCps: 260,    kind: 'people', special: 'burst',    flavor: 'Invoices in bursts. Delivers in bursts too.' },
  { id: 'techlead',   name: 'Tech Lead',                icon: '🧭', baseCost: 1.4e6,   baseCps: 1.4e3,  kind: 'people', special: 'techlead', flavor: 'Writes almost no code. Everyone writes more.' },
  { id: 'ai',         name: 'AI Assistant',             icon: '🤖', baseCost: 20e6,    baseCps: 7.8e3,  kind: 'infra',  special: 'ai',       flavor: 'Improves with every tool you buy it.' },
  { id: 'devops',     name: 'DevOps Engineer',          icon: '🛠️', baseCost: 330e6,   baseCps: 44e3,   kind: 'people', special: 'devops',   flavor: 'Makes everything, everywhere, 1% better.' },
  { id: 'ngcp',       name: 'Connectivity Node (NGCP)', icon: '📡', baseCost: 5.1e9,   baseCps: 260e3,  kind: 'infra',  flavor: 'Vehicles now have better signal than you.' },
  { id: 'archlab',    name: 'System Architecture Lab',  icon: '🧪', baseCost: 75e9,    baseCps: 1.6e6,  kind: 'infra',  flavor: 'Folds the sprint backlog into a Möbius strip.' },
  { id: 'truck',      name: 'Test Truck',               icon: '🚚', baseCost: 1e12,    baseCps: 10e6,   kind: 'infra',  flavor: 'One platform, three trims, every market.' },
  { id: 'ota',        name: 'OTA Update Satellite',     icon: '🛰️', baseCost: 14e12,   baseCps: 65e6,   kind: 'infra',  flavor: 'Patches the whole fleet before breakfast.' },
  { id: 'twin',       name: 'Digital Twin',             icon: '🧬', baseCost: 170e12,  baseCps: 430e6,  kind: 'infra',  flavor: 'It ships faster than you. It knows.' },
  { id: 'datacenter', name: 'Data Center',              icon: '🖥️', baseCost: 2.1e15,  baseCps: 2.9e9,  kind: 'infra',  flavor: 'Warm enough to heat the whole office.' },
  { id: 'autonomy',   name: 'Autonomy Core',            icon: '🧠', baseCost: 26e15,   baseCps: 21e9,   kind: 'infra',  flavor: 'Writes code that writes code.' },
  { id: 'platform',   name: 'The Platform',             icon: '✨', baseCost: 310e15,  baseCps: 150e9,  kind: 'infra',  flavor: 'Mobility, at the literal speed of ideas.' },
];

export const PRODUCER_BY_ID: Record<string, ProducerDef> = Object.fromEntries(
  PRODUCERS.map((p) => [p.id, p]),
);

/** How often burst producers (Consultant) deliver, in seconds. */
export const BURST_INTERVAL = 10;

// ---------------------------------------------------------------------------
// Upgrades
// ---------------------------------------------------------------------------

const totalProducers = (s: State) => Object.values(s.owned).reduce((a, b) => a + b, 0);
const own = (s: State, id: string) => s.owned[id] ?? 0;

// prettier-ignore
const NAMED_UPGRADES: UpgradeDef[] = [
  // -- The click: doublers ---------------------------------------------------
  { id: 'keyboard', name: 'Mechanical keyboard',      icon: '⌨️', cost: 100,    effect: { type: 'click', mult: 2 }, unlocked: (s) => s.clicks >= 10,   flavor: 'Louder, and 2× as productive.' },
  { id: 'monitor',  name: 'Second monitor',           icon: '🖥️', cost: 2e3,    effect: { type: 'click', mult: 2 }, unlocked: (s) => s.clicks >= 50,   flavor: 'Twice the screens, twice the code.' },
  { id: 'duck',     name: 'Rubber duck',              icon: '🦆', cost: 50e3,   effect: { type: 'click', mult: 2 }, unlocked: (s) => s.clicks >= 120,  flavor: 'It just listens. Clicks 2× wiser.' },
  { id: 'vim',      name: 'Vim bindings',             icon: '📟', cost: 1e6,    effect: { type: 'click', mult: 2 }, unlocked: (s) => s.clicks >= 400,  flavor: 'You can never exit. You never want to.' },
  { id: 'splitkb',  name: 'Ergonomic split keyboard', icon: '⌨️', cost: 100e6,  effect: { type: 'click', mult: 2 }, unlocked: (s) => s.clicks >= 1000, flavor: 'Your wrists ascend to a higher plane.' },
  { id: 'neural',   name: 'Neural interface',         icon: '🧠', cost: 50e9,   effect: { type: 'click', mult: 2 }, unlocked: (s) => s.clicks >= 2500, flavor: 'Think in TypeScript.' },

  // -- The click: scales with production so clicking stays relevant late ----
  { id: 'touchtype', name: 'Touch-typing course', icon: '⚡', cost: 2e6,    effect: { type: 'clickCpsPercent', percent: 1 }, unlocked: (s) => s.clicks >= 300,  flavor: 'Each click also earns 1% of your LoC/s.' },
  { id: 'macros',    name: 'Code-gen macros',     icon: '🪄', cost: 500e6,  effect: { type: 'clickCpsPercent', percent: 1 }, unlocked: (s) => s.clicks >= 800,  flavor: 'One keystroke, one subsystem.' },
  { id: 'aipair',    name: 'Pairing with the AI', icon: '🤝', cost: 100e9,  effect: { type: 'clickCpsPercent', percent: 2 }, unlocked: (s) => s.clicks >= 2000, flavor: 'You type the vibe, it types the rest.' },

  // -- Global boosts ---------------------------------------------------------
  { id: 'espresso',   name: 'Real espresso machine',     icon: '☕', cost: 8e3,    effect: { type: 'global', mult: 1.05 }, unlocked: (s) => totalProducers(s) >= 10,  flavor: 'Team runs hotter. +5% everything.' },
  { id: 'pairing',    name: 'Pair programming',          icon: '🧑‍🤝‍🧑', cost: 500e3,  effect: { type: 'global', mult: 1.07 }, unlocked: (s) => totalProducers(s) >= 25,  flavor: 'Fewer bugs, more output. +7% everything.' },
  { id: 'darkmode',   name: 'Dark mode',                 icon: '🌙', cost: 5e6,    effect: { type: 'global', mult: 1.10 }, unlocked: (s) => totalProducers(s) >= 40,  flavor: 'Objectively faster. +10% everything.' },
  { id: 'nomeetings', name: 'No-meeting Wednesdays',     icon: '🗓️', cost: 2e6,    effect: { type: 'global', mult: 1.10 }, unlocked: (s) => own(s, 'meeting') >= 5,   flavor: 'One sacred day. +10% everything.' },
  { id: 'monorepo',   name: 'The Monorepo',              icon: '🗄️', cost: 5e9,    effect: { type: 'global', mult: 1.15 }, unlocked: (s) => totalProducers(s) >= 80,  flavor: 'One repo. One truth. +15% everything.' },
  { id: 'typesafe',   name: 'Type-safe everything',      icon: '🛡️', cost: 1e12,   effect: { type: 'global', mult: 1.20 }, unlocked: (s) => totalProducers(s) >= 120, flavor: 'undefined is not a teammate. +20%.' },
  { id: 'trims',      name: 'One platform, three trims', icon: '🧩', cost: 5e12,   effect: { type: 'global', mult: 1.15 }, unlocked: (s) => own(s, 'truck') >= 1,     flavor: 'Reuse everywhere. +15% everything.' },
  { id: 'rollout',    name: 'Fleet-wide rollout',        icon: '🌍', cost: 100e12, effect: { type: 'global', mult: 1.25 }, unlocked: (s) => own(s, 'ota') >= 1,       flavor: 'Every vehicle, everywhere. +25%.' },

  // -- Architecture track: unlocked by Senior Developers ---------------------
  { id: 'hexagonal',   name: 'Hexagonal architecture',    icon: '⬡', cost: 100e3, effect: { type: 'global', mult: 1.10 }, unlocked: (s) => own(s, 'senior') >= 5,  flavor: 'Ports, adapters, +10% everything.' },
  { id: 'eventdriven', name: 'Event-driven architecture', icon: '📨', cost: 25e6,  effect: { type: 'global', mult: 1.12 }, unlocked: (s) => own(s, 'senior') >= 15, flavor: 'Everything reacts. +12% everything.' },
  { id: 'ddd',         name: 'Domain-driven design',      icon: '📐', cost: 5e9,   effect: { type: 'global', mult: 1.15 }, unlocked: (s) => own(s, 'senior') >= 30, flavor: 'Ubiquitous language, ubiquitous +15%.' },

  // -- Synergies: one producer boosts another --------------------------------
  { id: 'mentorship',  name: 'Mentorship program',        icon: '🎓', cost: 250e3, effect: { type: 'synergy', producerId: 'intern', per: 'senior', percent: 5 }, unlocked: (s) => own(s, 'intern') >= 10 && own(s, 'senior') >= 5, flavor: 'Interns +5% output per Senior Developer.' },
  { id: 'premerge',    name: 'Pre-merge checks',          icon: '✅', cost: 5e6,   effect: { type: 'synergy', producerId: 'junior', per: 'cicd', percent: 2 },   unlocked: (s) => own(s, 'junior') >= 10 && own(s, 'cicd') >= 5,   flavor: 'Junior Devs +2% output per CI/CD Pipeline.' },
  { id: 'promptguild', name: 'Prompt engineering guild',  icon: '🔮', cost: 2e9,   effect: { type: 'synergy', producerId: 'ai', per: 'senior', percent: 3 },     unlocked: (s) => own(s, 'ai') >= 5 && own(s, 'senior') >= 10,     flavor: 'AI Assistants +3% output per Senior Developer.' },

  // -- The Meeting redemption arc --------------------------------------------
  { id: 'asyncstandups', name: 'Async standups', icon: '💬', cost: 100e3, effect: { type: 'override', producerId: 'meeting', cps: 6 }, unlocked: (s) => own(s, 'meeting') >= 3, flavor: 'Meetings now produce +6 LoC/s. Somehow.' },
];

// Milestone tiers per producer: a doubler at each owned-count threshold.
// prettier-ignore
const TIERS = [
  { at: 1,   costMult: 12,    prefix: 'Better' },
  { at: 10,  costMult: 120,   prefix: 'Elite' },
  { at: 25,  costMult: 1.2e3, prefix: 'Principal' },
  { at: 50,  costMult: 14e3,  prefix: 'Distinguished' },
  { at: 100, costMult: 160e3, prefix: 'Transcendent' },
];

// Characterful names for otherwise generated upgrades.
const TIER_OVERRIDES: Record<string, { name: string; flavor: string }> = {
  better_intern: { name: 'Better onboarding docs', flavor: 'Interns are twice as useful.' },
  better_junior: { name: 'Stack Overflow Teams', flavor: 'Junior Devs copy-paste twice as fast.' },
  better_ai: { name: 'Bigger context window', flavor: 'It finally remembers the whole codebase.' },
};

const GENERATED_UPGRADES: UpgradeDef[] = PRODUCERS.filter((p) => p.kind !== 'joke').flatMap(
  (p): UpgradeDef[] =>
    TIERS.map((tier) => {
      const id = `${tier.prefix.toLowerCase()}_${p.id}`;
      const override = TIER_OVERRIDES[id];
      return {
        id,
        name: override?.name ?? `${tier.prefix} ${p.name}`,
        icon: p.icon,
        cost: Math.ceil(p.baseCost * tier.costMult),
        effect: { type: 'producer', producerId: p.id, mult: 2 },
        unlocked: (s) => own(s, p.id) >= tier.at,
        flavor: override?.flavor ?? `${p.name} output ×2.`,
      };
    }),
);

export const UPGRADES: UpgradeDef[] = [...NAMED_UPGRADES, ...GENERATED_UPGRADES].sort(
  (a, b) => a.cost - b.cost,
);

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

// ---------------------------------------------------------------------------
// Achievements — each grants a permanent +1% global ("code quality").
// Ones with `check: () => false` are granted directly by events.
// ---------------------------------------------------------------------------

const peopleCount = (s: State) =>
  PRODUCERS.filter((p) => p.kind === 'people').reduce((sum, p) => sum + own(s, p.id), 0);

// prettier-ignore
export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'hello',       name: 'Hello, world',            icon: '👋', desc: 'Write your first line of code.',       check: (s) => s.loc >= 1 },
  { id: 'kilo',        name: 'Kilo-coder',              icon: '📜', desc: 'Write 1,000 lines of code.',           check: (s) => s.loc >= 1e3 },
  { id: 'merge',       name: 'Merge master',            icon: '🔀', desc: 'Write 1 million lines of code.',       check: (s) => s.loc >= 1e6 },
  { id: 'billion',     name: 'Billion-line codebase',   icon: '📚', desc: 'Write 1 billion lines of code.',       check: (s) => s.loc >= 1e9 },
  { id: 'trillion',    name: 'Trillion-line era',       icon: '🌌', desc: 'Write 1 trillion lines of code.',      check: (s) => s.loc >= 1e12 },
  { id: 'rsi',         name: 'RSI incoming',            icon: '🖱️', desc: 'Click the Core 100 times.',            check: (s) => s.clicks >= 100 },
  { id: 'warrior',     name: 'Keyboard warrior',        icon: '⚔️', desc: 'Click the Core 1,000 times.',          check: (s) => s.clicks >= 1e3 },
  { id: 'startup',     name: 'Small startup',           icon: '🌱', desc: 'Hire 10 people.',                      check: (s) => peopleCount(s) >= 10 },
  { id: 'scaleup',     name: 'Scale-up mode',           icon: '📈', desc: 'Hire 50 people.',                      check: (s) => peopleCount(s) >= 50 },
  { id: 'internarmy',  name: 'Intern army',             icon: '🐜', desc: 'Employ 100 Interns.',                  check: (s) => own(s, 'intern') >= 100 },
  { id: 'email',       name: 'Could’ve been an email',  icon: '📧', desc: 'Schedule 10 Meetings.',                check: (s) => own(s, 'meeting') >= 10 },
  { id: 'aiten',       name: 'It reviews its own PRs',  icon: '🤖', desc: 'Deploy 10 AI Assistants.',             check: (s) => own(s, 'ai') >= 10 },
  { id: 'fleet',       name: 'Rolling fleet',           icon: '🚚', desc: 'Own 10 Test Trucks.',                  check: (s) => own(s, 'truck') >= 10 },
  { id: 'itself',      name: 'It writes itself',        icon: '♾️', desc: 'Own an Autonomy Core.',                check: (s) => own(s, 'autonomy') >= 1 },
  { id: 'singularity', name: 'The singularity',         icon: '🌟', desc: 'Own The Platform.',                    check: (s) => own(s, 'platform') >= 1 },
  { id: 'delivery',    name: 'Continuous delivery',     icon: '🔄', desc: 'Reach 1,000 LoC per second.',          check: (_s, d) => d.locPerSec >= 1e3 },
  { id: 'velocity',    name: 'Ludicrous velocity',      icon: '⚡', desc: 'Reach 1 million LoC per second.',      check: (_s, d) => d.locPerSec >= 1e6 },
  { id: 'shipit',      name: 'Ship it',                 icon: '🚢', desc: 'Catch a lucky event.',                 check: () => false },
  { id: 'firefighter', name: 'Firefighter',             icon: '🚒', desc: 'Fix a Production Bug in time.',        check: () => false },
  { id: 'rebase',      name: 'Rebase hell survivor',    icon: '🧶', desc: 'Resolve a Merge Conflict.',            check: () => false },
  { id: 'hotfixhero',  name: 'Hotfix hero',             icon: '🦸', desc: 'Land 10 clicks on one Critical Hotfix.', check: () => false },
  { id: 'caffeine',    name: 'Hand-rolled code',        icon: '✍️', desc: 'Clear an AI Outage.',                  check: () => false },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/**
 * Achievements worth stopping the screen for, and the headline to shout.
 * Keyed by achievement id so the once-only, already-persisted achievement set
 * decides when these fire — no extra state, and no repeat on reload.
 */
export const MILESTONES: Record<string, string> = {
  merge: '1 MILLION LINES',
  billion: '1 BILLION LINES',
  trillion: '1 TRILLION LINES',
};
