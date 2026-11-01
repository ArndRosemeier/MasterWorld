# Checks: tests and duplication

## Test time limits

Tests are only useful if people run them all the time, so they must stay fast.

| Limit | Value | How it is kept |
|---|---|---|
| One test | **5 s** | `--test-timeout=5000` in `npm test` (and `testTimeout: 5000` once there is a Vitest config). A test that needs more is split, given a smaller fixture, or moved to a slow check. |
| The whole of `npm test` | **60 s** | CI fails past 60 s and warns past 50 s (`tools/guards/budget.mjs`). Keep `npm test` free of browsers, network and big worlds. |
| A slow check (browser, screenshots, shader check, long simulation) | **5 min** each | Own script, never inside `npm test`. Run on demand and after changes to what it covers. |

The slow checks today: `npm run variety` (every kind of dungeon, 1000 each), `npm run zfight [-- report.md]` (z-fighting: every generator of built things, from towers and dungeons to the towns' buildings, scanned for faces in one plane that face the same way, overlap and show; about 2.5 min, on demand, `src/world/zFight.ts`; `test/zFight.test.ts` holds the towers, the land's pieces and the start town's houses to none), `npm run loop` (whole evenings played headless, plan A6) and `npm run walk:landforms` (gate L: straight walks out of the start and through each kind of country, in three worlds, never a minute without a landform, a mesa wall or a crag) run in CI after `npm test`, and so does `npm run check:units` (every material kind warmed up on WebGL 2 in headless Chromium; it fails when a fragment shader reads more than WebGL 2's 16 textures, as the land did after the roads, MW #155); `npm run ground:scan` (in five worlds, round the start and the nearest sea cliff: the ground the hero and creatures stand on, `src/world/drawnGround.ts`, against the built terrain mesh, failing past 1 cm; it also lists where the land's own height, which trees and props are set on, is off the mesh by more than 0.5 m; about 3 min, on demand), `npm run water:fit` (phase W: how deep rivers and brooks cut below the land as it is before water shapes it, how much water stands raised above it, and lake water beside lower dry ground, in four worlds, about 25 s; it reports, the W steps set its limits), `npm run preview:caves -- out-dir [n] [size] [rocks] [floor seeds]` (phase K: the gallery of formed caves, n seeds per rock setting and six views from the floor (hero, lantern, stream, drips, formations) per floor seed, in cloud SwiftShader, about 2 min for 24 medium caves of each of three rocks; it prints the slowest form + carve + dress time, which must stay under 3 s), `npm run shot:set` (the standard shots, F1, in four runs of under 5 min each: `-- --part=town`, `-- --part=land`, `-- --part=caves` (a cave mouth in a cliff and its cavern, L6) and `-- --part=kinds` (the downs, a moor, karst and badlands, L7); without a part all run one after the other), `npm run shot:spells` (each school's first spell, C2), `npm run shot:rest` (the hero sits down to rest), `npm run shot:hatch` (down through a cellar's hatch and up its ladder, played out), `npm run shot:doors` (a house's door swings open as the hero comes and shuts behind them), `npm run shot:search` (the hero steps up to a chest, kneels and its lid lifts), `npm run shot:ways` (a cellar's locked, barred and hidden ways seen opening), `npm run shot:mouths` (walked into a barrow, cave and tower and out again, and remains knelt to and taken up), `npm run shot:grounded` (a ruined tower and the warden's keep from four sides: their fallen stones and wall feet on the land, none floating), `npm run shot:hits` (every kind of foe and the hero struck, in slow motion) and `npm run shot:origin` (the floating origin at 32 km and 300 km from zero and across a step, plan B0) run on the reference GPU.

Tests use seeds, fake clocks and small fixtures, never wall-clock waits.

`npm test` is `node tools/test/run.mjs`: the test files run in one process per core, side by side, and each process
runs its share of the files one after the other (`--test-isolation=none`), so the code is loaded and compiled once per
process, not once per file (MW: 47 s down to about 24 s on 4 cores). The shares are balanced by each file's tests' time
in `tools/test/times.json` (`npm test -- --save-times` writes it anew; a new file counts as 1 s until then).
`npm test -- test/town.test.ts` runs the files given, `TEST_PROCS=n npm test` with n processes.

Because files share a process, a test file never changes what another one sees, and module-level state in `src`
holds only caches. The start's land (seed masterworld, small drainage tiles) is built once per process and shared:
`frontierLand()` and `startWorld()` (as `openWorld`) in test/frontierLand.ts. Its log is frozen and its terrain
refuses `settle`, `settleMore`, `addTown` and `addRoad`; a file that settles more on it, or pushes to its log, asks
for its own with `{ own: true }` (built from the shared first decisions, about 0.5 s instead of 2 s). Building that
land again in each file took a quarter of all test time. `--test-timeout` holds for each test; setup at a file's top
is not timed, so keep it small. The land's big rivers' grid costs about 2 s to build: a test that makes its own
`Terrain` passes `SMALL` (test/small.ts) unless it needs the game's own rivers.

The test loader (tsx) keeps function names, so every closure made in a function wraps its name on (a
`defineProperty`): in the land's hot paths (heights, asked millions of times) a closure made per call cost a tenth of
all test time. Write such helpers out there (the built game has no such cost, but tests run the land a lot).

## CI time

CI (`.github/workflows/ci.yml`) runs three jobs side by side, so it takes as long as the slowest (about 1.5 min):
tests and guards; the dungeon variety and the evening loop; the build and the texture-unit check (on the runner's
own Chrome). Each step runs under `node tools/guards/budget.mjs <warn s> <fail s> -- <command>`: past its warning
the run's page shows a "Slow step" warning; past its budget the step fails. The fail budgets are the limits above
(60 s for `npm test`, 5 min for a slow check); the warnings sit at about twice today's time, so creep shows long
before it fails. When a warning shows up, find the cause then, not when it fails.

| Step | Time (Oct 2026) | Warn | Fail |
|---|---|---|---|
| `npm test` | ~30 s | 50 s | 60 s |
| `npm run variety` | ~12 s | 30 s | 5 min |
| `npm run loop` (its runs side by side, one process each) | ~30 s | 60 s | 5 min |
| `npm run walk:landforms` (three worlds) | ~20 s | 30 s | 5 min |
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
