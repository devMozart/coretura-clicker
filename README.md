# Coretura Clicker

A just-for-fun incremental game in the spirit of *Cookie Clicker*: click the Coretura Core to write code, ship it into Funding, and scale from one intern to a self-improving Software-Defined Vehicle platform.

## Run it

```sh
npm install
npm run dev
npm test
npm run lint     # eslint, with type-aware rules
npm run format   # prettier --write
npm run build    # typecheck + production build into dist/
npm run check    # all of the above, as one gate
```

## Todo

### 1.0

**Game**
- News ticker along the bottom. The copy is already written in DESIGN.md 3.9.

**Technical**
- Mobile layout: the store sits about 630px below the fold. Maybe a bottom sheet, or tabs.

### Future

**Game**

- Prestige, the "Funding Rounds" idea in DESIGN.md 3.7. The game currently ends at The
  Platform: reset progress for permanent multipliers, Seed to Series A to IPO. Biggest gap.
- More hand-written upgrades. 80 of the 104 are generated tier doublers, and the named ones
  (Rubber duck, No-meeting Wednesdays, Async standups) are the ones people quote.

**Technical**

- Save export/import. localStorage only, so there is no way to move between phone and laptop.