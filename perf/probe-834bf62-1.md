
## noon: ?title=0&day=0&gl&hour=12&weather=clear

settled in 5.7 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| volumes | 1 | 1 | 1 | 0 | 19845 |
| town | 1 | 34 | 34 | 0 | 71910 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 14 | 13 | 81843 |
| horse | 4 | 22 | 18 | 22 | 610476 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| far folk | 1 | 1 | 1 | 0 | 3080 |
| townsfolk | 30 | 461 | 371 | 461 | 4030735 |

| drawn | p50 ms | p95 ms | render ms (main thread) | scene draw calls | shaders built | saves ms |
|---|---|---|---|---|---|---|
| everything | 31.0 | 50.1 | 34.3 | 442 | 0 |  |
| without volumes | 28.5 | 46.5 | 31.7 | 449 | 0 | 2.5 |
| without town | 31.8 | 125.9 | 59.2 | 432 | 0 | -0.8 |
| without terrain | 40.1 | 78.3 | 56.9 | 377 | 0 | -9.1 |
| without sky | 43.1 | 66.4 | 54.4 | 468 | 0 | -12.1 |
| without sea | 31.3 | 47.8 | 40.0 | 469 | 0 | -0.3 |
| without grass | 30.9 | 48.2 | 33.9 | 468 | 0 | 0.1 |
| without hero | 30.9 | 46.2 | 33.2 | 467 | 0 | 0.1 |
| without horse | 29.1 | 45.8 | 33.4 | 443 | 0 | 1.9 |
| without flora | 21.8 | 44.5 | 27.3 | 414 | 0 | 9.2 |
| without far folk | 29.8 | 46.1 | 36.8 | 470 | 0 | 1.2 |
| without townsfolk | 15.3 | 29.0 | 17.8 | 209 | 0 | 15.7 |
| without sun shadow redraw | 20.9 | 43.3 | 19.2 | 381 | 0 | 10.1 |
| nothing (empty scene, post chain only) | 5.2 | 10.2 | 5.4 | 31 | 0 | 25.8 |

shaders:
```
shaders: 103 built in warm-up, 22 after, worst block 17 ms, 1 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)
```

built after warm-up, by what:
- 12× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 6× MeshStandardNodeMaterial
- 2× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

## 23 h, clear

settled in 1.6 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| volumes | 1 | 1 | 1 | 0 | 19845 |
| town | 1 | 34 | 34 | 0 | 71910 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 14 | 13 | 81843 |
| horse | 4 | 22 | 18 | 22 | 610476 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| far folk | 1 | 1 | 1 | 0 | 4004 |
| townsfolk | 30 | 478 | 388 | 478 | 4069144 |

| drawn | p50 ms | p95 ms | render ms (main thread) | scene draw calls | shaders built | saves ms |
|---|---|---|---|---|---|---|
| everything | 31.2 | 84.1 | 34.6 | 489 | 0 |  |
| without volumes | 26.2 | 45.4 | 32.0 | 471 | 0 | 5.0 |
| without town | 31.4 | 57.1 | 43.9 | 452 | 0 | -0.2 |
| without terrain | 18.6 | 45.5 | 27.8 | 375 | 0 | 12.6 |
| without sky | 20.5 | 44.8 | 27.8 | 451 | 0 | 10.7 |
| without sea | 28.8 | 45.9 | 32.5 | 432 | 0 | 2.4 |
| without grass | 27.5 | 46.9 | 33.1 | 420 | 0 | 3.7 |
| without hero | 20.4 | 42.9 | 28.4 | 425 | 0 | 10.8 |
| without horse | 30.5 | 44.3 | 30.1 | 395 | 0 | 0.7 |
| without flora | 19.3 | 40.4 | 23.8 | 339 | 0 | 11.9 |
| without far folk | 26.1 | 44.5 | 32.0 | 361 | 0 | 5.1 |
| without townsfolk | 31.5 | 59.9 | 35.8 | 225 | 0 | -0.3 |
| without sun shadow redraw | 30.6 | 45.8 | 22.2 | 271 | 0 | 0.6 |
| nothing (empty scene, post chain only) | 8.9 | 12.2 | 9.5 | 31 | 0 | 22.3 |

shaders:
```
shaders: 103 built in warm-up, 22 after, worst block 17 ms, 1 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)
```

built after warm-up, by what:
- 12× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 6× MeshStandardNodeMaterial
- 2× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

## 14 h, rain

settled in 1.7 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| volumes | 1 | 1 | 1 | 0 | 19845 |
| town | 1 | 34 | 34 | 0 | 71910 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 14 | 13 | 81843 |
| horse | 4 | 22 | 18 | 22 | 610476 |
| rain | 1 | 1 | 0 | 0 | 2 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| far folk | 1 | 1 | 1 | 0 | 10010 |
| townsfolk | 30 | 566 | 476 | 566 | 4176097 |

| drawn | p50 ms | p95 ms | render ms (main thread) | scene draw calls | shaders built | saves ms |
|---|---|---|---|---|---|---|
| everything | 30.8 | 47.0 | 30.6 | 457 | 0 |  |
| without volumes | 22.3 | 43.8 | 28.3 | 469 | 0 | 8.5 |
| without town | 25.4 | 48.1 | 31.7 | 449 | 0 | 5.4 |
| without terrain | 22.8 | 46.6 | 29.2 | 391 | 0 | 8.0 |
| without sky | 47.4 | 95.5 | 52.7 | 469 | 0 | -16.6 |
| without sea | 22.3 | 44.1 | 28.9 | 470 | 0 | 8.5 |
| without grass | 22.0 | 43.8 | 27.8 | 475 | 0 | 8.8 |
| without hero | 21.6 | 43.2 | 27.7 | 485 | 0 | 9.2 |
| without horse | 23.4 | 45.9 | 28.5 | 466 | 0 | 7.4 |
| without rain | 23.7 | 44.3 | 28.7 | 511 | 0 | 7.1 |
| without flora | 21.3 | 44.3 | 27.0 | 471 | 0 | 9.5 |
| without far folk | 23.0 | 46.5 | 28.9 | 521 | 0 | 7.8 |
| without townsfolk | 11.9 | 17.0 | 14.2 | 216 | 0 | 18.9 |
| without sun shadow redraw | 16.3 | 19.3 | 14.0 | 424 | 0 | 14.5 |
| nothing (empty scene, post chain only) | 4.3 | 5.3 | 4.3 | 37 | 0 | 26.5 |

shaders:
```
shaders: 103 built in warm-up, 24 after, worst block 17 ms, 2 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)
run: "MeshBasicNodeMaterial" started 0 ms after a build of 5 ms ended (minimum 10 ms)
```

built after warm-up, by what:
- 12× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 6× MeshStandardNodeMaterial
- 2× MeshPhysicalNodeMaterial
- 2× MeshBasicNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
