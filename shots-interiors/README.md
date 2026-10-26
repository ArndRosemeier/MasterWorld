# Interior shots · 6d959f7 · WebGPU (SHOT_GPU=1, RTX 5070, 1280×800, SHOT_WAIT=4000)

| Shot | Query | HUD frame ms | Shaders (warm-up + later, worst) | Violations | In |
|---|---|---|---|---|---|
| inn-noon | room=inn&hour=11 | 23.9 | 86 + 0, 12 ms | 0 | inn #20 storey 0 |
| inn-evening | room=inn&hour=20 | 17.0 | 87 + 0, 13 ms | 0 | inn #20 storey 0 |
| smithy | room=smithy&hour=11 | 21.2 | 86 + 0, 14 ms | 0 | smithy #3 storey 0 |
| cellar-house | room=cellar&hour=11 | 19.5 | 86 + 0, 8 ms | 0 | smithy #3 storey 0 (the cellar house is the smithy) |
| workshop-8 | room=8&hour=11 | 28.0 | 87 + 0, 15 ms | 0 | workshop #8 storey 0 |
| house | room=house&hour=11 | 16.8 | 86 + 0, 12 ms | 0 | house #1 storey 0 |
| workshop-5 | room=5&hour=11 | 17.3 | 87 + 0, 12 ms | 0 | workshop #5 storey 0 |

room=3 is the smithy (same as the smithy shot), so it was dropped. HUD frame ms is one reading with the HUD on, not the set's p50.
The standard set (SET_GL=0) is in set/ with its own index.md.
