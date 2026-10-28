# Checks: tests and duplication

## Test time limits

Tests are only useful if people run them all the time, so they must stay fast.

| Limit | Value | How it is kept |
|---|---|---|
| One test | **5 s** | `--test-timeout=5000` in `npm test` (and `testTimeout: 5000` once there is a Vitest config). A test that needs more is split, given a smaller fixture, or moved to a slow check. |
| The whole of `npm test` | **60 s** | CI fails past 60 s and warns past 50 s (`tools/guards/budget.mjs`). Keep `npm test` free of browsers, network and big worlds. |
| A slow check (browser, screenshots, shader check, long simulation) | **5 min** each | Own script, never inside `npm test`. Run on demand and after changes to what it covers. |

The slow checks today: `npm run variety` (every kind of dungeon, 1000 each) and `npm run loop` (whole evenings played headless, plan A6) run in CI after `npm test`, and so does `npm run check:units` (every material kind warmed up on WebGL 2 in headless Chromium; it fails when a fragment shader reads more than WebGL 2's 16 textures, as the land did after the roads, MW #155); `npm run shot:set` (the standard shots, F1, in two runs of under 5 min each: `-- --part=town` and `-- --part=land`; without a part both run one after the other), `npm run shot:spells` (each school's first spell, C2), `npm run shot:rest` (the hero sits down to rest), `npm run shot:hatch` (down through a cellar's hatch and up its ladder, played out), `npm run shot:doors` (a house's door swings open as the hero comes and shuts behind them), `npm run shot:search` (the hero steps up to a chest, kneels and its lid lifts), `npm run shot:ways` (a cellar's locked, barred and hidden ways seen opening), `npm run shot:mouths` (walked into a barrow, cave and tower and out again, and remains knelt to and taken up), `npm run shot:hits` (every kind of foe and the hero struck, in slow motion) and `npm run shot:origin` (the floating origin at 32 km and 300 km from zero and across a step, plan B0) run on the reference GPU.

Tests use seeds, fake clocks and small fixtures, never wall-clock waits.

`--test-timeout` holds for a whole test file too, setup at its top included, and files run three or four at
once, so a file needs to finish well inside 5 s alone (about 3.5 s). The land's big rivers' grid costs about 2 s to
build: a test that makes a `Terrain` or calls `openWorld` passes `SMALL` (test/small.ts) unless it needs the
game's own rivers.

## CI time

CI (`.github/workflows/ci.yml`) runs three jobs side by side, so it takes as long as the slowest (about 1.5 min):
tests and guards; the dungeon variety and the evening loop; the build and the texture-unit check (on the runner's
own Chrome). Each step runs under `node tools/guards/budget.mjs <warn s> <fail s> -- <command>`: past its warning
the run's page shows a "Slow step" warning; past its budget the step fails. The fail budgets are the limits above
(60 s for `npm test`, 5 min for a slow check); the warnings sit at about twice today's time, so creep shows long
before it fails. When a warning shows up, find the cause then, not when it fails.

| Step | Time (Oct 2026) | Warn | Fail |
|---|---|---|---|
| `npm test` | ~40 s | 50 s | 60 s |
| `npm run variety` | ~12 s | 30 s | 5 min |
| `npm run loop` (its runs side by side, one process each) | ~30 s | 60 s | 5 min |
| `npm run build` | ~10 s | 30 s | 5 min |
| `npm run check:units` | ~20 s | 60 s | 5 min |

## Duplication

The duplication finders come from [toolbox](https://github.com/ArndRosemeier/toolbox), copied as the whole `tools/` folder (see `tools/README.md`, do not copy single files):

| Command | What it finds |
|---|---|
| `npm run dup` | Functions sharing an exact, normalised or near-identical name across files |
| `npm run repeated` | Function bodies that are near-identical under different names, and inline idioms pasted into several files |

Both scan `src/`, write their report to `reports/` (git-ignored) and exit `0`. They point, they don't judge: open both places before folding anything.

How we use them:

1. **Before writing a helper, search for the one that exists.** A second way to do the same thing is a bug.
2. **Every PR description has a `COPIES:` line**: `COPIES: 1 — checked (grepped: ...)` or `COPIES: 3→1 — <where it now lives>`.
3. **Every ~10 PRs, a sweep:** run both finders, read the top of each report, fold what is worth folding.
4. Updating the tools: copy the whole `tools/` folder from toolbox again and run `npm test`.
