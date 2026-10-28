# Phase L GPU checks, round 4

Build: origin/claude/project-thread-22uuci @ cb4c72d ("L4 climbing shown"). GPU (`SHOT_GPU=1`), muted, 1280x800,
`seed=masterworld&fly&hud&weather=clear`, SHOT_WAIT 5 s.

| file | query (after the common part) | HUD frame | shaders (warm-up + later, worst block) |
|---|---|---|---|
| far-mesas.png | pos=-30820,260,35350 look=0,-6 hour=16 | 16.8 ms | 72 + 29, 13 ms |
| plateau-view-south.png | pos=-30652,330,35378 look=180,-14 hour=16 | 18.7 ms | 72 + 32, 14 ms |
| valley-noon.png | pos=-30820,34750 look=180,6 hour=12 | 16.8 ms | 73 + 14, 11 ms |
| overview.png | pos=-30820,352,34200 look=180,-12 hour=11 | 16.7 ms | 72 + 32, 11 ms |

All: 0 violations, 0 drawn late, 0 built again. No console errors.

## Load (`npm run load`, GPU), twice
- run 1: title 0.45 s, playable **19.1 s**, load: ok
- run 2: title 0.44 s, playable **19.2 s**, load: ok
(round 3 was 20.4 / 20.5 s and failed; back under the 20 s limit.)

## Climb (`npm run shot:climb -- shots/phaseL4/climb`)
`climb: ok`, climbed 132.3 m, ended in `pull` at (-30800.8, 196.9, 35368.7); shaders 77 + 25, worst 13 ms, policy ok.
39 JPEGs in climb/ (0-at-the-foot, 1-016..1-296-climb, 1-303..1-305-pull).

How it looks:
- **The hero does not look like climbing.** In every climb frame (e.g. 1-016, 1-040, 1-160, 1-296) the hero is seen
  side-on in an upright walking pose: legs mid-stride, arms down, the sword in one hand. No hands on the rock,
  no hand-over-hand. The camera looks straight at the face, so the hero reads as standing/walking in front of the
  wall, not hanging on it. I can't tell whether the feet touch the face; there is no contact shadow.
- **No holds visible** on the face in any frame.
- **Wall texture during the climb** looks like swirling wood grain or crazed glaze (big flowing bands plus cracks), not rock.
- **0-at-the-foot.jpg is broken**: no hero in view; the left half is a flat untextured pale grey/white area with
  grass blades standing on it (a hole or missing ground?), and a grey smear down the wall.
- 1-305-pull: the hero stands at the rim just below the grass edge, upright; the pull-up isn't readable as one.

## Landscape: what still looks wrong (same as round 3)
- far-mesas: the two small mesas to the north-west still have W-shaped teeth; the wall beside the camera is still
  pale tan with dense diagonal stripes.
- plateau-view-south: mostly the plateau's own woods; the mesa rim and the far mountains show; a far wall at right
  is brown-red rock. The valley itself is hidden by the trees (camera 330 m is only just above them).
- overview: unchanged from round 3 (good); far walls at right still have vertical ribs; two small ponds by wall feet.
- valley-noon: unchanged, good.
