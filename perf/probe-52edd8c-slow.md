
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 1.5 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 1 | 34 | 34 | 0 | 71910 |
| volumes | 1 | 1 | 1 | 0 | 19845 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 8 | 13 | 81819 |
| horse | 2 | 16 | 14 | 16 | 352236 |
| cow | 2 | 10 | 8 | 10 | 266240 |
| birds | 1 | 1 | 0 | 0 | 82 |
| far folk | 1 | 1 | 1 | 0 | 3080 |
| townsfolk | 29 | 425 | 66 | 425 | 3801052 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 14.2 | 30.7 | 14.4 | 363 | 0 |  |
| without town | 20.6 | 47.4 | 24.5 | 349 | 0 | -6.6 |
| without volumes | 14.7 | 21.2 | 14.6 | 369 | 0 | 0.0 |
| without terrain | 12.8 | 17.2 | 13.1 | 286 | 0 | 1.7 |
| without sky | 13.0 | 17.9 | 12.9 | 376 | 0 | 0.4 |
| without sea | 13.7 | 17.0 | 13.3 | 377 | 0 | 0.2 |
| without grass | 13.6 | 16.9 | 13.1 | 383 | 0 | 0.4 |
| without hero | 14.1 | 18.7 | 13.9 | 386 | 0 | -0.3 |
| without horse | 12.7 | 16.3 | 12.6 | 366 | 0 | 0.9 |
| without cow | 13.4 | 16.9 | 13.4 | 388 | 0 | 0.4 |
| without birds | 13.7 | 17.0 | 13.3 | 394 | 0 | 0.3 |
| without far folk | 12.9 | 16.9 | 13.3 | 392 | 0 | 0.7 |
| without townsfolk | 9.0 | 12.0 | 8.3 | 242 | 0 | 4.9 |
| without flora | 11.9 | 14.9 | 11.6 | 310 | 0 | 2.3 |
| without sun shadow redraw | 11.4 | 13.4 | 9.1 | 400 | 0 | 3.3 |
| nothing (empty scene, post chain only) | 4.4 | 6.2 | 3.3 | 31 | 0 | 10.4 |

townsfolk over 5 s: 2 dressings, freed {"hidden":1,"ranked":1,"far":0}; updateHiddenSkin 12× 42 ms: 4× other -> level 2, 2× applyShape -> level 2, 2× other -> level 0, 2× other -> level 1, 2× auto level -> level 2

slow frames over 15 s: 47 of 963 over 30 ms (p50 15.2, p95 30.3); in them / in the rest: sun shadow redrawn 7 / 475, with a build 0 / 2

| mean ms in | slow frames | the rest |
|---|---|---|
| actors update | 1.7 | 1.5 |
| town life | 0.0 | 0.0 |
| folk follow | 1.7 | 1.5 |
| render | 13.7 | 15.3 |
| actors skin | 0.0 | 0.0 |
| actors shape write | 0.0 | 0.0 |
| actors crowd merge | 0.0 | 0.0 |
| stage prepare (sync part) | 0.0 | 0.0 |

slowest frames:
```
81.1 ms (sun shadow): actors update 1.7, folk follow 1.7, render 24.3
46.9 ms (sun shadow): actors update 2.0, folk follow 2.1, render 26.2
45.1 ms (sun shadow): actors update 1.4, folk follow 1.5, render 23.6
42.9 ms (sun shadow): actors update 2.1, folk follow 1.9, render 27.8
41.4 ms: actors update 1.0, folk follow 1.0, render 7.9
41.3 ms (sun shadow): actors update 1.8, folk follow 1.9, render 31.5
40.5 ms: actors update 2.1, folk follow 2.2, render 17.5
40.4 ms (sun shadow): actors update 2.7, folk follow 2.8, render 30.3
38.8 ms: actors update 1.5, folk follow 1.4, render 10.9
38.7 ms: actors update 2.2, folk follow 2.1, render 14.2
38.3 ms: actors update 1.4, folk follow 1.3, render 11.4
37.8 ms: actors update 1.5, folk follow 1.4, render 12.6
```

