# Phase L round 8: holds and climb camera

Build 012799e ("Climb shot: the camera behind and to one side, looking up the face"); ref forced as before. GPU, muted.
`climb: ok`, climbed 132.3 m; shaders 77 + 25, worst 11 ms, policy ok. Full log: climb-log.txt.

## Numbers
- **toGoal is 0.065-0.077 m (round 7: 0.21-0.25), so not yet under 0.05.** The remaining gap is again mostly in z,
  towards the wall (hand z -540.74 vs hold z -540.67).
- handUp about 0.64. The hold is about 0.63 m above `at`, so still chest height, not overhead.
- clip "idle", yaw = walkerYaw.

## Frames
- 1-040 and 1-048 (low): the hero is seen from the side, upright, knees a little bent. One arm (the right) is held out
  straight and level, pointing across the face; the other hangs with the sword. Between 040 and 048 the same arm is out,
  only the legs change. **No hand-over-hand, no arm reaching up, no clear grip on the rock.**
- 1-160 (middle): the same pose: level right arm, crouched legs.
- 1-288 (near the top): the same: level right arm, crouched legs; the rim and trees show at the top right.
- Pulls 1-302, 1-303: the hero stands upright on the ledge under the grass rim. In 302 the arm is level and pointing;
  in 303 he walks off. **No pull-up over the edge is visible.**
- Read as a whole, it looks like the hero standing or walking on a slope while pointing, not climbing. Because the hold is at chest
  height in front of him, a hand on it reads as pointing forward rather than gripping overhead.

## Camera
- **No collision.** The face and the climber are both clearly in view in every frame.
- It sits out from the face and above or level with the hero, looking down and across the face, so the face reads like a steep slope.
  It doesn't read as "behind and to one side, looking up". We see the hero's side, not his back, and no sky or rim is above him until near the top.
- 0-at-the-foot.jpg is unchanged: no hero, a flat untextured pale-grey area, a grey smear down the wall.

## Climb console (start)
```
> masterworld@0.0.0 shot:climb
> node tools/shot/climb.mjs shots/phaseL8/climb
start {"mode":"ground","x":-30826,"y":64.61342363565512,"z":35266,"rigged":false,"clip":"idle","yaw":0,"walkerYaw":-2.8796376927844918,"handUp":0.4343162143570396,"toGoal":587.2681011069266,"handAt":[-105.84,65.05,-573.98],"goal":[0,0,0],"at":[-106,64.61,-574],"goalW":0}
on the face {"mode":"climb","x":-30817.145628177866,"y":70.51968988549085,"z":35298.808435091145,"rigged":true,"clip":"idle","yaw":-2.8823042990989833,"walkerYaw":-2.8823042990989833,"handUp":0.6422339213648343,"toGoal":0.07164892851504824,"handAt":[-97.24,71.03,-540.74],"goal":[-97.26,71.02,-540.67],"at":[-97.11,70.39,-541.07],"goalW":1}
{"mode":"climb","x":-30816.848261043702,"y":71.82520488557175,"z":35299.92983391178,"rigged":true,"clip":"idle","yaw":-2.882719655824452,"walkerYaw":-2.882719655824452,"handUp":0.6425944928257508,"toGoal":0.07690562096142961,"handAt":[-96.95,72.23,-539.66],"goal":[-96.97,72.22,-539.58],"at":[-96.82,71.59,-539.98],"goalW":1}
{"mode":"climb","x":-30816.1356974893,"y":75.34785988553095,"z":35302.624820611534,"rigged":true,"clip":"idle","yaw":-2.8837697373528033,"walkerYaw":-2.8837697373528033,"handUp":0.6397296221338706,"toGoal":0.06481877778863375,"handAt":[-96.24,75.83,-536.93],"goal":[-96.25,75.82,-536.87],"at":[-96.11,75.19,-537.26],"goalW":1}
...
end {"mode":"ground","x":-30800.78483943922,"y":196.99386297434836,"z":35368.773972389026,"rigged":false,"clip":"jog","yaw":-2.9281991974179484,"walkerYaw":-2.9281991974179484,"handUp":0.4374257612947474,"toGoal":0.8679263784026198,"handAt":[-80.95,197.43,-471.17],"goal":[-81.13,196.92,-471.85],"at":[-80.78,196.99,-471.23],"goalW":0} climbed 132.3 m
shaders 77 warm-up + 25 later · worst 11 ms · policy ok
climb: ok
```
