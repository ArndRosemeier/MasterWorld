# Gate B review: GPU shot set, 2026-10-27

- Commit `e879ab7` (origin/claude/project-thread-ni4nqr), worktree `C:\Projekte\MasterWorld-gateb`
- RTX 5070, WebGPU (SET_GL unset, SHOT_GPU=1), 1920×1080
- Shot set: [2026-10-27-e879ab7/index.md](2026-10-27-e879ab7/index.md)

## Verdict

| Check | Result |
|---|---|
| Shot set (`npm run shot:set`, uncapped) | **pass**: exit 0, all 21 shots, 0 console errors, nothing left undrawn |
| F2 (p50 over 16.7 ms, or over 2× town-noon's p50) | **pass**: worst p50 is 13.8 ms (town-rain); 2× town-noon is 21.2 ms |
| F3 (shader policy) | **pass**: 0 violations; worst compile 11 ms |
| Vsync p95 ≤ 25 ms | **fail** for town noon (walking), night and rain. **Pass** for dusk and the village |
| `npm run loop` | **pass**: 6 of 6 in 30.6 s |
| `npm run load` (F4: title ≤ 1 s, playable ≤ 20 s) | **fail**: playable at 20.6 s (24.8 s while another session was rendering). Title shows at 0.41 s, a pass |

## Shot set (uncapped, 2 s per shot)

| # | Shot | p50 ms | p95 ms | Errors | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|---|
| 01 | title | 12.1 | 16.8 | 0 | 83 + 2, 10 ms | over the 12 ms aim |
| 02 | creator | 11.3 | 14.0 | 0 | 83 + 3, 10 ms | |
| 03 | town-noon | 10.6 | 15.0 | 0 | 85 + 0, 11 ms | |
| 04 | pack | 10.5 | 13.2 | 0 | 85 + 0, 11 ms | |
| 05 | map | 3.5 | 12.9 | 0 | 85 + 0, 11 ms | |
| 06 | town-dusk | 11.9 | 16.9 | 0 | 85 + 1, 11 ms | |
| 07 | town-night | 12.6 | 17.4 | 0 | 85 + 1, 11 ms | over the 12 ms aim |
| 08 | town-rain | 13.8 | **32.5** | 0 | 85 + 1, 11 ms | over the 12 ms aim; worst p95 |
| 09 | paddock | 7.4 | 9.6 | 0 | 85 + 1, 11 ms | |
| 10 | trade | 10.7 | 24.7 | 0 | 85 + 1, 11 ms | |
| 11 | town-wet-sun | 12.1 | 17.4 | 0 | 84 + 1, 10 ms | over the 12 ms aim |
| 12 | cellar | 3.9 | 11.0 | 0 | 76 + 25, 9 ms | |
| 13 | barrow | 6.3 | 8.4 | 0 | 76 + 24, 9 ms | |
| 14 | wild | 7.5 | 9.6 | 0 | 76 + 26, 9 ms | |
| 15 | fight | 6.1 | 8.3 | 0 | 76 + 28, 9 ms | |
| 16 | inn | 8.7 | 11.1 | 0 | 82 + 0, 10 ms | |
| 17 | talk | 9.1 | 11.3 | 0 | 86 + 0, 10 ms | |
| 18 | hamlet (new) | 6.6 | 9.0 | 0 | 77 + 1, 11 ms | the ground round the hero looks like flooded, striped water under the reeds; worth a look |
| 19 | road (new) | 8.8 | 14.4 | 0 | 77 + 6, 11 ms | |
| 20 | village (new) | 6.4 | 8.6 | 0 | 76 + 7, 10 ms | |
| 21 | hold | 8.5 | 12.4 | 0 | 76 + 24, 10 ms | |

Run time: 289 s, under the 5 min limit.

## Vsync p95 (gate bar: p95 ≤ 25 ms)

None of `perf.mjs`, `probe.mjs` or `walk.mjs` has a vsync and p95 mode for these scenes, and the game has no frame cap. So [vsync-probe.mjs](vsync-probe.mjs) uses the repo's `launch` (headed window, without the switches that turn off vsync and the frame-rate limit), `drawnNear` and `shadersQuiet`. Each scene gets a fresh page at 1920×1080, then 10 s standing, then 10 s walking forward (W held).

Run on a quiet machine ([vsync-quiet.log](vsync-quiet.log)):

| Scene | Stand p50 | Stand p95 | Stand max | Walk p50 | Walk p95 | Walk max | ≤ 25 ms? |
|---|---|---|---|---|---|---|---|
| town-noon | 17.9 | 18.1 | 36.0 | 17.7 | **35.2** | 54.0 | fail (walking) |
| town-dusk | 17.6 | 18.2 | 36.3 | 17.6 | 18.2 | 54.0 | pass |
| town-night | 17.9 | **35.5** | 53.4 | 17.7 | **34.9** | 52.7 | fail |
| town-rain | 17.9 | **35.4** | 36.6 | 17.7 | **35.2** | 54.0 | fail |
| village | 17.9 | 18.1 | 18.6 | 17.7 | 18.1 | 52.6 | pass |

How to read it: with vsync each frame takes either one refresh (about 17.7 ms here) or two (about 35 ms). p95 jumps to about 35 ms as soon as more than 5% of frames miss a refresh. The failing scenes miss on 6 to 8% of frames (33 to 42 of about 530); the passing scenes miss on up to 3%. Since the uncapped p50 sits at 11 to 14 ms in town, the misses are spikes rather than a frame that is slow on average. The town in rain, at night and while walking is where those spikes cluster. The refresh came out at about 17.7 ms, not 16.7 ms. That may be because this PC has two GPUs (the AMD iGPU drives a 59 Hz display), so the window's compositor may not be on the 60 Hz NVIDIA screen.

An earlier run while another session's headless browser was rendering in software ([vsync-contended.log](vsync-contended.log)) gave the same pattern: it failed noon (walking), night (standing) and rain (walking).

## Loop ([loop.log](loop.log))

All 6 passed in 30.6 s:

- masterworld, 6 evenings: 6 cleared, 0 falls, 799 copper, power 18.8 → 34.8
- alpha, 6 evenings: 6 cleared, 0 falls, 1065 copper, power 18.8 → 35.4
- x4, 6 evenings: 6 cleared, 0 falls, 1531 copper, power 18.8 → 34.5
- reckless evening: 1 cleared, 1 fall (as intended)
- village, 3 evenings: 3 cleared, 2 falls, 556 copper, power 18.8 → 35.5
- hamlet, 2 evenings: 2 cleared, 0 falls. The summary says "0 copper earned, bought nothing", yet the log shows 305 and then 511 copper brought back (paid by the people who asked), and the hero ends with a purse of 511. The summary's earned/spent count looks wrong for the hamlet: it has no inn or shop, and the hero sleeps in a barn.

## Load ([load-quiet.log](load-quiet.log))

title 0.41 s · **playable 20.6 s (limit 20 s): FAIL** · start download 95.8 MB (six start packs 80.8 MB, wildmesh3d 10.55 MB, title music 1.63 MB). Only the title theme loads at the start, which is a pass. The first run, while the other session's browser was busy, was playable only at 24.8 s ([load-contended.log](load-contended.log)).
