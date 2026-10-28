# Phase L shots, round 3

Build: origin/claude/project-thread-22uuci @ 7794398 ("L3: far walls filtered over a 3x3 box, rock from some 35 degrees").
WebGPU on the PC's GPU (`SHOT_GPU=1`), muted, 1280x800, `seed=masterworld&fly&hud&weather=clear`, SHOT_WAIT 5 s.

| file | query (after the common part) | HUD frame | shaders (warm-up + later, worst block) |
|---|---|---|---|
| far-mesas.png | pos=-30820,260,35350 look=0,-6 hour=16 | 16.7 ms | 72 + 29, 11 ms |
| far-mesas-2.png | pos=-30820,330,34200 look=0,-8 hour=16 | 20.6 ms | 72 + 32, 14 ms |
| valley-noon.png | pos=-30820,34750 look=180,6 hour=12 | 16.8 ms | 73 + 14, 10 ms |
| overview.png | pos=-30820,352,34200 look=180,-12 hour=11 | 21.0 ms | 72 + 32, 12 ms |
| plateau-view.png | pos=-30652,330,35378 look=0,-14 hour=16 | 19.8 ms | 72 + 32, 11 ms |

Every shot: 0 violations, 0 drawn late, 0 built again. No console errors.

## Load (`npm run load`, GPU), run twice
- run 1: title 0.43 s, playable 20.5 s, every look 22.6 s (75 + 13, worst 10 ms) -> **load: FAIL**
- run 2: title 0.51 s, playable 20.4 s -> **FAIL playable after 20.4 s (limit 20 s)** (full log: load.txt)
- Round 1 (025ab93) was 19.2 s / ok, so start is about 1.2 s slower now, just over the limit.

## What still looks wrong
- **Toothed far mesas: unchanged.** far-mesas.png and plateau-view.png: the two small mesas north-west
  (toward the coast) still show W-shaped teeth along their walls, same as in round 2.
- **Pale striped wall beside the camera: unchanged.** far-mesas.png: the big wall at -30820,35350 is still pale tan
  with dense diagonal stripes, not red rock. plateau-view.png shows the same pale tan, streaked walls on the
  plateau's north side, plus a saw-toothed line along a bench (about 930-1000,540).
- valley-noon and overview look the same as round 2 (good: red rock, no white sheets; the small ponds near the wall feet stay).
  overview: the far walls on the right still show regular vertical ribs.
- far-mesas-2 looks north from above the town: mostly coast and low hills, little mesa country in view.
- plateau-view looks north and so shows the coast side, not the start valley (the valley is to the south).
