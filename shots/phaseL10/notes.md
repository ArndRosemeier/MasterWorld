# Phase L round 10: final check before merging

Build 263a52b ("Pull-up over a face starts with the top at the waist ...; the climb shot closer"). Ref forced; submodule
unchanged (9684ffe); no package-lock change. GPU (`SHOT_GPU=1`), muted.

## Climb (`npm run shot:climb -- shots/phaseL10/climb`)
`climb: ok`, climbed 133.8 m; shaders 77 + 25, worst 10 ms, policy ok. The run ends with mode "pull" (at the rim, toGoal 0.26)
rather than "ground", as the last frame is taken during the pull. Full log: climb-log.txt.

- **1-040 (low):** closer camera, from behind and a little above. Both arms are up over the head, hands spread wide on the face, one knee raised.
  No holds are drawn, so the hands rest on plain rock, but they read as on the face.
- **1-160 (middle):** the right arm stretched high, the left bent lower near the head, one leg stepping up: **hand over hand is visible.**
- **1-304 (the last climb frame, at the rim):** both arms up over the lip of grass and leaves, body against the top of the face.
- **1-306-pull:** the hero is over the rim, leaning forward low with one arm down and forward to the ground, legs bent behind.
- **1-307-pull:** crouched on the top, one hand down on the ground in front, one foot stepping up and forward: **reads as pushing up and stepping over the edge.**
- **1-308-pull:** standing up on the top in the woods.
- Overall the climb and the pull-up now read as climbing. The pull is short (3 frames) but there's no jump cut. The hands are flat on the top in 306/307,
  though with "one hand" more visible than both.

## Landscape (`seed=masterworld&fly&hud&weather=clear`, SHOT_WAIT 5 s)
| file | query | frame (log) | shaders (warm-up + later, worst) |
|---|---|---|---|
| far-mesas.png | pos=-30820,260,35350 look=0,-6 hour=16 | **39.7 ms** (first shot of the batch; retake 20.2 ms) | 72 + 30, 12 ms |
| far-mesas-retake.png | same | 20.2 ms | 72 + 30, 11 ms |
| plateau-view.png | pos=-30652,400,35378 look=0,-20 hour=16 | 18.2 ms | 72 + 32, 13 ms |
| valley-noon.png | pos=-30820,34750 look=180,6 hour=12 | 17.1 ms | 74 + 13, 10 ms |
| valley-dusk.png | same, hour=19.5 | 18.5 ms | 74 + 28, 9 ms |
| overview.png | pos=-30820,352,34200 look=180,-12 hour=11 | 20.1 ms | 72 + 32, 14 ms |
All: 0 violations, 0 drawn late, no page errors. The 39.7 ms was a one-off: the retake was 20.2 ms, and the HUD painted into
the same picture shows 18.0 ms.

- **valley-noon:** good. Red-brown banded walls, trees on top, field in front. One pale vertical streak on the wall (as before).
- **valley-dusk:** at 19.5 it's already night: deep blue sky with stars, the walls dark red-brown in moonlight, the plateau tops pale.
  It reads well, but as night rather than dusk; hour ~18.5 may show a real dusk.
- **plateau-view (looking north):** the best view so far. The start town in its fields by the river below, small mesas beyond, the sea
  on the horizon. The plateau's own wall at right is pale tan with fine diagonal stripes, and **a bench along it has a row of dark
  saw teeth** (about x 950-1100, y 540).
- **far-mesas:** unchanged. Small far mesas with fine vertical ribs; the near wall pale tan with dense diagonal stripes.
- **overview:** unchanged and good. Far walls at right with vertical ribs; two small ponds by wall feet.

## Load (`npm run load`, quiet PC)
title 0.40 s, playable **19.2 s**, load: ok (load.txt).
