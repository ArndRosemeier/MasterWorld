# Phase L round 9: holds over the head (AG #137)

Build 793ed86, submodule 9684ffe ("figure: Ladder.reach and Ladder.hang"). Ref forced. GPU, muted.
`climb: ok`, climbed 132.5 m; shaders 77 + 25, worst 10 ms, policy ok. Full log: climb-log.txt.

## Numbers
- **toGoal 0.042-0.046 m, under 0.05.**
- **handUp about 0.90** (0.64 in round 8). The hold is about 0.93 m above `at`, and hand and hold agree within about 3 cm in height.

## Frames
- **0-at-the-foot (now from behind):** the hero stands at the foot of the wall, seen from behind, close to the face, among grass,
  with a tree branch over the right half. The wall face near the camera (left third) is pale grey, almost untextured, with faint cracks;
  further along it turns to the tan rock. The old flat white patch is gone. The hero is still standing normally here, before the climb.
- **1-040, 1-048 (low):** seen from behind and above. **Both arms are up over the head**, hands spread at about head-and-a-half
  height, legs apart with one knee raised. Between 040 and 048 the hands shift slightly (in 040 the right hand is clearly higher,
  in 048 both are about level) and the legs swap. So there's some alternation, but it's small at this distance.
- **1-160 (middle):** both arms up, the right one higher, one leg drawn up. Reads as climbing.
- **1-288 (near the top):** both arms up, crouched with knees tucked. Reads as climbing.
- **It now reads as climbing**: a figure on the face, arms up on the rock, legs stepping. Since the camera looks down on the face
  from out in front, the hands are not visibly touching holds (no holds are drawn), so from far off it can also look like "arms raised".
- **Pulls 1-302, 1-303:** the hero is already standing on the ledge under the grass rim. In 302 he stands with one arm out level;
  in 303 he runs on. **No pull-up over the edge is visible**; the last climb frame (1-296) goes straight to standing.

## Climb console (start)
```
> masterworld@0.0.0 shot:climb
> node tools/shot/climb.mjs shots/phaseL9/climb
start {"mode":"ground","x":-30826,"y":64.61342363565512,"z":35266,"rigged":false,"clip":"idle","yaw":-2.8796376927844918,"walkerYaw":-2.8796376927844918,"handUp":0.4291006872843752,"toGoal":587.3213298840994,"handAt":[-106.15,65.04,-573.97],"goal":[0,0,0],"at":[-106,64.61,-574],"goalW":0}
on the face {"mode":"climb","x":-30817.142568842693,"y":70.53104044378745,"z":35298.81696498032,"rigged":true,"clip":"idle","yaw":-2.882307137267517,"walkerYaw":-2.882307137267517,"handUp":0.8991434071954814,"toGoal":0.04235577316375829,"handAt":[-97.26,71.29,-540.76],"goal":[-97.27,71.32,-540.74],"at":[-97.08,70.39,-540.96],"goalW":1}
{"mode":"climb","x":-30816.8452049179,"y":71.83604544374681,"z":35299.93836465196,"rigged":true,"clip":"idle","yaw":-2.882722617684142,"walkerYaw":-2.882722617684142,"handUp":0.8960158117139372,"toGoal":0.046205567200543536,"handAt":[-96.96,72.49,-539.65],"goal":[-96.98,72.52,-539.62],"at":[-96.79,71.59,-539.85],"goalW":1}
{"mode":"climb","x":-30816.127791729585,"y":75.38717544380728,"z":35302.65176645315,"rigged":true,"clip":"idle","yaw":-2.8837804259104964,"walkerYaw":-2.8837804259104964,"handUp":0.8959362028177651,"toGoal":0.045028221306005096,"handAt":[-96.24,76.09,-536.93],"goal":[-96.26,76.12,-536.91],"at":[-96.07,75.19,-537.13],"goalW":1}
...
end {"mode":"ground","x":-30800.73231697886,"y":197.17415528460344,"z":35369.02695973111,"rigged":false,"clip":"jog","yaw":-2.9281911450233373,"walkerYaw":-2.9281911450233373,"handUp":0.40212768228033724,"toGoal":1.1570211197401408,"handAt":[-80.9,197.58,-470.93],"goal":[-81.13,196.92,-471.86],"at":[-80.73,197.17,-470.97],"goalW":0} climbed 132.5 m
shaders 77 warm-up + 25 later · worst 10 ms · policy ok
climb: ok
```