shaders:
```
shaders: 89 built in warm-up, 1 after (0 drawn late), worst block 11 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

## 18.3 h, fair

settled in 1.5 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 1 | 34 | 34 | 0 | 71910 |
| volumes | 1 | 1 | 1 | 0 | 19845 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 8 | 13 | 81819 |
| horse | 2 | 16 | 14 | 16 | 352236 |
| cow | 2 | 10 | 8 | 10 | 266240 |
| birds | 1 | 1 | 0 | 0 | 82 |
| far folk | 1 | 1 | 1 | 0 | 3080 |
| townsfolk | 30 | 501 | 78 | 501 | 4090127 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 15.3 | 33.3 | 14.6 | 398 | 0 |  |
| without town | 13.7 | 19.5 | 13.9 | 376 | 0 | 1.4 |
| without volumes | 14.6 | 21.4 | 14.9 | 381 | 0 | 0.1 |
| without terrain | 12.1 | 15.6 | 11.8 | 299 | 0 | 2.8 |
| without sky | 13.8 | 19.1 | 14.2 | 377 | 0 | 0.8 |
| without sea | 13.4 | 18.9 | 13.2 | 367 | 0 | 0.4 |
| without grass | 15.9 | 46.8 | 18.7 | 356 | 0 | -0.8 |
| without hero | 15.5 | 25.4 | 15.1 | 371 | 0 | 0.7 |
| without horse | 15.3 | 30.9 | 15.9 | 351 | 0 | -0.1 |
| without cow | 13.0 | 19.5 | 13.5 | 361 | 0 | 0.5 |
| without birds | 12.0 | 16.3 | 12.5 | 348 | 0 | 0.3 |
| without far folk | 11.9 | 15.3 | 11.9 | 337 | 0 | 0.1 |
| without townsfolk | 7.9 | 12.1 | 8.3 | 240 | 0 | 4.0 |
| without flora | 9.9 | 12.9 | 10.0 | 248 | 0 | 2.9 |
| without sun shadow redraw | 11.6 | 15.5 | 9.9 | 326 | 0 | 2.2 |
| nothing (empty scene, post chain only) | 4.8 | 11.0 | 4.9 | 30 | 0 | 12.1 |

townsfolk over 5 s: 1 dressings, freed {"hidden":0,"ranked":0,"far":0}; updateHiddenSkin 7× 28 ms: 2× other -> level 2, 1× applyShape -> level 2, 1× other -> level 0, 1× other -> level 1, 1× auto level -> level 2, 1× auto level -> level 1

slow frames over 15 s: 49 of 1028 over 28 ms (p50 14.1, p95 27.4); in them / in the rest: sun shadow redrawn 6 / 508, with a build 0 / 0

| mean ms in | slow frames | the rest |
|---|---|---|
| actors update | 1.4 | 1.1 |
| town life | 0.0 | 0.0 |
| folk follow | 1.4 | 1.1 |
| render | 13.4 | 15.1 |
| actors skin | 0.0 | 0.0 |
| actors shape write | 0.0 | 0.0 |
| actors crowd merge | 0.0 | 0.0 |
| stage prepare (sync part) | 0.0 | 0.0 |

slowest frames:
```
46.4 ms: actors update 1.6, folk follow 1.5, render 13.2
45.4 ms (sun shadow): actors update 1.2, folk follow 1.1, render 21.1
44.6 ms (sun shadow): actors update 1.9, folk follow 1.8, render 30.6
43.7 ms: actors update 1.6, folk follow 1.7, render 13.2
43.2 ms: actors update 1.3, folk follow 1.5, render 11.5
40.4 ms: actors update 1.2, folk follow 1.1, render 13.7
40.1 ms (sun shadow): actors update 2.1, folk follow 2.2, render 30.4
39.3 ms: actors update 1.7, folk follow 1.7, render 13.7
39.3 ms: actors update 1.3, folk follow 1.5, render 13.2
39.3 ms: actors update 1.6, folk follow 1.6, render 12.5
38.5 ms: actors update 1.3, folk follow 1.4, render 11.6
38.0 ms (sun shadow): actors update 1.6, folk follow 1.5, render 25.4
```

shaders:
```
shaders: 89 built in warm-up, 1 after (0 drawn late), worst block 11 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

