# Phase L round 11: L5 check (start in a mesa valley)

Build 8b068d8 ("Restart the branch from main (L3+L4 merged as #300)"). Ref forced, submodule updated, packs present, `npm run build`.
GPU (`SHOT_GPU=1`, the set draws WebGL 2 on the RTX 5070 at 1080p, as designed), muted.

## F1 set, `--part=town`: FAIL (exit 1), twice
Indexes: set/2026-10-29-8b068d8/index-town.md (run 1), set-rerun/.../index-town.md (run 2). 0 shader violations in every shot, no page errors.
| shot | p50 / p95 ms run 1 | run 2 | mark |
|---|---|---|---|
| title | 17.3 / 39.6 | 18.0 / 36.0 | **over 16.7 ms** (both runs) |
| creator | 16.5 / 35.7 | 15.1 / 30.8 | over the 12 ms aim |
| town-noon | 15.5 / 32.5 | 12.9 / 18.2 | over the 12 ms aim |
| pack | 5.0 / 21.9 | 14.2 / 18.3 | |
| map | 4.2 / 20.8 | 13.4 / 16.5 | |
| town-dusk | 14.2 / 18.6 | 14.6 / 19.0 | over the 12 ms aim |
| town-night | 14.9 / 18.4 | 14.7 / 18.5 | over the 12 ms aim |
| town-rain | 16.9 / 39.8 | 16.8 / 39.6 | **over 16.7 ms** (run 1; run 2 just under) |
| paddock | 10.3 / 16.5 | 10.8 / 15.6 | |
| trade | 13.5 / 24.7 | 13.5 / 24.3 | over the 12 ms aim |
| town-wet-sun | 16.3 / 27.5 | 16.6 / 35.4 | over the 12 ms aim |
| inn | 8.1 / 9.9 | 8.0 / 9.9 | |
| talk | 12.8 / 18.3 | 13.6 / 17.8 | over the 12 ms aim |

**Not caused by L5:** the same title + town sessions on `main` (ff9ab33, L3+L4, old start) also fail:
title 17.7 / 39.4, town-rain 17.7 / 47.7, creator 16.2, town-noon 11.1, dusk 14.8, night 15.4 (main-title-town-log.txt).
So the title and rain shots were already over 16.7 ms before this change. The GPU was idle (0 %) before the runs; no other shot runs were going.

## F1 set, `--part=land`: pass (exit 0)
cellar 5.3, barrow 11.3, wild 7.7, fight 9.2, fight-magic 9.1, hamlet 9.9, road 8.0, village 12.1, hold 12.8 (p95 31.7),
hold-crag 9.8, hold-warden 9.7, hurt-traveller 12.5, raided-farm 12.7 ms p50. 0 violations, no errors.

## How the town looks in its valley
- town-noon / dusk / night: the market square with well, stalls, townsfolk and the saddled horse, all fine. From the square, trees close
  off most of the view; **one mesa wall shows at the top right** (red-brown cliff behind the trees, about x 1370-1500, y 200-290),
  and at dusk the same wall glows faintly. The plateaus aren't otherwise in view from the square.
- The title fly-over shows the valley much better (below).

## Title fly-over (title on, `?seed=masterworld&title`, Space pressed at the gate; title/titlefly.mjs)
Pictures every 10 s for 60 s in title/ (title-00s ... title-60s); frame times per 10 s window:
| t | p50 | p95 | max |
|---|---|---|---|
| 0-10 s | 17.6 | 18.2 | **612 ms** (while the world loads behind the title) |
| 10-20 s | 17.6 | 52.5 | 159 ms |
| 20-30 s | 17.5 | 18.1 | 35.7 |
| 30-40 s | 17.5 | 18.1 | 35.4 |
| 40-50 s | 17.6 | 18.1 | 52.6 |
| 50-60 s | 17.6 | 18.2 | 35.6 |
- title-00s: still the painted loading art ("Dressing the hero").
- title-20s, 40s, 60s: the orbit is over the start town. **The town stays in the middle of every picture** with its fields, the river
  behind it and the woods around. Mesa walls and plateau rims show at the edges: a canyon rim at the left at 20 s, a red cliff and
  plateau at the upper left at 40 s, a plateau with a wall at the upper left at 60 s; snowy mountains far off. The camera seems to get
  lower and closer from 20 s to 60 s. It glides; after 20 s the worst frame is 35-53 ms, so no visible jumps. Not
  over walls in these pictures: it circles the town on the valley floor. The 612 ms and 159 ms hitches fall in the first 20 s,
  while the world is still loading.

## Load (`npm run load`, quiet PC)
title 0.42 s, playable **18.9 s**, start download 93.6 MB, load: ok.
