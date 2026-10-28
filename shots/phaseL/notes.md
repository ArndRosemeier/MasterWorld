# Phase L shots (landforms, rocks, mesa country)

Build: origin/claude/project-thread-22uuci @ 025ab93 (L3 landscape kinds and mesa country).
WebGPU on the PC's GPU (`SHOT_GPU=1`), muted, 1280x800, `seed=masterworld&fly&hud`, SHOT_WAIT 5-6 s.
The app's parameter is `hour=` (not `time=`). A 3-number `pos` is an absolute `x,y,z`.

| file | query (after seed/fly/hud) | HUD frame |
|---|---|---|
| valley-noon.png | pos=-30820,34750 look=180,6 hour=12 | 16.7 ms |
| valley-dusk.png | same, hour=19.5 | 16.7 ms |
| wall-close.png | pos=-30700,35020 look=180,18 hour=15 | 19.9 ms |
| plateau-top.png | pos=-30820,35350 look=0,-4 hour=16 | 20.3 ms |
| plateau-top-raised.png (extra) | pos=-30820,260,35350 look=0,-14 hour=16 | 16.7 ms |
| overview.png | pos=-30820,352,34200 (about 300 m up) look=180,-12 hour=11 | 19.2 ms |
| overview-ground.png | pos=-30820,34200 look=180,-12 hour=11 | 17.5 ms |
| tor.png | pos=-30728,33960 look=0,6 hour=15 | 20.4 ms |
| tor-raised.png (extra) | pos=-30728,95,33900 look=0,-12 hour=15 | 19.4 ms |
| ravine.png | pos=-31023,34700 look=180,4 hour=14 | 17.0 ms |

Shaders in every shot: 72-73 warm-up + 14-32 later, worst block 10-13 ms, 0 violations, 0 drawn late, 0 rebuilt.
No page errors in the console.

## Load (`npm run load`, GPU)
title 0.42 s, playable 19.2 s, every look ready 21.3 s (76 warm-up + 12 later, worst 10 ms, policy ok);
start download 94.1 MB. load: ok.

## What looks wrong
- **plateau-top**: the camera lands at y=106 (ground 104), at the foot of a sheer wall, not on a plateau top.
  Even at y=260 it is still beside the wall. So either the spot is off the plateau or this wall is
  much higher than the planned 40-200 m. Looking north from there shows the sea and small mesas, not the valley.
- **Stripes**: the wall face in plateau-top / plateau-top-raised is pale tan with dense vertical stripes,
  like a stretched texture on a vertical face. It doesn't look like the red banded walls elsewhere.
- **Sawtooth walls**: distant small mesas in plateau-top-raised have zigzag/toothed wall faces (triangular teeth along the cliff).
- **Wall texture**: in valley-dusk the near walls read as horizontal brick courses with dark vertical seams.
  The ravine walls look better (dark streaks down the cliff).
- **overview**: a few small white flat patches float over the forest floor at mid-distance (water planes or decals?).
  Otherwise the mesa country reads well: plateaus, benches, valley with town and river.
- **wall-close**: at that spot the camera stands on the talus/slope (y=93), so the frame is all slope
  (cracked-rock texture, looks fine). No wall in view.
- **tor**: from 33960 the tor (185 m north) is hidden by the woods. tor-raised shows it: a pale clearing
  with standing pillars and boulders. Some boulders look half-sunk, but none float.
- Weather was random per shot: noon and overview in rain, so they are dim.