## 23 h, clear

settled in 1.5 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 1 | 34 | 34 | 0 | 71910 |
| volumes | 1 | 1 | 1 | 0 | 19845 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 8 | 13 | 81819 |
| horse | 2 | 16 | 14 | 16 | 352236 |
| cow | 2 | 10 | 8 | 10 | 266240 |
| far folk | 1 | 1 | 1 | 0 | 2156 |
| townsfolk | 22 | 386 | 80 | 386 | 2918697 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 12.7 | 18.3 | 13.7 | 337 | 0 |  |
| without town | 13.4 | 18.1 | 14.2 | 326 | 0 | -0.5 |
| without volumes | 11.6 | 15.1 | 12.3 | 339 | 0 | 0.7 |
| without terrain | 9.7 | 14.2 | 10.0 | 248 | 0 | 1.8 |
| without sky | 10.4 | 13.7 | 11.2 | 316 | 0 | 0.6 |
| without sea | 11.1 | 15.1 | 11.7 | 315 | 0 | 0.6 |
| without grass | 12.4 | 18.0 | 14.2 | 318 | 0 | 0.8 |
| without hero | 12.9 | 18.5 | 14.1 | 320 | 0 | 0.8 |
| without horse | 11.3 | 18.2 | 13.2 | 295 | 0 | 5.7 |
| without cow | 12.4 | 29.6 | 14.6 | 311 | 0 | 3.1 |
| without far folk | 13.1 | 26.5 | 15.4 | 298 | 0 | -0.9 |
| without townsfolk | 10.4 | 16.5 | 11.9 | 248 | 0 | 2.2 |
| without flora | 9.6 | 13.8 | 10.7 | 213 | 0 | 1.7 |
| without sun shadow redraw | 10.2 | 13.8 | 9.3 | 274 | 0 | 0.3 |
| nothing (empty scene, post chain only) | 3.0 | 4.7 | 3.2 | 29 | 0 | 6.8 |

townsfolk over 5 s: 0 dressings, freed {"hidden":1,"ranked":0,"far":0}; updateHiddenSkin 1× 3 ms: 1× auto level -> level 1

slow frames over 15 s: 124 of 1419 over 25 ms (p50 8.9, p95 29.1); in them / in the rest: sun shadow redrawn 2 / 707, with a build 0 / 0

| mean ms in | slow frames | the rest |
|---|---|---|
| actors update | 0.8 | 0.4 |
| town life | 0.0 | 0.0 |
| folk follow | 0.7 | 0.4 |
| render | 12.5 | 11.9 |
| actors skin | 0.0 | 0.0 |
| actors shape write | 0.0 | 0.0 |
| actors crowd merge | 0.0 | 0.0 |
| stage prepare (sync part) | 0.0 | 0.0 |

slowest frames:
```
71.5 ms (sun shadow): actors update 0.9, folk follow 0.6, render 33.3
56.2 ms: actors update 0.6, render 7.1
34.3 ms: actors update 0.8, folk follow 0.6, render 11.0
33.5 ms: actors update 0.8, folk follow 0.6, render 14.0
33.2 ms: actors update 0.8, folk follow 0.8, render 12.8
32.7 ms: actors update 0.8, folk follow 0.8, render 12.0
32.5 ms: actors update 0.9, folk follow 0.7, render 12.3
32.4 ms: actors update 0.8, folk follow 0.7, render 12.2
32.4 ms: actors update 0.8, folk follow 0.6, render 12.3
32.3 ms: actors update 1.3, folk follow 0.9, render 14.6
32.2 ms: actors update 0.8, folk follow 0.9, render 9.4
32.0 ms: actors update 0.7, folk follow 0.6, render 11.8
```

shaders:
```
shaders: 89 built in warm-up, 1 after (0 drawn late), worst block 11 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
