# Automated interaction tests for ui.ts

Date: 2026-08-20

## Problem

`src/ui.ts` is the largest untested module in the game. It is only ever checked by
hand in a browser, so a regression in the menu, the store, or the tab toggles shows
up as a blank page or a dead button rather than a failing test.

## Scope

Interaction logic only: DOM state that a fake DOM can observe. Layout-dependent
behaviour is deliberately excluded — see Non-goals.

## Decisions

**happy-dom, not jsdom.** Lighter, faster, and already the option named in the README
todo. Applied per-file with a `// @vitest-environment happy-dom` docblock rather than
globally in a vitest config, so the existing node-environment suites keep their speed
and `save.test.ts`'s hand-rolled `localStorage` stub is left alone.

**The fixture is the shipped markup.** `UI`'s constructor resolves ~20 element IDs and
throws `missing #id` for any that are absent. A hand-written fixture would be a second
copy of that markup and would drift from `index.html`. Instead a helper reads
`index.html` itself, so renaming an id there fails the suite.

**Raw import, not `node:fs`.** `tsconfig.json` has `include: ["src"]` and
`types: ["vite/client"]`, so `npm run build` typechecks the test files. Importing
`node:fs` would need `@types/node` as a new devDep; `import html from '../index.html?raw'`
is already declared by `vite/client` and needs nothing.

The helper takes the `<body>` inner HTML and strips `<script>` tags, so happy-dom never
attempts to fetch `/src/main.ts`.

**No teardown added to `UI`.** It registers listeners on `window` (Space-to-click,
Escape-closes-menu) and `document` (outside-click-closes-menu) and never removes them,
so each test's fresh instance leaks a set. Every handler closes over its own element
references and stale ones act on detached nodes, so this is benign. Adding a `destroy()`
to production code purely to satisfy tests is not worth the change.

## Coverage

Four clusters:

- **Menu** — open/close via the button, outside-click closes, click inside does not,
  Escape closes and restores focus to `#menu-btn`, the sound toggle flips `state.muted`
  plus icon, label and `aria-checked`, the initial render honours an already-muted state,
  and the two-tap restart arms, cancels, wipes, and disarms when the menu closes so it
  never reopens half-armed.
- **Store** — one row per producer, built once and reused across refreshes; `€N` versus
  `€N for 10` bulk pricing; `unaffordable` tracking funding; blank-versus-number owned
  counts; an affordable click buys and fires `onPurchase` while an unaffordable one does
  neither; upgrade tiles render only `visibleUpgrades`; buying moves a tile to the Active
  tray and bumps `#owned-count`; achievement tiles stay `locked` until earned.
- **Tabs and buy toggle** — `active` and `aria-selected` follow the clicked tab, `hidden`
  swaps between the two trays, switching tabs hides the tooltip, and changing the buy
  amount re-renders costs.
- **HUD and toasts** — the four readouts, `document.title` left alone at zero LoC and
  updated once scoring, effect chips filtering expired effects, the `effectsKey` memo
  skipping redundant `innerHTML` writes, and `toast()` capping the stack at four and
  auto-removing on fake timers.

Tooltips are covered for content only: `pointerenter` fills `#tooltip` and unhides it,
and a producer tooltip gains its contribution line once owned.

## Non-goals

Everything that depends on layout, because happy-dom reports every
`getBoundingClientRect()` as zeros: core-click coordinates, tooltip edge clamping, the
mobile fold, tap target sizes. That remainder needs a real browser. The README todo is
narrowed to it rather than removed.

`main.ts` stays untested. It has top-level side effects and an unbounded
`requestAnimationFrame` loop, so covering it means either a refactor or a real browser —
both outside this change.
