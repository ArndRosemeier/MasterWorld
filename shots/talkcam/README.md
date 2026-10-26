# Talk camera check (RTX 5070, SHOT_GPU=1, WebGPU via SET_GL=0, 1920×1080)

- BEFORE: origin/main 844e55c (v0.143), `before/…/01-talk.jpg`
- AFTER: origin/claude/project-thread-fuworp ff970ff (v0.141), `after/…/01-talk.jpg`.
  Note: ff970ff sits on an older main than 844e55c, so the two builds also differ in other commits.

## heroCam.talkShot
Read on `?title=0&day=0&hour=20&talk=inn&topics=news`, 3 s after ready:
- main 844e55c: no `talkShot` field.
- ff970ff: `{ back: 0.8, side: 0.45, hits: 0 }`. That is the 7th of the 8 candidates: every wider shot
  ([1.3, ±0.45], [1.6, ±0.7], [1.0, ±0.8]) had something in the way.

## What the pictures show
- The hero's head is still in the bottom middle of the AFTER talk shot. It has moved slightly left
  (about x 640–800 compared with 720–870 before) and is still cut by the bottom edge and partly hidden behind the toast.
  The change made it smaller, but it does not get the head out of the frame.
- The innkeeper (Bell Goodbarrel) is clearly framed in both pictures. She stands behind the counter, centre left,
  and no wall, post or other person blocks her. A bare arm still reaches in from the left edge in both pictures.

## Frame times: talk shot alone
| | p50 ms | p95 ms |
|---|---|---|
| before (844e55c) | 9.6 | 13.1 |
| after (ff970ff) | 9.7 | 12.5 |

## Inn and talk re-measured on ff970ff (`SET_ONLY=inn,talk`, three runs)
| run | inn p50 | inn p95 | talk p50 | talk p95 |
|---|---|---|---|---|
| 1 | 9.8 | 13.2 | 10.9 | 14.3 |
| 2 | 10.1 | 13.7 | 10.5 | 16.6 |
| 3 | 15.2 | 34.3 | 11.1 | 17.4 |

There were 0 shader violations in every run.

## PC load during the re-measure (the PC was NOT quiet)
- Before the runs: CPU 5–11 %, GPU 5 %.
- During the runs: CPU 55–96 % (sampled every 3 s), GPU 0–65 %. Afterwards CPU stayed at 50–73 % without my runs.
- Other jobs running at the same time, none of them started by me: a SwiftShader `npm run shot` from another thread
  (`?title=0&hour=11…&site=camp shots/b3-camp.png`), two `npm run packs` (tools/packs/actors.mjs) jobs, a
  `scripts/shots/shots.mjs --watch` watcher and a vite preview in C:\Projekte\mw-shots-gpu. Also open: Chrome, Discord,
  Teams, Steam, LM Studio, ChatGPT/Codex and the Claude app.
- Runs 1–2 are close to the earlier single talk shots. The inn spike in run 3 (p95 34 ms) is most likely load from
  those other jobs and not a regression. A quiet re-measure is needed to be sure.
