# Versioned saves with migrations

Date: 2026-08-20

## Problem

The save key carried its own version (`coretura-clicker-save-v2`), so any change to the
save's shape meant bumping the key and wiping everyone's progress. Prestige will change
that shape, so the mechanism had to land first.

## Storage layout

| Key | Holds |
| --- | --- |
| `coretura-clicker-save` | the versioned envelope |
| `coretura-clicker-settings` | sound preference, unversioned |
| `coretura-clicker-save-broken` | quarantined unreadable blob |

## Decisions

**The envelope is nested: `{ v, state }`.** Migrations then operate purely on `state`
while the runner owns `v`, and the export/import todo has somewhere to put metadata
without colliding with save fields. `muted` is gone from the save entirely — it belongs
to the device, not to progress.

**The version derives from the migration list.** `SAVE_VERSION = MIGRATIONS.length + 1`,
with index i migrating v(i+1) → v(i+2). Adding a migration bumps the version as a side
effect, so the two cannot drift.

**`load()` returns a discriminated result, always carrying a usable state.**

```ts
type LoadResult =
  | { kind: 'loaded'; state: State }
  | { kind: 'empty';  state: State }
  | { kind: 'broken'; state: State }
  | { kind: 'future'; state: State; storedVersion: number };
```

Callers read `result.state` unconditionally and branch on `kind` only to decide what to
tell the player. `main.ts` shows a toast for `broken` and `future`, and only pays out
offline earnings for `loaded`.

**A newer save is never overwritten, and the guard lives in `save()`.** Rather than
asking `main.ts` to remember a flag, `save()` re-reads the stored version and returns
early if it exceeds `SAVE_VERSION`. No call site can get it wrong, and it also covers two
tabs running different bundles. The cost is one extra `localStorage` read per autosave.

**An unreadable save is quarantined, not destroyed.** The blob is copied to
`-broken` first and the original is only removed once that copy succeeded, so a failed
write leaves the original in place rather than losing it.

**Unknown ids are pruned on load.** This closes a live balance hole rather than merely
tidying up. `derive()` correctly skips ids it does not recognise when computing output,
but three places use raw collection sizes: `achievements.size` feeds the global code-quality
multiplier and the HUD's `+N%`, `upgrades.size` feeds AI Assistant output at +5% each, and
`Object.values(owned)` feeds `totalProducers()`, which gates upgrade unlocks. A stale id
was therefore a permanent free multiplier — dormant today, live the moment prestige
renames content. After `sanitize()`, every id in `State` is one `content.ts` still knows.

Sanitising also rejects non-finite and negative numbers, floors `owned` counts and drops
non-positive ones, and clamps `lastSaved` to the present — a missing or future timestamp
would otherwise hand out up to `OFFLINE_CAP_SECONDS` of production on the next load.

**No legacy migration.** The old `-v2` key is not read, on the explicit instruction that
only the author's test save exists. That save starts fresh.

## Testing an empty migration list

With no legacy there are no real migrations, so the chain would have shipped as untested
scaffolding. The runner is therefore a pure exported function,
`runMigrations(from, data, migrations)`, which production calls with the real list and
tests call with fixtures — covering chaining, starting partway, already-current saves and
non-mutation before prestige becomes the first thing to depend on it.

The one path that stays uncovered is the `catch` around `runMigrations` inside `load()`.
With zero migrations nothing can throw, and injecting a throwing migration would mean
leaking test-only API. It is deliberate defensive code.

## Verification

52 tests, and 15 mutations of `save.ts` were each confirmed to turn the suite red —
covering the downgrade guard, future detection, all three prune paths, number and
timestamp validation, quarantine ordering, migration indexing, and wipe.
