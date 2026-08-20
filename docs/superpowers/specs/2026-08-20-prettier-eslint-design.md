# Prettier and ESLint

Date: 2026-08-20

## Decisions

**Prettier: `printWidth: 110`, `singleQuote: true`, everything else default.**
Measured against the existing code rather than guessed. The 95th-percentile line in
`src/*.ts` is 96 characters and the code is clearly written to about 110, so narrower
settings meant reformatting for its own sake — at the default 80 the diff was 593 lines,
at 100 it was 336, at 110 it was 195. Single quotes match the codebase 2438 to 50.

**Four data tables in `content.ts` and one in `events.ts` are `// prettier-ignore`d.**
This is the important one. `PRODUCERS`, `NAMED_UPGRADES`, `TIERS` and `ACHIEVEMENTS` are
hand-aligned into columns; `EVENT_TYPES` keeps each event's metadata on one line so
`onResolve` is what you read. Prettier reformats all of them into one-property-per-line
blocks at *every* print width: `content.ts` went from 157 lines to between 545 and 639,
and `events.ts` from 282 to 401. The alignment is what makes the balance numbers
comparable at a glance, so it is worth keeping and this is precisely what
`prettier-ignore` is for.

**Scope: TypeScript and CSS, plus the config files.** `index.html` is excluded because
Prettier rewrites 160 of its 247 lines, including the hand-tuned inline SVG. Markdown is
excluded because the docs read better with their own line breaks. Both live in
`.prettierignore`.

**ESLint: `typescript-eslint` `recommendedTypeChecked`, flat config, scoped to `**/*.ts`.**
Measured the three candidate levels against the codebase:

| Level | Findings | What they were |
| --- | --- | --- |
| `recommended` | 0 | nothing, and no type-aware checks either |
| `recommendedTypeChecked` | 2 | two unnecessary type assertions, both auto-fixed |
| `strictTypeChecked` | 70 | 23 `no-confusing-void-expression`, 19 `restrict-template-expressions`, 15 `no-non-null-assertion`, 10 `no-unnecessary-condition` |

`strictTypeChecked` was rejected on the evidence: its 70 findings are not bugs, they are
objections to deliberate idioms used throughout — `() => this.onRestart()` shorthand,
interpolating numbers into template strings, and the `el('x')!` pattern that `ui.ts` is
built on. Clearing them means rewriting working code to satisfy a linter.

`recommendedTypeChecked` earns its keep instead through the rules `tsc` does not have:
`no-floating-promises`, `no-misused-promises`, and the `no-unsafe-*` family. Verified
that these actually fire, rather than trusting a clean report from a possibly misconfigured
linter.

`eslint-config-prettier` is last in the chain so no lint rule fights the formatter.
`vite.config.ts` sits outside `tsconfig`'s `include`, so `projectService.allowDefaultProject`
covers root-level `.ts` files.

## Scripts

`lint`, `format`, `format:check`, and `check` — the last being `tsc && eslint . &&
prettier --check . && vitest run`, one gate for everything. `build` is deliberately left
as `tsc && vite build` so it stays fast.

## Verification

The four ignored tables are byte-identical to their pre-Prettier versions. `prettier
--check` passes, so the formatting is idempotent. The production bundle hash is unchanged
(`index-C5rdaXfj.js`, 32.79 kB), which confirms the reformatting was purely cosmetic. All
97 tests pass.
