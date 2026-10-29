# Gate L shots, round 22

Build ce21d33 ("Gate L shots: open spots for the valley and plateau, the tor found farther, the climb from the side").
`dist` deleted and rebuilt fresh; GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted, quiet PC.

**Footer version:** this build shows **v0.283**. The number isn't a stale build. `tools/release/release.ts` counts **first-parent
commits since a base** (`git log --first-parent BASE..HEAD`), and "Keep gate L on main's history" restarted the branch from main,
so the first-parent chain got shorter (round 20's 5b8d2f9 showed v0.286, round 21's 005e397 v0.282). The build is current.

## 1. Caves part
**Run 1 crashed at the first shot** (log-caves-run1-no-valley.txt): `Error: no open floor before a plateau wall round the start`.
I counted the candidates in the game: of 155 directions with a 60 m wall 0.6-2.5 km out, **126 have the spot 450 m before the wall
on another plateau** (mesaRise > 3), 9 are in town ground, 17 in woods, 1 in water. Only 2 pass, and both fail the "open 12 m and 25 m
behind" check. In this mesa valley, 450 m back from a wall is usually up on the next plateau, so the fixed 450 m is too far (a
distance scaled to the valley width, or searching along the ray for the first open floor, would find one).
**Run 2** with a temporary local copy where the valley act doesn't throw (deleted afterwards; nothing committed). So **21-mesa-valley is
just the start square**, not a valley spot.

| shot | p50 | p95 | F2 | judgement |
|---|---|---|---|---|
| 21-mesa-valley | 14.4 | **32.1** | p95 over | (fallback) The town square with the well, stalls, folk and a horse. Not the intended view. |
| 22-mesa-plateau | 8.5 | 13.1 | ok | **Broken: the hero is in a lake.** The camera is at water level, the whole lower 60% is water, and only the hero's head shows in the middle. Far shore: a wooded mesa rim and mountains. The plateau search checks the rim but **not water** (a pond or lake on the plateau top). |
| 23-tor | 8.9 | **28.3** | p95 over | **Partly.** A fine wide view of the valley (fields, a village, red plateau walls behind; no saw teeth, no organ-pipe grooves on these walls, see tor-crop.png). But the tor is only **a small banded tan rock stack at lower left, half hidden by a tree and a grassy knoll**, and no boulders are visible. The camera stands on a knoll and looks past the tor rather than at it. |
| 24-climb | 12.5 | 14.8 | ok | **Still from above.** The hero hangs on the face with both arms up (it reads as climbing), but the view is **steeply down onto the face from above and behind**, not from the side and level. No holds. |
| 25-cave-mouth | 9.8 | **28.8** | p95 over | **Yes** (same as round 21). A dark round mouth in a tan crag; a tree trunk covers the left third. |
| 26-cave-cavern | 4.3 | 9.8 | ok | **Yes** (same as round 21). |
0 shader violations, no page errors. No saw teeth or organ-pipe stripes in view in this run (the walls in tor-crop.png are smooth and banded).

## 2. Title: where the frame goes (`probe.mjs "title&day=0&gl"`, 1920x1080, no Space pressed: the title gate's fly-over)
Full output: probe-title-ce21d33.txt and probe-title-ff9ab33.txt.

| drawn | ce21d33 p50 / p95 | saves | ff9ab33 (before the mesa start) p50 / p95 | saves |
|---|---|---|---|---|
| everything | **16.8 / 37.3** (316 draw calls, render 17.8 ms main thread) | | **18.1 / 36.5** (326 calls, render 18.9) | |
| without **townsfolk** (30 folk, 478 skinned meshes, **4.09 M triangles**) | 11.5 / 16.4 | **5.0** | 13.4 / 19.7 | 2.9 |
| without **terrain** (267 chunks, 2.35 M tris) | 11.8 / 15.9 | **4.5** | 12.1 / 17.9 | 3.4 |
| without **sun shadow redraw** | 13.4 / 15.9 | **3.4** | 12.3 / 15.5 | 3.4 |
| without flora (70 meshes, 148 k) | 15.0 / 18.6 | 1.2 | 13.9 / 18.8 | 2.1 |
| without rocks | 15.3 / 35.8 | 1.2 | 15.4 / 35.6 | 1.9 |
| without town | 15.6 / 39.3 | 0.7 | 15.5 / 28.4 | 0.9 |
| without horse (2, 352 k tris) | 15.0 / 27.2 | 0.6 | 15.4 / 20.2 | 0.4 |
| without hero, sky, sea, grass, hold, retreat, far folk, volumes | | ≈ 0 each | | ≈ 0 each |
| nothing (post chain only) | 4.5 / 6.3 (24 calls) | 12.3 | 3.9 / 5.1 | 12.0 |
Slow frames (over 33 ms, 10 s): 16 of 620; **10 of them are sun-shadow redraw frames** (render 20-40 ms in them vs 15.6 in the rest).
Shaders after warm-up: 17 (2 drawn late), worst block 11 ms, 0 violations.

**Reading:** the title costs the same on ce21d33 and on ff9ab33 (16.8 vs 18.1 ms here), so **the mesa start didn't make it slower**;
round 11's main run (17.7) agrees. The frame goes to **townsfolk (~5 ms: 30 skinned folk with 4 M triangles, all drawn in the
fly-over), terrain (~4.5 ms) and the sun shadow redraw (~3.4 ms, and it makes most of the >33 ms spikes)**, plus a 4.5 ms floor for
the post chain. The set's title figure (19.5) is higher than this probe's 16.8 because the set measures right after the dive
settles. Candidates: draw far townsfolk as the instanced far-folk impostors during the fly-over, and spread the shadow redraw.

## 3. Land part: pass (exit 0), 0 violations, no stall
cellar 5.3, barrow 10.4, wild 8.4, fight 8.4, fight-magic 8.9, hamlet 10.7, road 9.5, **village 16.7 / p95 37.3** (on the line,
exactly 16.7: under or equal, so not marked; round 21 17.3, its rerun 13.8), hold 12.4 / p95 32.7, hold-crag 10.1, hold-warden 10.2,
hurt-traveller 13.3, raided-farm 11.1 ms p50. The village has sat at 14-17 ms since round 21; in rounds 14-20 it was 11.2-11.6.

## To fix
1. mesa-valley: 450 m before the wall lands on another plateau; search along the ray for open floor.
2. mesa-plateau: check for water too (the hero stands in a plateau lake).
3. tor: frame the tor whole with its boulders, from a lower, closer spot facing it.
4. climb: the side view still looks down from above.
5. title: townsfolk + terrain + shadow redraw (see the table).
6. village: 16.7-17.3 ms medians since round 21 (was ~11.5).
