# Phase L GPU checks, round 5

Build: origin/claude/project-thread-22uuci @ e332e42 ("Mesa walls: beds no longer shear into swirls ... the climb shot logs the drawn pose").
package-lock unchanged, so no npm ci; submodule updated; `npm run build`. GPU (`SHOT_GPU=1`), muted.

## Climb: why the hero looks like walking
The log answers it: **in every line on the face the drawn body is `rigged:true` but `clip:"idle"` and `handUp:null`**,
from "on the face" through every climb step to the pull. `yaw` equals `walkerYaw` all the way (about -2.88 to -2.93 rad),
so the body is turned like the walker and isn't the problem. The climb never sets a climbing clip or a hand pose; the
idle clip plays while the walker is moved up the face.
`climb: ok`, climbed 132.3 m, end in `pull` at (-30800.9, 196.9, 35368.4); shaders 76 + 26, worst 10 ms, policy ok.

Frames:
- **1-040, 1-160, 1-288** (low, middle, near the top): the hero stands upright side-on in the idle pose: arms down,
  sword at the side, feet together or mid-step. **No arms up, no hands on the rock.** No holds visible. No contact shadow.
- **Wall texture: the wood grain is gone.** The face now reads as cracked rock plates with soft banding (round 4 had flowing swirls).
- **0-at-the-foot** is still broken, unchanged from round 4: no hero in view; the left half is a flat untextured
  pale grey area with grass standing on it, and a grey smear runs down the wall.
- Pull frames (1-302..1-304): upright at the rim, same as round 4.

## Landscape shots (`seed=masterworld&fly&hud&weather=clear`, SHOT_WAIT 5 s)
| file | query | HUD frame | shaders (warm-up + later, worst) | violations |
|---|---|---|---|---|
| far-mesas.png | pos=-30820,260,35350 look=0,-6 hour=16 | 16.8 ms | 72 + 30, 12 ms | 0 |
| plateau-view-south.png | pos=-30652,400,35378 look=180,-20 hour=16 | 16.9 ms | 73 + 31, 11 ms | 0 |
| valley-noon.png | pos=-30820,34750 look=180,6 hour=12 | 16.9 ms | 74 + 13, 10 ms | 0 |
| overview.png | pos=-30820,352,34200 look=180,-12 hour=11 | 16.7 ms | 72 + 32, 12 ms | 0 |
No page errors in any run. 0 drawn late.

- **far-mesas: W-shaped teeth are much reduced.** The two small mesas on the left now show fine dark vertical ribs/ticks
  along the wall instead of big W teeth; still a regular comb pattern, but no longer saw-like.
- **far-mesas: the near wall still has dense diagonal stripes** (pale tan, unchanged).
- **plateau-view-south**: the camera at 400 m clears the woods. Mesa walls to the south read as rock (good), with a few
  pillars. **But the start valley is not in view: it lies north of this spot** (the town is around z 34200-34750, lower z
  = north). Looking south shows the plateau woods and the mesa country beyond, not the valley.
- overview, valley-noon: unchanged and fine. Overview's right-hand far walls keep their vertical ribs.

## Load (`npm run load`, GPU), four runs
- run 1: playable **37.2 s**, FAIL; run 2: **22.4 s**, FAIL. Both ran right after the climb and shots; other threads
  may have been using the GPU/PC then (no other MasterWorld shot runs were up when I checked afterwards).
- run 3: playable **19.2 s**, ok (load-run3.txt); run 4: **19.5 s**, ok.
So on a quiet PC it passes, but only 0.5-0.8 s under the limit.

