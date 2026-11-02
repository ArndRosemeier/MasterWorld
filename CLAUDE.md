# Working on MasterWorld

1. **Design first:** read [docs/design/masterworld-plan.md](docs/design/masterworld-plan.md) before larger changes.
2. **Shaders follow [docs/SHADERS.md](docs/SHADERS.md):** at most a third of every second goes to shader compiles, each compile aims for 10 ms, compiles are spread out (one per frame, then wait twice the compile's time), and nothing compiles on the render path. Rendering uses a floating origin: patterns, noise and masks read `WORLD` from `src/render/origin.ts`, and GPU-placed geometry is pinned to `ORIGIN` (docs/SHADERS.md).
3. **Tests follow [docs/CHECKS.md](docs/CHECKS.md):** at most 5 s per test, 70 s for all of `npm test` (Arnd 2026-11-01). Browser and other slow checks are separate scripts, at most 5 min each.
4. **No duplicates:** search before writing a helper; run `npm run dup` and `npm run repeated` (toolbox finders in `tools/`). Every PR description has a `COPIES:` line.
5. **No `Math.random`.** Every random number comes from a seed.
6. **PRs are merged to `main` automatically** once CI (`.github/workflows/ci.yml`: `npm test` and `npm run build`) is green.
7. **Shared code comes from packages** (D23): `@futuremagic/core` and `@futuremagic/stage` from the AssetGenerator submodule (`vendor/assetgenerator`, clone with `--recurse-submodules`). Do not copy their code.
8. **Layers** are in `tools/guards/rules.json`: `src/world`, `src/setting` and `src/vgm` are pure (no three.js), so they run in workers and tests.
9. **Build in plan order:** [docs/design/implementation-plan.md](docs/design/implementation-plan.md) says what comes next and when a step is done. Every PR description has a `PLAN:` line (`PLAN: A2 trade`, `PLAN: floor F4`, `PLAN: fix`).
10. **The VGM's tools live in `src/vgm`** (D51): anything the VGM can make (a place, a dungeon kind, an encounter, an event, an order) is a tool there, its data in the setting, and gets its row in [docs/design/vgm.md](docs/design/vgm.md). The app only applies decisions; it never decides what the world gets.
11. **Show, don't tell** (Arnd): if an action can be rendered, render it. Doors swing, lids lift, the hero is seen climbing a ladder, kneeling to search; no text note saying what happened, no teleport or jump cut to skip it. Text only for what cannot be shown (reading a written thing, a rare urgent cry).

Checks: `npm test` (unit tests and guards), `npm run build` (typecheck and bundle), `npm run shot -- "?gl&hud" shots/x.png` (headless screenshot after a build). In the cloud container set `CHROMIUM_PATH=/opt/pw-browsers/chromium-1243/chrome-linux64/chrome` and use `?gl`.
