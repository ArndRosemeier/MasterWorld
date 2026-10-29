# Phase L round 12: L6 caves (PR #302)

Build 8d02c0b, submodule 595e166 (AG #138). Ref forced, no package-lock change, packs present. GPU (`SHOT_GPU=1`), muted.

## 1. Shot set `--part=caves`: pass (exit 0)
- 13-cave-mouth: p50 10.0 / p95 17.7 ms, 0 shader violations
- 14-cave-cavern: p50 3.7 / p95 5.0 ms, 0 shader violations

**The mouth (13):** a grey weathered crag with a round arched mouth stands at the foot of a tall tan mesa wall, so it's in a cliff, not
on a hillside. The crag reads as a separate rock pasted onto the wall, though: its grey cracked texture is quite different from the tan banded wall
around it, and the wall shows at its right edge.
**The terrain pokes into the tunnel.** Through the opening you see no dark way in but a sunlit tan striped wall. That's
the mesa's own terrain face, standing a few metres inside the mouth and closing it off. The mouths walk frames show the same from close up
(mouths/cave-in-16, cave-in-27, cave-out-06): the hero walks towards a bright tan wall inside the arch.

**The cavern (14):** almost all black. Only the floor around the hero shows, in the lantern's warm circle (cracked stone slabs,
a reddish floor). There's a faint hint of a wall far ahead. No ceiling, no walls, no sense of height.
Extra shots (cavern/, cavern.mjs: same way in, the highest room, then heroCam pitch/yaw set):
- cavern-up-30, cavern-up-60: **black.** At 60° up only a very faint crack pattern shows. The ceiling isn't readable at all.
- cavern-around-90/180/270: the camera ends up close behind or beside the hero (it seems to be pushed in by something), and behind him
  everything is black with faint cracks. You never see a wall lit, and there's no depth.
- The room chosen as "highest" has `height` 6 against 1 for the other 8 rooms (units as the graph gives them); the HUD names it
  "the flooded way (room 3)". No water is visible.
- HUD: "2 built again alike (shaders.repeats())" in the cavern.
So the cavern isn't readable: indoor fog and the small lantern swallow it. It needs light on the walls and ceiling
(glow, shafts, a brighter ambient, or less fog) for "a cavern over 20 m high" to show.

## 2. `npm run shot:mouths`: ok
barrow, cave and tower: walked into the doorway on their own, went in, came out, walked out 1.53-1.54 m. Remains: knelt, taken up.
Shaders 83 + 8, worst 14 ms. The walk itself is clean, but in the cave the hero walks at the tan terrain wall inside the arch
(above) and the switch to below happens in front of it.

## 3. Shot set `--part=land`: pass (exit 0)
cellar 5.1, barrow 10.5, wild 7.4, fight 8.6, fight-magic 9.1, hamlet 11.1 (p95 33.4), road 7.4, village 11.5, hold 11.6 (p95 32.1),
hold-crag 9.1, hold-warden 10.4, hurt-traveller 9.8, raided-farm 12.6 ms p50. 0 violations. Cellar and barrow pictures look as before.

Load (quiet PC): title 0.40 s, playable **19.4 s**, load: ok.

## 4. `npm run variety`: no problems (exit 0)
1000 caves in 11.8 s (the others take 1.2-2.1 s): 1000 distinct layouts, 17 main patterns, 18 patterns, 580 stories, 8 goal rooms
(most common painted-chamber 18.3 %), 10 set pieces. Cellars, barrows, towers and hideouts pass as well; "no problems". The output doesn't list cavern height or
way length, so the "over 20 m / over 200 m" claims aren't shown by this sweep.
