
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 3.9 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 1 | 34 | 34 | 0 | 71910 |
| volumes | 1 | 1 | 1 | 0 | 19845 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 8 | 13 | 81843 |
| horse | 4 | 22 | 18 | 22 | 610476 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| far folk | 1 | 1 | 1 | 0 | 3542 |
| townsfolk | 29 | 450 | 109 | 450 | 3875563 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 45.9 | 62.7 | 12.7 | 357 | 0 |  |
| without town | 45.6 | 62.4 | 12.2 | 346 | 0 | 8.7 |
| without volumes | 92.1 | 109.1 | 13.2 | 364 | 0 | -21.2 |
| without terrain | 78.7 | 109.6 | 10.6 | 276 | 0 | 0.4 |
| without sky | 77.2 | 94.9 | 13.4 | 367 | 0 | -6.5 |
| without sea | 46.3 | 77.8 | 12.9 | 371 | 0 | 0.7 |
| without grass | 31.8 | 52.1 | 13.8 | 377 | 0 | -8.9 |
| without hero | 61.0 | 93.7 | 14.2 | 380 | 0 | -22.7 |
| without horse | 62.1 | 90.8 | 12.9 | 358 | 0 | 0.2 |
| without flora | 11.9 | 16.3 | 11.4 | 293 | 0 | 25.7 |
| without far folk | 13.1 | 16.1 | 13.0 | 378 | 0 | 0.1 |
| without townsfolk | 8.0 | 10.6 | 8.1 | 235 | 0 | 5.3 |
| without sun shadow redraw | 10.3 | 12.0 | 8.7 | 398 | 0 | 3.1 |
| nothing (empty scene, post chain only) | 3.9 | 5.2 | 3.2 | 25 | 0 | 9.5 |

shaders:
```
shaders: 98 built in warm-up, 6 after, worst block 9 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 2× MeshPhysicalNodeMaterial
- 2× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
