# Coretura Clicker

A just-for-fun incremental game in the spirit of *Cookie Clicker*: click the Coretura Core to write code, ship it into Funding, and scale from one intern to a self-improving Software-Defined Vehicle platform.

## Run it

```sh
npm install
npm run dev      
npm test         
npm run build    # typecheck + production build into dist/
```

## Todo
See how the game looks fully expanded on a big screen.

**Game**

- Prestige, the "Funding Rounds" idea in DESIGN.md 3.7. The game currently ends at The
  Platform: reset progress for permanent multipliers, Seed to Series A to IPO. Biggest gap.
- News ticker along the bottom. The copy is already written in DESIGN.md 3.9.
- Milestone moments at 1M / 1B / 1T. Confetti, something screen-wide. Right now crossing a
  huge threshold feels the same as any other tick.
- More hand-written upgrades. 80 of the 104 are generated tier doublers, and the named ones
  (Rubber duck, No-meeting Wednesdays, Async standups) are the ones people quote.
- Share-your-run card: a PNG of your stats, generated the way tools/social-card.html is.

**Technical**

- Version the save. Changing its shape means bumping the key, which wipes everyone's
  progress. Wants a version field and migrations, ideally before prestige lands.
- Save export/import. localStorage only, so there is no way to move between phone and laptop.
- Test the UI. ui.ts is only ever checked by hand in a browser. happy-dom, or a handful of
  Playwright smoke tests, would make that repeatable.
- Prettier and ESLint, if the extra devDeps feel worth it.
- Smaller images, self-hosted fonts. bg1.jpg and bg2.jpg are 238KB of the 587KB precache,
  and the fonts still come from Google.
- Ask before updating the PWA instead of swapping assets silently on the next load.
- Mobile layout: the store sits about 630px below the fold. Maybe a bottom sheet, or tabs.
