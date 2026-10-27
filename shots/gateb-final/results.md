# Gate B final retake, 2026-10-27

- Commit tested: `01ac13b` (origin/main, "Town frames: fewer draws in the view and the sun's shadow map (gate B vsync) (#207)"), detached, clean tree; submodule vendor/assetgenerator at 1b7a134
- Worktree `C:\Projekte\MasterWorld-gateb`; `npm ci`, `npm run packs`, `npm run build` all ok
- RTX 5070, WebGPU (SHOT_GPU=1, SET_GL=0), 1920×1080
- Machine quiet: no other Playwright/Chromium browser running (two stale, idle `npm run packs` and an idle shot watcher from other threads were left alone)

## Verdict

| Check | Result |
|---|---|
| Shot set (`npm run shot:set`) | **pass**: exit 0, **23** shots (the set now has hold-crag and hold-warden on top of the 21), 0 errors, nothing missing, 266 s |
| F2 (p50 over 16.7 ms or over 2× town-noon) | **pass**: worst p50 12.4 ms (title); 2× town-noon = 19.0 ms |
| F3 (shader policy) | **pass**: 0 violations; worst compile 14 ms |
| Vsync p95 ≤ 25 ms | **pass** for all six scenes, standing and walking (p95 18.1 ms everywhere) |
| `npm run loop` | **pass**: 6 of 6 in 23.4 s |
| `npm run load` (title ≤ 1 s, playable ≤ 20 s) | **pass**: title 0.38 s, playable 16.5 s |

## Shot set ([index](2026-10-27-01ac13b/index.md), [log](set.log))

| # | Shot | p50 ms | p95 ms | Errors | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|---|
| 01 | title | 12.4 | 15.9 | 0 | 80 + 2, 14 ms | over the 12 ms aim |
| 02 | creator | 9.4 | 11.3 | 0 | 80 + 4, 14 ms |  |
| 03 | town-noon | 9.5 | 11.7 | 0 | 82 + 0, 12 ms |  |
| 04 | pack | 5.3 | 11.4 | 0 | 82 + 0, 12 ms |  |
| 05 | map | 9.2 | 11.9 | 0 | 82 + 0, 12 ms |  |
| 06 | town-dusk | 10.4 | 14.1 | 0 | 82 + 2, 12 ms |  |
| 07 | town-night | 10.9 | 14.4 | 0 | 82 + 2, 12 ms |  |
| 08 | town-rain | 11.9 | 16.6 | 0 | 82 + 2, 12 ms |  |
| 09 | paddock | 7.9 | 13.1 | 0 | 82 + 2, 12 ms |  |
| 10 | trade | 9.7 | 17.0 | 0 | 82 + 2, 12 ms |  |
| 11 | town-wet-sun | 10.1 | 13.3 | 0 | 82 + 1, 10 ms |  |
| 12 | cellar | 4.0 | 11.4 | 0 | 73 + 25, 9 ms |  |
| 13 | barrow | 6.1 | 8.7 | 0 | 72 + 26, 10 ms |  |
| 14 | wild | 7.0 | 9.2 | 0 | 72 + 28, 10 ms |  |
| 15 | fight | 6.0 | 7.6 | 0 | 72 + 30, 10 ms |  |
| 16 | inn | 8.1 | 10.0 | 0 | 79 + 0, 9 ms |  |
| 17 | talk | 8.8 | 11.5 | 0 | 83 + 0, 12 ms |  |
| 18 | hamlet | 7.3 | 20.5 | 0 | 74 + 0, 10 ms |  |
| 19 | road | 6.6 | 8.0 | 0 | 74 + 6, 10 ms |  |
| 20 | village | 5.9 | 8.2 | 0 | 72 + 7, 9 ms |  |
| 21 | hold | 6.8 | 9.1 | 0 | 72 + 25, 11 ms |  |
| 22 | hold-crag | 6.3 | 8.9 | 0 | 72 + 25, 11 ms |  |
| 23 | hold-warden | 7.1 | 9.5 | 0 | 72 + 25, 11 ms |  |

## Vsync ([vsync-probe.mjs](vsync-probe.mjs), [log](vsync.log))

Headed window, vsync on, fresh page per scene, 10 s standing then 10 s walking (W held). Same probe as the first gate B run, plus `room=guild`.

| Scene | Stand p50 | Stand p95 | Stand max | Walk p50 | Walk p95 | Walk max | Frames >25 ms (stand/walk) | ≤ 25 ms? |
|---|---|---|---|---|---|---|---|---|
| town-noon | 17.3 | 18.1 | 18.7 | 17.3 | 18.1 | 35.8 | 0 / 1 | pass |
| town-dusk | 17.5 | 18.1 | 18.8 | 17.4 | 18.1 | 35.5 | 0 / 2 | pass |
| town-night | 17.5 | 18.1 | 19.7 | 17.3 | 18.1 | 18.6 | 0 / 0 | pass |
| town-rain | 17.5 | 18.1 | 18.6 | 17.4 | 18.1 | 18.7 | 0 / 0 | pass |
| village | 17.1 | 18.1 | 18.8 | 17.3 | 18.1 | 19.0 | 0 / 0 | pass |
| room=guild | 17.2 | 18.1 | 18.8 | 17.2 | 18.1 | 18.6 | 0 / 0 | pass |

No page errors in any scene. Compared with e879ab7, noon (walking), night and rain went from p95 ≈ 35 ms (6–8 % missed refreshes) to 18.1 ms with at most 2 missed refreshes in 10 s.

## Load ([load.log](load.log))

title 0.38 s · playable 16.5 s (limit 20 s) · start download 95.6 MB. Only the title theme loads at the start. Was 20.6 s (fail) on e879ab7.

## Loop ([loop.log](loop.log))

All 6 passed in 23.4 s:

- masterworld, 6 evenings: 6 cleared, 0 falls, 799 copper, power 18.8 → 34.1
- alpha, 6 evenings: 6 cleared, 0 falls, 1065 copper, power 18.8 → 35.2
- x4, 6 evenings: 6 cleared, 0 falls, 1540 copper, power 18.8 → 34.9
- reckless evening: 1 cleared, 1 fall (as intended)
- village, 3 evenings: 3 cleared, 2 falls, 556 copper, power 18.8 → 34.5
- hamlet, 2 evenings: 2 cleared, 0 falls, purse 511. The summary still says "0 copper earned" though the log shows 305 then 511 copper brought back (same as last run).
