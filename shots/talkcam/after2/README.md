# Talk camera, round 2: 6abfe84 (rebased on main 844e55c, v0.145)
RTX 5070, SHOT_GPU=1, WebGPU (SET_GL=0), 1920×1080. The commit adds that the camera rises up to 0.8 m, stopping
under a ceiling, until the top of the hero's head is out of the frame.

## Camera values (read 8 s after ready)
| talk | talkShot | camera y − hero feet y |
|---|---|---|
| inn (`?title=0&day=0&hour=20&talk=inn&topics=news`) | { back: 1.3, side: 0.45, hits: 0 } | 2.00 m |
| town (`?title=0&day=0&hour=11&talk=house&topics=news`) | { back: 1.3, side: 0.45, hits: 0 } | 2.20 m |

On the old base (ff970ff), the inn picked { back 0.8, side 0.45 }. On the rebased branch it gets the first choice, 1.3 / 0.45, with nothing in the way.

## What the pictures show
- Inn (`2026-10-26-6abfe84/01-talk.jpg`): only a sliver of the hero's head is left, the tip of the yellow hood at
  the bottom edge (about x 740–810, the lowest ~40 px). Bell Goodbarrel is well framed in the centre, behind the counter, with nothing cutting her.
  The view now looks down a little: the dark counter fills the lower half of the frame. The ceiling beams only touch the top edge.
  No wall tops or sky show where they shouldn't (the sky seen through the windows is correct). Another guest's patterned
  shoulder fills the left edge.
- Town (`talk-house.jpg`, Grundi Coalbeard, it rained without a weather parameter): the hero's green hood is still
  clearly in the bottom middle (about x 760–880, from y ~940 to the edge). It is smaller than the inn's old head, but not a sliver.
  The person being talked to is not well framed. The figure in the middle distance on the road is small, roughly 10 m+ away, and one villager walks out at the left.
  A house wall and its eave take up the left third. No wrong sky or wall top shows.

## Inn and talk re-measured on 6abfe84 (`SET_ONLY=inn,talk`, three runs, p50 / p95 ms)
| run | inn | talk |
|---|---|---|
| 1 | 10.7 / 14.7 | 11.5 / 16.1 |
| 2 | 11.9 / 27.1 | 11.1 / 15.6 |
| 3 | 12.0 / 15.6 | 11.3 / 15.6 |
0 shader violations in all runs. The single talk shot in the first after2 run was 9.2 / 12.4.

## PC load
- I waited for another thread's `tools/shot/walk.mjs` to finish (it kept the GPU at ~30 %). Then GPU 1 %.
- During the runs: CPU 14–73 % with one sample at 100 %, which is lower than round 1 (55–96 %). GPU 20–69 %.
- Between my shots the GPU stayed at a steady ~25–29 % from something outside the shot tools. No shot, walk or load job was running. I could not tell which app it was;
  open at the time: Chrome, Discord, Teams, Steam, LM Studio, Codex, the Claude app.
- Still running, not mine and not stopped: two `npm run packs` (tools/packs/actors.mjs), a `scripts/shots/shots.mjs --watch`
  watcher, and a vite preview in C:\Projekte\mw-shots-gpu.
- The runs are a little slower than round 1's runs 1–2 (~1–2 ms on p50), most likely because of that background GPU load.
  The inn p95 spike in run 2 (27 ms) stands alone.