## Full climb console output
```
> masterworld@0.0.0 shot:climb
> node tools/shot/climb.mjs shots/phaseL5/climb
start {"mode":"ground","x":-30826,"y":64.61342363565512,"z":35266,"rigged":false,"clip":"idle","yaw":-2.8796376927844918,"walkerYaw":-2.8796376927844918,"handUp":null}
shots\phaseL5\climb\0-at-the-foot.jpg
on the face {"mode":"climb","x":-30817.16992561123,"y":70.47188755698286,"z":35298.78377933872,"rigged":true,"clip":"idle","yaw":-2.8823014404508105,"walkerYaw":-2.8823014404508105,"handUp":null}
{"mode":"climb","x":-30816.872180021677,"y":71.77510755702352,"z":35299.90659327353,"rigged":true,"clip":"idle","yaw":-2.8827164458765013,"walkerYaw":-2.8827164458765013,"handUp":null}
shots\phaseL5\climb\1-016-climb.jpg
{"mode":"climb","x":-30816.15885856138,"y":75.28858255702384,"z":35302.60440994399,"rigged":true,"clip":"idle","yaw":-2.8837655902014987,"walkerYaw":-2.8837655902014987,"handUp":null}
shots\phaseL5\climb\1-024-climb.jpg
{"mode":"climb","x":-30815.52046484153,"y":78.8162525570647,"z":35305.02884876218,"rigged":true,"clip":"idle","yaw":-2.884771221683511,"walkerYaw":-2.884771221683511,"handUp":null}
shots\phaseL5\climb\1-032-climb.jpg
{"mode":"climb","x":-30814.830805657577,"y":82.31544755700423,"z":35307.659429346146,"rigged":true,"clip":"idle","yaw":-2.8859296298026367,"walkerYaw":-2.8859296298026367,"handUp":null}
shots\phaseL5\climb\1-040-climb.jpg
{"mode":"climb","x":-30814.136883990395,"y":85.81464255704509,"z":35310.319177375655,"rigged":true,"clip":"idle","yaw":-2.8871718911504263,"walkerYaw":-2.8871718911504263,"handUp":null}
shots\phaseL5\climb\1-048-climb.jpg
{"mode":"climb","x":-30813.575240179613,"y":89.34231255698462,"z":35312.48206401427,"rigged":true,"clip":"idle","yaw":-2.8882344743607784,"walkerYaw":-2.8882344743607784,"handUp":null}
shots\phaseL5\climb\1-056-climb.jpg
{"mode":"climb","x":-30813.053435478196,"y":92.85578755698494,"z":35314.50016853604,"rigged":true,"clip":"idle","yaw":-2.889268031741047,"walkerYaw":-2.889268031741047,"handUp":null}
shots\phaseL5\climb\1-064-climb.jpg
{"mode":"climb","x":-30812.60009167157,"y":96.36926255698526,"z":35316.26060444176,"rigged":true,"clip":"idle","yaw":-2.8902025815895174,"walkerYaw":-2.8902025815895174,"handUp":null}
shots\phaseL5\climb\1-072-climb.jpg
{"mode":"climb","x":-30812.207094750214,"y":99.89676255698559,"z":35317.79228957476,"rigged":true,"clip":"idle","yaw":-2.891040491043948,"walkerYaw":-2.891040491043948,"handUp":null}
shots\phaseL5\climb\1-080-climb.jpg
{"mode":"climb","x":-30811.85506423646,"y":103.43854255704672,"z":35319.168889321365,"rigged":true,"clip":"idle","yaw":-2.891813100452109,"walkerYaw":-2.891813100452109,"handUp":null}
shots\phaseL5\climb\1-088-climb.jpg
{"mode":"climb","x":-30811.533550108485,"y":106.96629755700651,"z":35320.43006595276,"rigged":true,"clip":"idle","yaw":-2.8925370467387537,"walkerYaw":-2.8925370467387537,"handUp":null}
shots\phaseL5\climb\1-096-climb.jpg
{"mode":"climb","x":-30811.238538349353,"y":110.49379755700683,"z":35321.59066825479,"rigged":true,"clip":"idle","yaw":-2.8932167807062323,"walkerYaw":-2.8932167807062323,"handUp":null}
shots\phaseL5\climb\1-104-climb.jpg
{"mode":"climb","x":-30810.954023240283,"y":113.99316255698689,"z":35322.71312991034,"rigged":true,"clip":"idle","yaw":-2.8938864152744657,"walkerYaw":-2.8938864152744657,"handUp":null}
shots\phaseL5\climb\1-112-climb.jpg
{"mode":"climb","x":-30810.676356859338,"y":117.46396755704801,"z":35323.811637416,"rigged":true,"clip":"idle","yaw":-2.894553327104495,"walkerYaw":-2.894553327104495,"handUp":null}
shots\phaseL5\climb\1-120-climb.jpg
{"mode":"climb","x":-30810.401928396008,"y":121.00583255702807,"z":35324.900386702066,"rigged":true,"clip":"idle","yaw":-2.895225522055247,"walkerYaw":-2.895225522055247,"handUp":null}
shots\phaseL5\climb\1-128-climb.jpg
{"mode":"climb","x":-30810.12538145241,"y":124.58407755706878,"z":35326.000687022446,"rigged":true,"clip":"idle","yaw":-2.895916097026261,"walkerYaw":-2.895916097026261,"handUp":null}
shots\phaseL5\climb\1-136-climb.jpg
{"mode":"climb","x":-30809.8373299085,"y":128.18850255706906,"z":35327.150204392055,"rigged":true,"clip":"idle","yaw":-2.8966495413483906,"walkerYaw":-2.8966495413483906,"handUp":null}
shots\phaseL5\climb\1-144-climb.jpg
{"mode":"climb","x":-30809.55012438775,"y":131.701892557048,"z":35328.29993343147,"rigged":true,"clip":"idle","yaw":-2.8973952597707604,"walkerYaw":-2.8973952597707604,"handUp":null}
shots\phaseL5\climb\1-152-climb.jpg
{"mode":"climb","x":-30809.253177340026,"y":135.18706255698623,"z":35329.49252433036,"rigged":true,"clip":"idle","yaw":-2.898181488078596,"walkerYaw":-2.898181488078596,"handUp":null}
shots\phaseL5\climb\1-160-climb.jpg
{"mode":"climb","x":-30808.96104610991,"y":138.7004525570662,"z":35330.66970868904,"rigged":true,"clip":"idle","yaw":-2.8989701292774304,"walkerYaw":-2.8989701292774304,"handUp":null}
shots\phaseL5\climb\1-168-climb.jpg
{"mode":"climb","x":-30808.653871739723,"y":142.22803755698436,"z":35331.91183151271,"rigged":true,"clip":"idle","yaw":-2.899815677130994,"walkerYaw":-2.899815677130994,"handUp":null}
shots\phaseL5\climb\1-176-climb.jpg
{"mode":"climb","x":-30808.36087175958,"y":145.74151255698365,"z":35333.100872779105,"rigged":true,"clip":"idle","yaw":-2.9006378463821276,"walkerYaw":-2.9006378463821276,"handUp":null}
shots\phaseL5\climb\1-184-climb.jpg
{"mode":"climb","x":-30808.074432116005,"y":149.29740255706403,"z":35334.26739162052,"rigged":true,"clip":"idle","yaw":-2.9014564352212626,"walkerYaw":-2.9014564352212626,"handUp":null}
shots\phaseL5\climb\1-192-climb.jpg
{"mode":"climb","x":-30807.786517600536,"y":152.81079255704276,"z":35335.44410639364,"rigged":true,"clip":"idle","yaw":-2.9022940806337245,"walkerYaw":-2.9022940806337245,"handUp":null}
shots\phaseL5\climb\1-200-climb.jpg
{"mode":"climb","x":-30807.499938164645,"y":156.32435255706218,"z":35336.619639336386,"rigged":true,"clip":"idle","yaw":-2.9031426856926186,"walkerYaw":-2.9031426856926186,"handUp":null}
shots\phaseL5\climb\1-208-climb.jpg
{"mode":"climb","x":-30807.221262151772,"y":159.80943755698036,"z":35337.766943705195,"rigged":true,"clip":"idle","yaw":-2.903982155760222,"walkerYaw":-2.903982155760222,"handUp":null}
shots\phaseL5\climb\1-216-climb.jpg
{"mode":"climb","x":-30806.953699186644,"y":163.3369375569794,"z":35338.872477621306,"rigged":true,"clip":"idle","yaw":-2.9048014486883598,"walkerYaw":-2.9048014486883598,"handUp":null}
shots\phaseL5\climb\1-224-climb.jpg
{"mode":"climb","x":-30806.6861871826,"y":166.85049755699882,"z":35339.98179130992,"rigged":true,"clip":"idle","yaw":-2.905633669597871,"walkerYaw":-2.905633669597871,"handUp":null}
shots\phaseL5\climb\1-232-climb.jpg
{"mode":"climb","x":-30806.405083194626,"y":170.349607557018,"z":35341.1518673075,"rigged":true,"clip":"idle","yaw":-2.9065223373852245,"walkerYaw":-2.9065223373852245,"handUp":null}
shots\phaseL5\climb\1-240-climb.jpg
{"mode":"climb","x":-30806.09491343524,"y":173.86316755703754,"z":35342.448287195504,"rigged":true,"clip":"idle","yaw":-2.907519819195076,"walkerYaw":-2.907519819195076,"handUp":null}
shots\phaseL5\climb\1-248-climb.jpg
{"mode":"climb","x":-30805.36689069704,"y":180.0761495844256,"z":35345.514184742664,"rigged":true,"clip":"idle","yaw":-2.909931432986765,"walkerYaw":-2.909931432986765,"handUp":null}
shots\phaseL5\climb\1-264-climb.jpg
{"mode":"climb","x":-30804.711399054406,"y":183.58945458438419,"z":35348.303431222455,"rigged":true,"clip":"idle","yaw":-2.912188049244442,"walkerYaw":-2.912188049244442,"handUp":null}
shots\phaseL5\climb\1-272-climb.jpg
{"mode":"climb","x":-30802.936983508873,"y":187.08873458444404,"z":35356.00371782386,"rigged":true,"clip":"idle","yaw":-2.9187113493289316,"walkerYaw":-2.9187113493289316,"handUp":null}
shots\phaseL5\climb\1-280-climb.jpg
{"mode":"climb","x":-30802.184590855533,"y":190.2523570500007,"z":35362.339769148326,"rigged":true,"clip":"idle","yaw":-2.9235500522785043,"walkerYaw":-2.9235500522785043,"handUp":null}
shots\phaseL5\climb\1-288-climb.jpg
{"mode":"climb","x":-30801.577339389325,"y":193.7800270499393,"z":35365.09268049082,"rigged":true,"clip":"idle","yaw":-2.926059907710953,"walkerYaw":-2.926059907710953,"handUp":null}
shots\phaseL5\climb\1-296-climb.jpg
shots\phaseL5\climb\1-302-pull.jpg
shots\phaseL5\climb\1-303-pull.jpg
shots\phaseL5\climb\1-304-pull.jpg
end {"mode":"pull","x":-30800.85162162826,"y":196.8824681389213,"z":35368.42613776152,"rigged":true,"clip":"idle","yaw":-2.928185908694782,"walkerYaw":-2.928185908694782,"handUp":null} climbed 132.3 m
shaders 76 warm-up + 26 later · worst 10 ms · policy ok
climb: ok
```
