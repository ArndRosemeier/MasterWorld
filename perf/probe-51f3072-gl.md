
## noon: ?title=0&day=0&gl&hour=12&weather=clear

settled in 4.5 s

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
| far folk | 1 | 1 | 1 | 0 | 3234 |
| townsfolk | 30 | 466 | 100 | 466 | 3999074 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 45.9 | 62.1 | 14.4 | 318 | 0 |  |
| without town | 46.5 | 69.8 | 14.7 | 307 | 0 | 0.6 |
| without volumes | 77.6 | 109.0 | 15.2 | 324 | 0 | -14.4 |
| without terrain | 78.5 | 124.2 | 11.5 | 238 | 0 | -0.2 |
| without sky | 77.8 | 93.4 | 14.4 | 326 | 0 | -7.4 |
| without sea | 61.8 | 79.0 | 14.2 | 330 | 0 | 0.2 |
| without grass | 62.0 | 88.6 | 14.5 | 335 | 0 | -23.6 |
| without hero | 38.9 | 77.8 | 15.1 | 342 | 0 | -0.3 |
| without horse | 62.2 | 93.8 | 14.3 | 318 | 0 | -0.0 |
| without flora | 13.0 | 61.9 | 12.9 | 294 | 0 | 25.4 |
| without far folk | 14.3 | 18.0 | 14.7 | 339 | 0 | 0.3 |
| without townsfolk | 8.5 | 12.0 | 9.0 | 197 | 0 | 6.3 |
| without sun shadow redraw | 12.4 | 16.0 | 11.2 | 367 | 0 | 2.3 |
| nothing (empty scene, post chain only) | 3.5 | 4.8 | 3.0 | 25 | 0 | 10.7 |

shaders:
```
shaders: 97 built in warm-up, 9 after, worst block 10 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 5× MeshStandardNodeMaterial
- 2× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
