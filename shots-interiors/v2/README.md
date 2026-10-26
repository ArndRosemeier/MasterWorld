# Interior shots v2 · 5333b29 (AG cbec46d) · WebGPU (SHOT_GPU=1, RTX 5070)

Room shots, 1280×800, SHOT_WAIT=4000, &hud. Frame ms is one HUD reading, not a p50.

| Shot | Query | HUD frame ms | Shaders (warm-up + later, worst) | Violations | In |
|---|---|---|---|---|---|
| inn-noon | room=inn&hour=11 | 16.9 | 86 + 0, 10 ms | 0 | inn #20 storey 0 |
| inn-evening | room=inn&hour=20 | 18.8 | 87 + 0, 7 ms | 0 | inn #20 storey 0 |
| house | room=house&hour=11 | 17.0 | 86 + 1, 10 ms | 0 | house #1 storey 0 |
| cellar-house | room=cellar&hour=11 | 16.7 | 86 + 0, 11 ms | 0 | smithy #3 storey 0 |

Set, SET_GL=0 SET_ONLY=inn,talk (1080p, no frame cap), in set/:

| Shot | p50 ms | p95 ms | Shaders | Violations |
|---|---|---|---|---|
| inn | 15.2 | 40.4 | 87 + 0, 10 ms | 0 |
| talk | 10.6 | 13.9 | 86 + 0, 11 ms | 0 |

Later re-runs measured slower across the whole machine: inn p50 was 68 and 54 ms, and town-noon was 31 ms against 12.6 ms earlier. Shader violations appeared in town, and one run died partway. Something else was loading the PC then, so those numbers are not used.
