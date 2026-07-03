# Coretura Clicker

A just-for-fun incremental game in the spirit of *Cookie Clicker*: click the Coretura Core
to write code, ship it into Funding, and scale from one intern to a self-improving
Software-Defined Vehicle platform. See [DESIGN.md](DESIGN.md) for the full design document.

## Run it

```sh
npm install
npm run dev      # dev server
npm test         # economy/format unit tests
npm run build    # typecheck + production build into dist/
```

## What's in the prototype

- **The click**: squash animation, `+N` code floater, connectivity pulse ring, synth click
  sound (mute toggle in the top bar). `Space` also clicks.
- **Economy — "Ship → Fund → Scale"**: Lines of Code is the all-time score and is never
  spent; every line auto-ships into **Funding (€)**, the spend currency (1:1 for now).
- **17 producers** from Intern to The Platform (cost ×1.15 per unit, ×1/×10/×100 buying,
  sticky reveal at 40% of base cost), several with mechanical identity:
  - *Consultant* delivers everything as one lump every 10s (burst floater).
  - *Tech Lead* gives +2% output to all people per owned.
  - *AI Assistant* gains +5% own output per upgrade you own anywhere.
  - *DevOps Engineer* gives +1% to ALL production per owned.
  - *Meeting* produces −2 LoC/s (redeemed by the "Async standups" upgrade → +6).
- **~100 upgrades**: click doublers + click-scales-with-production tiers, global boosts,
  an architecture track gated on Senior Developers, synergies (Interns +5% per Senior…),
  and milestone doublers per producer at 1/10/25/50/100 owned.
- **10 event types** every 40–80s: lucky ones (PR Approved, Investor Demo ×7, Coffee
  Delivery, Code Freeze Lifted, Hackathon), debuffs you click away (Production Bug,
  AI Outage, Flaky Test), and click challenges (Merge Conflict ×10, Critical Hotfix
  rapid-click). Debuffs never spawn before 1K LoC. Buffs/debuffs stack as HUD chips.
- **22 achievements**, each a permanent +1% "code quality" global bonus.
- **Save**: localStorage autosave every 5s + offline earnings (capped at 2h). Active
  event buffs are intentionally not saved.
- Background: the two brand gradients slowly crossfading on a 60s loop.
- `prefers-reduced-motion` respected; deliberately **no news ticker**.

## Code layout

```
src/
├─ content.ts   # producers, upgrades, achievements — pure data, edit to balance
├─ game.ts      # economy: costs, derived multipliers (recomputed from scratch), mutations
├─ events.ts    # Green Build / Merge Conflict director
├─ ui.ts        # DOM rendering: HUD, store, tooltips, toasts
├─ fx.ts        # floaters, pulse rings, WebAudio blips
├─ save.ts      # localStorage save/load + offline cap
├─ format.ts    # K/M/B/T… number formatting
└─ main.ts      # game loop wiring (rAF production + 4 Hz store refresh)
```

Balancing knobs live at the top of `game.ts` (`COST_GROWTH`, `SHIP_RATE`,
`ACHIEVEMENT_BONUS`, `REVEAL_FRACTION`, `TECHLEAD_BONUS`, `DEVOPS_BONUS`,
`AI_PER_UPGRADE`) and in the `content.ts` data tables. Event weights and timings
are data in `events.ts` (`EVENT_TYPES`).

In dev builds a console handle is exposed for testing: `__game.state`,
`__game.earn(1e6)`, `__game.derive()`.

## Not yet (phase 2+)

Funding-round prestige (Vision), partner/ecosystem upgrades, Technical Debt Uprising,
manual "Ship release" button, real modular-grid Core SVG + producer icons, stats screen,
export/import saves, buy-max button, producer sell-back.
