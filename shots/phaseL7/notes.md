# Phase L round 7: climb rig fix

Build: claude/project-thread-22uuci @ b723bdf ("The hero's rig is fitted in the hero's own frame ...").
(A plain `git fetch origin <branch>` only updated FETCH_HEAD; the first run was still d3ed992, so I forced the ref and re-ran.)
GPU (`SHOT_GPU=1`), muted. No package-lock change.

## Climb (`npm run shot:climb -- shots/phaseL7/climb`)
`climb: ok`, climbed 132.4 m; shaders 75 + 27, worst 14 ms, policy ok. Full log: climb-log.txt.

- handUp is up from 0.42 to about **0.65** in every line. The hand's height now matches the hold's
  (handAt y 71.04 vs goal y 71.02).
- **toGoal is still 0.21-0.25 m, not near 0.** The miss is horizontal, toward the wall. Taking the first line,
  goal - at = (-0.09, +0.63, +0.58) and handAt - at = (-0.09, +0.65, +0.33), so the hand stops 0.25 m short of the hold in z.
- The hold is only about 0.63 m above `at`, roughly hip or chest height, not overhead.
- clip stays "idle"; yaw = walkerYaw.

Frames:
- 1-040, 1-160: the pose changed. The knees are drawn up and one arm points straight out level. The body is still upright and
  seen side-on, so it reads as a sitting or kicking pose in front of the face, not hanging on it.
  No arm reaches up, no hand is on the rock, and no hand-over-hand alternation shows between frames.
- 1-288: a crouched, bunched-up pose with an arm bent up near the face. That's the closest to climbing.
- 1-295-pull: standing upright at the rim with one arm out level. It doesn't read as a pull-up.
  1-297-ground: walking on the ledge just under the grass edge.
- Wall: rock plates, no wood grain (as in round 5).

## Hatch (`npm run shot:hatch -- shots/phaseL7/hatch`)
`hatch: ok`. Shaders 80 + 9, **worst 21 ms** (policy ok). No errors in the log.
- 1-down-04: the hero crouches at the hatch edge beside the ladder rail with the arms forward, going down. Plausible.
- 3-up-05: the hero is in the hole beside the ladder, head and shoulders above the floor. Fine.
- 4-out-again: standing in the room by the closed hatch, "E Climb down" prompt. Fine.
Nothing looks broken by the rig change.

## Load (`npm run load`, quiet PC)
title 0.50 s, playable **19.1 s**, load: ok.

## Climb console, first lines
```
> masterworld@0.0.0 shot:climb
> node tools/shot/climb.mjs shots/phaseL7/climb
start {"mode":"ground","x":-30826,"y":64.61342363565512,"z":35266,"rigged":false,"clip":"idle","yaw":-2.8796376927844918,"walkerYaw":-2.8796376927844918,"handUp":0.42340842671981704,"toGoal":587.3116536592809,"handAt":[-106.15,65.04,-573.97],"goal":[0,0,0],"at":[-106,64.61,-574],"goalW":0}
on the face {"mode":"climb","x":-30817.146398465586,"y":70.60485287667996,"z":35298.90532567153,"rigged":true,"clip":"idle","yaw":-2.8823487416629145,"walkerYaw":-2.8823487416629145,"handUp":0.6519119897954226,"toGoal":0.24175430294294384,"handAt":[-97.23,71.04,-540.73],"goal":[-97.23,71.02,-540.48],"at":[-97.14,70.39,-541.06],"goalW":1}
{"mode":"climb","x":-30816.841766714922,"y":71.93229787672043,"z":35300.054349782964,"rigged":true,"clip":"idle","yaw":-2.8827746887068533,"walkerYaw":-2.8827746887068533,"handUp":0.654769939331203,"toGoal":0.2491644063945605,"handAt":[-96.94,72.25,-539.66],"goal":[-96.95,72.22,-539.41],"at":[-96.85,71.59,-539.99],"goalW":1}
{"mode":"climb","x":-30816.11310104608,"y":75.57165787674063,"z":35302.810989422935,"rigged":true,"clip":"idle","yaw":-2.883850917728123,"walkerYaw":-2.883850917728123,"handUp":0.6542832685805848,"toGoal":0.21427365290672382,"handAt":[-96.22,75.89,-536.89],"goal":[-96.22,75.88,-536.67],"at":[-96.12,75.24,-537.22],"goalW":1}
{"mode":"climb","x":-30815.457613164417,"y":79.1933378767001,"z":35305.30136411054,"rigged":true,"clip":"idle","yaw":-2.884889286798429,"walkerYaw":-2.884889286798429,"handUp":0.662003071751613,"toGoal":0.1971847956842561,"handAt":[-95.56,79.55,-534.39],"goal":[-95.57,79.53,-534.19],"at":[-95.46,78.88,-534.72],"goalW":1}
{"mode":"climb","x":-30814.733448928622,"y":82.83788287674055,"z":35308.065247239305,"rigged":true,"clip":"idle","yaw":-2.886115158275912,"walkerYaw":-2.886115158275912,"handUp":0.6694980843628713,"toGoal":0.1607176096946056,"handAt":[-94.83,83.27,-531.58],"goal":[-94.85,83.27,-531.42],"at":[-94.73,82.6,-531.91],"goalW":1}
...
end {"mode":"ground","x":-30800.756831478608,"y":197.0823820968575,"z":35368.89331838916,"rigged":false,"clip":"jog","yaw":-2.9282013840849186,"walkerYaw":-2.9282013840849186,"handUp":0.4519708587929756,"toGoal":1.0209543635568878,"handAt":[-80.92,197.53,-471.06],"goal":[-81.12,196.92,-471.85],"at":[-80.76,197.08,-471.11],"goalW":0} climbed 132.4 m
shaders 75 warm-up + 27 later · worst 14 ms · policy ok
climb: ok
```
