# Phase L shots, round 2 (mesa country fixes)

Build: origin/claude/project-thread-22uuci @ 9915f28 ("L3: mesa walls look like rock, no white sheets by them, no saw on far walls").
WebGPU on the PC's GPU (`SHOT_GPU=1`), muted, 1280x800, `seed=masterworld&fly&hud&weather=clear`, SHOT_WAIT 5 s.

| file | query (after the common part) | HUD frame | shaders (warm-up + later, worst block) |
|---|---|---|---|
| valley-noon.png | pos=-30820,34750 look=180,6 hour=12 | 16.7 ms | 74 + 13, 11 ms |
| valley-dusk.png | same, hour=19.5 | 19.4 ms | 73 + 29, 14 ms |
| ravine.png | pos=-31023,34700 look=180,4 hour=14 | 16.7 ms | 73 + 29, 10 ms |
| wall-near.png | pos=-30760,35150 look=180,10 hour=15 | 19.6 ms | 73 + 31, 12 ms |
| plateau-top.png | pos=-30652,35378 look=180,-6 hour=16 | 16.9 ms | 73 + 31, 12 ms |
| overview.png | pos=-30820,352,34200 look=180,-12 hour=11 | 16.7 ms | 72 + 32, 11 ms |
| far-mesas.png | pos=-30820,260,35350 look=0,-6 hour=16 | 24.3 ms | 72 + 30, 11 ms |

Every shot: 0 violations, 0 drawn late, 0 built again. No console errors. Weather clear in all (cover 0.08).

## Compared with round 1
- **Brick-like strata: fixed.** Valley walls (noon, dusk, ravine) now read as red-brown rock with fine horizontal
  bands and dark streaks, not brick courses. A pale vertical streak remains on the valley wall at about x=615 in valley-noon/dusk
  (a scar or seep? it looks intentional-ish).
- **White water sheets by walls: mostly gone.** overview.png still has two small pale-blue flat patches at mid distance
  (about 840,450 and 960,420) near wall feet; they now look like small ponds, not floating sheets.
- **Sawtooth far walls: still there.** far-mesas.png: the two small mesas at left (about 160-270,390 and 330-490,415) still have
  zigzag/toothed walls (W shapes). overview.png: some far walls (right side, about 1050-1200,380) show regular vertical ribs/pleats.
- **Pale vertical stripes on walls: still there on one wall.** far-mesas.png: the big wall right beside the camera
  (at -30820,35350) is pale tan with dense diagonal/vertical stripes, unlike the red mesa walls. It may be a different
  landform (it faces north to the sea).

## Framing
- wall-near: the camera lands at y=216, in woods on a slope above the wall, so no wall is in view.
- plateau-top: on the plateau top (y=271), but in woods; trees hide the view over the valley.
- Both spots need a clearing or a raised camera to show what they were meant to show.
