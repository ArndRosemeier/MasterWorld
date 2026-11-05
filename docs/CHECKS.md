# Checks: tests and duplication

## Test time limits

Tests are only useful if people run them all the time, so they must stay fast.

| Limit | Value | How it is kept |
|---|---|---|
| One test | **5 s** | `--test-timeout=5000` in `npm test` (and `testTimeout: 5000` once there is a Vitest config). A test that needs more is split, given a smaller fixture, or moved to a slow check. |
| The whole of `npm test` | **70 s** | CI fails past 70 s and warns past 55 s (raised from 60 s by Arnd, 2026-11-01: main ran at the edge, and about 0.4 s of each file is process start-up) (`tools/guards/budget.mjs`). Keep `npm test` free of browsers, network and big worlds. |
| A slow check (browser, screenshots, shader check, long simulation) | **5 min** each | Own script, never inside `npm test`. Run on demand and after changes to what it covers. |

The slow checks today: `npm run variety` (every kind of dungeon, 1000 each), `npm run zfight [-- report.md]` (z-fighting: every generator of built things, from towers and dungeons to the towns' buildings, scanned for faces in one plane that face the same way, overlap and show; about 2.5 min, on demand, `src/world/zFight.ts`; `test/zFight.test.ts` holds the towers, the land's pieces and the start town's houses to none), `npm run loop` (whole evenings played headless, plan A6) and `npm run walk:landforms` (gate L: straight walks out of the start and through each kind of country, in three worlds, never a minute without a landform, a mesa wall or a crag) run in CI after `npm test`, and so does `npm run check:units` (every material kind warmed up on WebGL 2 in headless Chromium; it fails when a fragment shader reads more than WebGL 2's 16 textures, as the land did after the roads, MW #155); `npm run ground:scan` (in five worlds, round the start and the nearest sea cliff: the ground the hero and creatures stand on, `src/world/drawnGround.ts`, against the built terrain mesh, failing past 1 cm; it also builds the crags of cave mouths in cliffs on the drawn ground and fails if their rock hangs over it or sinks into it (over 1 m²), and lists where the land's own height, which a few props are still set on, is off the mesh by more than 0.5 m; about 8 min, on demand), `npm run water:fit` (phase W: how deep rivers and brooks cut below the land as it is before water shapes it, how much water stands raised above it, and lake water beside lower dry ground, in four worlds, about 25 s; it reports, the W steps set its limits), `npm run loop:locks [-- seeds]` (phase K6: in formed caves told a story, the game's walker comes to each natural lock, a wedged boulder, a locked grate and stacked stones, and is held by it, does what it asks and walks through; `STRICT=1` fails on a fault; about 1 min), `npm run preview:caves -- out-dir [n] [size] [rocks] [floor seeds]` (phase K: the gallery of formed caves, n seeds per rock setting and six views from the floor (hero, lantern, stream, drips, formations) per floor seed, in cloud SwiftShader, about 2 min for 24 medium caves of each of three rocks; it prints the slowest form + carve + dress time, which must stay under 3 s), `npm run shot:set` (the standard shots, F1, in four runs of under 5 min each: `-- --part=town`, `-- --part=land`, `-- --part=caves` (a cave mouth in a cliff and its cavern, L6) and `-- --part=kinds` (the downs, a moor, karst and badlands, L7); without a part all run one after the other), `npm run shot:spells` (each school's first spell, C2), `npm run shot:rest` (the hero sits down to rest), `npm run shot:hatch` (down through a cellar's hatch and up its ladder, played out), `npm run shot:doors` (a house's door swings open as the hero comes and shuts behind them), `npm run shot:search` (the hero steps up to a chest, kneels and its lid lifts), `npm run shot:ways` (a cellar's locked, barred and hidden ways seen opening), `npm run shot:mouths` (walked into a barrow, cave and tower and out again, and remains knelt to and taken up), `npm run shot:grounded` (a ruined tower and the warden's keep from four sides: their fallen stones and wall feet on the land, none floating), `npm run shot:hits` (every kind of foe and the hero struck, in slow motion), `npm run shot:auras` (a cellar fight: the thin and thick outlines hugging the foes, their health colours, the next foe taken as target when one falls, and the group panel's rows: a click on one targets that foe) `npm run shot:origin` (the floating origin at 32 km and 300 km from zero and across a step, plan B0) and `npm run shot:fly` (4 min of fast free-camera flight on a spiral, about 40 km: fails when the page's JS heap grows more than 400 MB between the first minute and the end; `FLY_OBJECTS=1` counts what is kept by name) run on the reference GPU. A mesh that leaves for good goes through `freeMesh` (render/materials.ts; a guard bans `geometry.dispose()` elsewhere): disposing its geometry alone left the renderer holding every terrain chunk ever drawn.


Tests use seeds, fake clocks and small fixtures, never wall-clock waits.

`npm test` is `node tools/test/run.mjs`: the test files run in one process per core, side by side, and each process
runs its files one after the other (`--test-isolation=none`), so the code is loaded and compiled once per process, not
once per file (MW: 47 s down to about 24 s on 4 cores). Every process gets the same list of the files, heaviest first, and
takes each file not yet taken when its turn comes (`tools/test/claim.mjs`: a wrapper test per file claims it with an
atomic `mkdir`, imports it and waits for its tests), so a process that is done early takes the next file and all end
within a second of each other, however far the times last measured are off. Those times are in `tools/test/times.json`
(`npm test -- --save-times` writes it anew; a file's time counts its setup at the top; a new file counts as 1 s until
then). The rivers' and brooks' tiles one process traces are put in a folder made for the run and taken from there by
the others (`tools/test/tileStore.mjs`, `useTileStore` in world/hydro.ts), so the same tile is traced once, not once per
process. `npm test -- test/town.test.ts` runs the files given, `TEST_PROCS=n npm test` with n processes.

Because files share a process, a test file never changes what another one sees, and module-level state in `src`
holds only caches. The start's land (seed masterworld, small drainage tiles) is built once per process and shared:
`frontierLand()` and `startWorld()` (as `openWorld`) in test/frontierLand.ts. Its log is frozen and its terrain
refuses `settle`, `settleMore`, `addTown` and `addRoad`; a file that settles more on it, or pushes to its log, asks
for its own with `{ own: true }` (built from the shared first decisions and the shared start town's plan, `Terrain.settle(log, plans)`, about 0.3 s instead of 2 s). Building that
land again in each file took a quarter of all test time. The test cellars (`outlineCellar` under a test house) are built once per process too and frozen: `testCellar(i, template)` and `testCellars(n)` in test/testCellars.ts. `--test-timeout` holds for each test; setup at a file's top
is not timed, so keep it small. The land's big rivers' grid costs about 2 s to build: a test that makes its own
`Terrain` passes `SMALL` (test/small.ts) unless it needs the game's own rivers.

The test loader (tsx) keeps function names, so every closure made in a function wraps its name on (a
`defineProperty`): in the land's hot paths (heights, asked millions of times) a closure made per call cost a tenth of
all test time (and again in the rock field's `fieldAt` and the dungeon space's cells, 5 % of all of it). Write such
helpers out there, or make them methods of a class (the built game has no such cost, but tests run the land a lot).

## What a PR runs

A pull request runs only what its change can reach (Arnd 2026-11-05: CI was at its limit and most PRs touch the renderer, not the world). `tools/test/affected.mjs` reads what every test file and every slow simulation imports (esbuild, the whole import closure) and picks those that reach a file the PR changed. On the 49 PRs before this rule, 31 touched nothing the simulations use and a PR ran about a quarter of the test time on average; a render-only change runs 5 files in about 10 s.

- **Run everything, never guess:** a push to main and a manual run (Actions, Run workflow) run the whole of `npm test` and every simulation; so does a PR that changes a dependency in `package.json`, the lockfile, the submodule pin, `public/`, the CI files, the test runner or the tsconfig, or any file the script cannot place. Main is the safety net: a pick that misses something shows up there, so when it does, fix the pick (`affected.mjs`), not the test.
- **Tests that read files** (a source scan, a data pack) depend on what they read, found in their text (a path built with `${}` counts as the whole folder). A new test of that kind needs nothing; one that reaches files another way (a spawned script, a path from a variable) must be listed in `TOOL_DEPS` in `affected.mjs`.
- **Run it yourself:** `npm test -- --changed=origin/main` runs what your branch can break; `node tools/test/affected.mjs --base origin/main` prints the tests and the simulations. Before a push that touches shared world code, `npm test` (everything) is still the check.
- **CI:** the `plan` job names the simulations to run (`SIM_JOBS` in `affected.mjs` is their list: name, command, warning); the `test` job passes `--changed=HEAD^1` on a pull request (HEAD is the merge into main, its first parent is main). The `build` job (typecheck, bundle, texture units) runs on every PR.

## CI time

CI (`.github/workflows/ci.yml`) runs its jobs side by side, so it takes as long as the slowest: tests and guards
(about 1 min); the build and the texture-unit check (on the runner's own Chrome, about 1 min); and one runner for
each slow simulation (dungeon variety, the evening loop in three parts, the landform walks). The simulations used to
run one after the other in one job and were the slowest part of every run (3.5-4 min, Nov 2026, with the evening loop alone 2 min); one runner each, the run takes
as long as the evening loop (about 2 min). Each step runs under `node tools/guards/budget.mjs <warn s> <fail s> -- <command>`: past its warning
the run's page shows a "Slow step" warning; past its budget the step fails. The fail budgets are the limits above
(70 s for `npm test`, 5 min for a slow check); the warnings sit at about 1.5 times today's time, so creep shows long
before it fails. When a warning shows up, find the cause then, not when it fails.

| Step | Time on CI (Nov 2026) | Warn | Fail |
|---|---|---|---|
| `npm test` | 62-63 s on CI's 4 cores (46 s on 2026-11-04; 190 files, 880 tests, about 270 s of CPU) | 55 s | 70 s |
| `npm run variety` | ~55 s | 90 s | 5 min |
| `npm run loop:evening` / `loop:voyage` / `loop:fray` (its runs side by side, one process each) | ~2 min for all three; measure each after the split | 90 / 60 / 60 s | 5 min |
| `npm run walk:landforms` (three worlds) | ~30 s | 60 s | 5 min |
| `npm run build` | ~10-15 s | 30 s | 5 min |
| `npm run check:units` | ~30 s | 60 s | 5 min |

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
