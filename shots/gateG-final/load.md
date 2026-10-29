# Gate G: cold load times (F4)

Build 2de5539 (origin/main), RTX 5070, WebGPU (`SHOT_GPU=1 node tools/shot/load.mjs`, the game's default backend), 1280×720, muted.
Three cold runs; the script closes the browser after each. The bar is under 18 s to playable.

| Run | Title | Playable | Start download | Result |
|---|---|---|---|---|
| 1 | 0.43 s | 21.1 s | 90.0 MB | over 18 s (and the script's 20 s limit: exit 1) |
| 2 | 0.47 s | 21.3 s | 90.0 MB | over 18 s (exit 1) |
| 3 | 0.46 s | 21.3 s | 90.0 MB | over 18 s (exit 1) |

Not met: about 3.8 s slower than gate L (17.3 s, build b9afd8c). Where the time went, by the game's own load steps (run 1 against gate L run 1):

| Step | Gate L | Gate G |
|---|---|---|
| ground textures made | 3.6 s | 4.0 s |
| Saddling the horses | 4.8 s | 6.7 s (+1.5 s after the ground textures) |
| Preparing shaders | 9.6 s | 12.2 s |
| compiled the kinds / Raising the land | 14.0 s | 15.7 s |
| Waking the cellar | 14.0 s | 18.2 s ("Raising the land" now takes 2.5 s, before 0 s) |
| playable | 17.3 s | 21.1 s |

The full log is in load-log.txt.
