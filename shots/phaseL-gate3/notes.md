# Gate L shots, round 23

Build c0a3b14 ("Gate L: mesa shots at fixed open spots; title folk detail by the camera's distance"; footer v0.284).
GPU (`SHOT_GPU=1`, the set draws WebGL 2 at 1080p), muted, quiet PC.

## 1. Caves part: pass (exit 0), 0 shader violations, no page errors
| shot | p50 | p95 | judgement |
|---|---|---|---|
| 21-mesa-valley | 10.1 | **30.3** | **Yes.** Open valley floor (sandy, rippled ground with straw grass), plateau walls ahead and on both sides, wooded rims, a notch between two mesas in the middle. The left wall has dark vertical streaks and one pale vertical streak (a seep?); no saw teeth. Spot (-22341, 37000): h 47.8, mesaRise 0, no water. |
| 22-mesa-plateau | 9.0 | 15.0 | **No: a sand beach at sea level**, with sea and trees, no rim and no drop. Spot **(-25757, 33680)**: `skeleton.mesaRise` says **62.9** there, but `terrain.height` is **1.8 m**. The plateau is in the mesa field but not in the ground the game builds (coast or sea cuts it), so the offline finder trusted mesaRise. It needs a check on the real height (height − valley floor ≥ 60). |
| 23-tor | 13.9 | **113.3** | **No tor in view.** The hero stands on a grassy rise (h 184.8 at (-27268, 44392), mesaRise 69) looking north over a green valley and a plateau wall. The game has a tor at (-27268, 44323), 69 m ahead with L 53 m, and one at (-27247, 44605). But nothing tor-like (rock stacks, boulders) is in the frame: the tor's rocks are hidden or not drawn there. p95 113 ms is one long hitch while it settled (0 violations). |
| 24-climb | 9.9 | 12.0 | **Reads as climbing; the camera is where it was asked to be, but it looks like a top view.** I checked it in a separate run (climb-camprobe.png): hero (-30816.7, 72.6, 35300.7) in climb mode; free camera at (-30821.9, 73.8, 35296.9), **6.5 m off and level** (pitch −1.8°, yaw 126°). So the camera works, but **the face there leans back** (it's a steep slope, not a sheer wall), so a level camera beside it sees the rock run away upward like a floor, and the hero looks like he lies on it. A steeper face, or a camera farther out and lower looking up, would show it as climbing. No holds visible. |
| 25-cave-mouth | 9.7 | 18.2 | Yes (unchanged; a tree trunk covers the left third). |
| 26-cave-cavern | 4.3 | 9.9 | Yes (unchanged). |
No saw teeth or organ-pipe grooves seen in this run.

## 2. Town part: FAIL (exit 1)
The first town run overlapped with two small probe runs of mine and is disturbed (title 30.0 ms; kept as log-town-disturbed-by-my-probes.txt).
**Rerun on a quiet GPU (0 %):**
- **title 18.0 / 38.2** (round 21: 19.5 / 40.5): a little better, still over 16.7.
- **talk 19.2 / 50.7**: over 16.7 too this time (round 21: 15.2 / 48.8).
- creator 12.5/15.0, noon 11.0/14.2, pack 13.3/16.2, map 11.5/15.0, dusk 13.0/19.1, night 15.0/19.0, rain 14.5/18.0, paddock 10.7/14.7,
  trade 11.5/15.1, wet-sun 13.1/17.1, inn 10.6/16.6.

## 3. Village: probe on c0a3b14 vs 5ca1479 (main before the gate branch)
Query `title=0&day=0&gl&hour=16&weather=fair&site=village`, 1920x1080. Full output in the probe-village-*.txt files.

| | c0a3b14 | 5ca1479 |
|---|---|---|
| everything p50 / p95 | **13.9 / 34.4** (353 calls, render 15.0) | **13.0 / 18.1** (337 calls, render 13.4) |
| slow frames | 2 of 682 over 29 ms | 0 of 780 over 27 ms |
| townsfolk drawn | **13 folk, 199 skinned meshes, 1.56 M tris**: saves **2.7** | 10 folk, 152 meshes, 1.21 M tris: saves 3.0 |
| town | 438 meshes, 1.62 M tris: saves 3.2 | 420 meshes, 1.63 M tris: saves 3.1 |
| terrain | 267 chunks, 2.57 M tris: saves **3.9** | the same chunks/tris: saves 2.7 |
| rocks | 36 meshes, 5 k tris: saves 1.6 | the same: saves 0.8 |
| flora | saves 1.4 | 1.4 |
| sun shadow redraw | saves 2.8 | 3.2 |
| post chain only | 3.3 | 3.1 |

**Reading:** the scene is nearly the same; **rocks didn't grow** (the same 36 meshes, 5 k tris). What differs: **3 more townsfolk are drawn** near
the village spot (13 vs 10), 18 more town meshes, and the terrain costs about 1 ms more for the same triangles (the gate's
landform or mesa shading in the terrain shader?). The median differs by only about 1 ms (13.9 vs 13.0); the bigger change is the **p95 (34 vs 18)**.
The set's village figure (16.7-17.3) has more noise on top. A shot at 16-17 is about 13-14 ms of scene plus spikes.

## To fix
1. mesa-plateau: (-25757, 33680) is a beach at h 1.8 (mesaRise 62.9 lies there): check the real height.
2. tor: the tor at (-27268, 44323) shows no rocks from 69 m. Check that the tor's rocks are drawn there, or stand nearer.
3. climb: the face at the climb spot leans back; use a steeper wall or a lower camera looking up.
4. title 18.0 and talk 19.2.
