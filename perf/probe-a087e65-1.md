
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 2.3 s

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
| far folk | 1 | 1 | 1 | 0 | 3234 |
| townsfolk | 29 | 425 | 74 | 425 | 3808045 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 11.8 | 16.5 | 12.1 | 360 | 0 |  |
| without town | 11.1 | 14.6 | 11.5 | 346 | 0 | 0.9 |
| without volumes | 11.4 | 14.8 | 11.9 | 365 | 0 | 0.6 |
| without terrain | 9.5 | 12.5 | 9.8 | 283 | 0 | 2.6 |
| without sky | 12.2 | 16.9 | 12.8 | 373 | 0 | 0.1 |
| without sea | 12.9 | 16.0 | 12.7 | 374 | 0 | -0.5 |
| without grass | 12.5 | 15.7 | 12.4 | 379 | 0 | 0.1 |
| without hero | 12.4 | 16.1 | 12.7 | 384 | 0 | 0.3 |
| without horse | 12.0 | 15.2 | 12.1 | 364 | 0 | 0.5 |
| without cow | 12.7 | 15.8 | 12.8 | 385 | 0 | 0.0 |
| without far folk | 12.8 | 26.1 | 13.4 | 390 | 0 | -0.2 |
| without townsfolk | 7.6 | 10.7 | 7.5 | 241 | 0 | 5.0 |
| without flora | 11.4 | 14.1 | 11.2 | 305 | 0 | 1.6 |
| without sun shadow redraw | 10.2 | 11.8 | 8.5 | 396 | 0 | 2.8 |
| nothing (empty scene, post chain only) | 3.5 | 5.3 | 2.8 | 29 | 0 | 9.5 |

townsfolk over 5 s: 3 dressings, freed {"hidden":0,"ranked":3,"far":0}; updateHiddenSkin 17× 47 ms: 8× other -> level 2, 3× applyShape -> level 2, 3× other -> level 0, 3× other -> level 1

CPU profile, 3 s (3277 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2061 | 62.9 |
| (native) | 845 | 25.8 |
| main.js | 245 | 7.5 |
| creatorUi.js | 115 | 3.5 |
| src.js | 9 | 0.3 |
| packFetch.js | 1 | 0.0 |
| math.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 466 | 14.2 |
| multiplyMatrices three.js:1:47098 | 334 | 10.2 |
| updateMatrixWorld three.js:1:61326 | 210 | 6.4 |
| writeBuffer (native):0:0 | 138 | 4.2 |
| updateForRender three.js:3851:15750 | 120 | 3.7 |
| setVertexBuffer (native):0:0 | 108 | 3.3 |
| _update three.js:3845:95054 | 102 | 3.1 |
| get three.js:3845:80156 | 99 | 3.0 |
| update three.js:3851:77218 | 98 | 3.0 |
| t._update main.js:2:2365 | 83 | 2.5 |
| _renderObjectDirect three.js:3851:73474 | 73 | 2.2 |
| _projectObject three.js:3851:67866 | 68 | 2.1 |
| _draw three.js:4360:26376 | 52 | 1.6 |
| a._renderObjectDirect main.js:2:1539 | 48 | 1.5 |
| update three.js:3839:26984 | 47 | 1.4 |
| getMaterialCacheKey three.js:3845:78067 | 44 | 1.4 |
| updateAttribute three.js:3845:84078 | 44 | 1.3 |
| updateNumber three.js:3851:77777 | 41 | 1.3 |
| updateAttributes three.js:3845:83749 | 41 | 1.3 |
| get value three.js:3839:3913 | 41 | 1.2 |
| draw three.js:4360:28070 | 40 | 1.2 |
| _getNodeChildren three.js:3845:10532 | 38 | 1.2 |
| updateHiddenSkin creatorUi.js:487:23701 | 35 | 1.1 |
| needsRenderUpdate three.js:4360:29845 | 35 | 1.1 |
| apply three.js:5:55377 | 34 | 1.0 |
| Ic three.js:3825:19 | 29 | 0.9 |
| getForRender three.js:3845:90247 | 29 | 0.9 |
| setBindGroup (native):0:0 | 26 | 0.8 |
| (anonymous) three.js:3825:28488 | 26 | 0.8 |
| fetch main.js:3:134107 | 24 | 0.7 |
| updateBinding three.js:4359:5655 | 23 | 0.7 |
| update three.js:3839:9452 | 23 | 0.7 |
| intersectsObject three.js:1:154426 | 22 | 0.7 |
| slerpFlat three.js:1:10116 | 21 | 0.6 |
| (garbage collector) (native):0:0 | 20 | 0.6 |
| updateMatrixWorld three.js:1:146835 | 20 | 0.6 |
| submit (native):0:0 | 19 | 0.6 |
| update main.js:3:109527 | 18 | 0.6 |
| update three.js:5:74616 | 18 | 0.5 |
| renderObject three.js:3851:71607 | 17 | 0.5 |
| invert three.js:1:48739 | 16 | 0.5 |
| (anonymous) three.js:3839:45373 | 13 | 0.4 |
| getDynamicCacheKey three.js:3845:79276 | 13 | 0.4 |
| setIndexBuffer (native):0:0 | 12 | 0.4 |
| sort three.js:3845:98303 | 12 | 0.4 |

shaders:
```
shaders: 86 built in warm-up, 3 after (0 drawn late), worst block 8 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]

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
| far folk | 1 | 1 | 1 | 0 | 4158 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 30 | 499 | 97 | 499 | 4039310 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 13.0 | 27.9 | 13.0 | 386 | 0 |  |
| without town | 12.7 | 29.4 | 12.7 | 356 | 0 | 0.2 |
| without volumes | 12.8 | 15.9 | 12.6 | 373 | 0 | -0.1 |
| without terrain | 10.5 | 13.6 | 10.3 | 285 | 0 | 2.2 |
| without sky | 12.0 | 15.3 | 12.2 | 359 | 0 | -0.1 |
| without sea | 10.9 | 14.6 | 11.4 | 342 | 0 | -0.1 |
| without grass | 10.4 | 13.9 | 11.1 | 330 | 0 | 0.4 |
| without hero | 10.5 | 13.6 | 11.2 | 332 | 0 | 0.3 |
| without horse | 9.8 | 13.0 | 10.4 | 309 | 0 | 0.7 |
| without cow | 9.7 | 13.2 | 10.6 | 312 | 0 | 0.4 |
| without far folk | 9.6 | 13.0 | 10.7 | 309 | 0 | -0.0 |
| without flora | 7.9 | 11.1 | 8.7 | 219 | 0 | 1.6 |
| without townsfolk | 7.2 | 10.2 | 7.7 | 248 | 0 | 2.1 |
| without sun shadow redraw | 7.3 | 10.7 | 6.7 | 270 | 0 | 2.0 |
| nothing (empty scene, post chain only) | 3.2 | 5.3 | 3.3 | 29 | 0 | 5.9 |

townsfolk over 5 s: 0 dressings, freed {"hidden":1,"ranked":0,"far":1}; updateHiddenSkin 3× 11 ms: 2× auto level -> level 2, 1× auto level -> level 1

CPU profile, 3 s (3276 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2097 | 64.0 |
| (native) | 894 | 27.3 |
| main.js | 224 | 6.8 |
| creatorUi.js | 52 | 1.6 |
| src.js | 7 | 0.2 |
| math.js | 1 | 0.0 |
| art.js | 0 | 0.0 |
| packFetch.js | 0 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 500 | 15.3 |
| multiplyMatrices three.js:1:47098 | 286 | 8.7 |
| updateMatrixWorld three.js:1:61326 | 227 | 6.9 |
| updateForRender three.js:3851:15750 | 162 | 5.0 |
| writeBuffer (native):0:0 | 139 | 4.3 |
| _update three.js:3845:95054 | 119 | 3.6 |
| update three.js:3851:77218 | 111 | 3.4 |
| getMaterialCacheKey three.js:3845:78067 | 83 | 2.5 |
| t._update main.js:2:2365 | 79 | 2.4 |
| _renderObjectDirect three.js:3851:73474 | 75 | 2.3 |
| setVertexBuffer (native):0:0 | 75 | 2.3 |
| _getNodeChildren three.js:3845:10532 | 65 | 2.0 |
| update three.js:3839:26984 | 51 | 1.5 |
| update three.js:3839:9452 | 48 | 1.5 |
| get needsGeometryUpdate three.js:3845:78884 | 43 | 1.3 |
| get value three.js:3839:3913 | 43 | 1.3 |
| _projectObject three.js:3851:67866 | 42 | 1.3 |
| draw three.js:4360:28070 | 39 | 1.2 |
| Ic three.js:3825:19 | 38 | 1.2 |
| updateAttributes three.js:3845:83749 | 36 | 1.1 |
| updateNumber three.js:3851:77777 | 35 | 1.1 |
| getForRender three.js:3845:90247 | 34 | 1.0 |
| submit (native):0:0 | 33 | 1.0 |
| a._renderObjectDirect main.js:2:1539 | 33 | 1.0 |
| updateAttribute three.js:3845:84078 | 31 | 0.9 |
| getGeometryCacheKey three.js:3845:77641 | 30 | 0.9 |
| setBindGroup (native):0:0 | 30 | 0.9 |
| _getWeakMap three.js:3845:73263 | 28 | 0.9 |
| needsRenderUpdate three.js:4360:29845 | 27 | 0.8 |
| renderObject three.js:3851:71607 | 27 | 0.8 |
| fetch main.js:3:134107 | 26 | 0.8 |
| tend main.js:3:139075 | 25 | 0.8 |
| (garbage collector) (native):0:0 | 24 | 0.7 |
| get three.js:4027:3560 | 21 | 0.7 |
| intersectsObject three.js:1:154426 | 19 | 0.6 |
| (idle) (native):0:0 | 19 | 0.6 |
| getCacheKey three.js:3845:79578 | 19 | 0.6 |
| invert three.js:1:48739 | 17 | 0.5 |
| updateHiddenSkin creatorUi.js:487:23701 | 17 | 0.5 |
| updateMatrixWorld three.js:1:146835 | 16 | 0.5 |
| getDynamicCacheKey three.js:3845:79276 | 16 | 0.5 |
| _draw three.js:4360:26376 | 15 | 0.5 |
| (anonymous) three.js:3825:28488 | 14 | 0.4 |
| update main.js:3:109527 | 13 | 0.4 |
| updateBefore three.js:3851:15106 | 13 | 0.4 |

shaders:
```
shaders: 86 built in warm-up, 4 after (0 drawn late), worst block 8 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

## 14 h, rain

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
| rain | 1 | 1 | 0 | 0 | 2 |
| far folk | 1 | 1 | 1 | 0 | 12782 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 10 | 205 | 103 | 205 | 1325844 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 9.0 | 12.6 | 9.5 | 315 | 0 |  |
| without town | 10.2 | 26.0 | 10.5 | 324 | 0 | -0.2 |
| without volumes | 12.8 | 30.0 | 14.3 | 360 | 0 | 0.1 |
| without terrain | 11.5 | 13.9 | 11.0 | 282 | 0 | 3.3 |
| without sky | 13.8 | 29.6 | 14.7 | 376 | 1 | 0.6 |
| without sea | 15.0 | 28.3 | 15.0 | 381 | 0 | -0.9 |
| without grass | 16.7 | 30.3 | 15.7 | 379 | 0 | -0.9 |
| without hero | 17.6 | 30.9 | 16.5 | 391 | 0 | 1.5 |
| without horse | 15.2 | 30.3 | 15.5 | 371 | 0 | 5.5 |
| without cow | 17.8 | 31.1 | 17.1 | 390 | 0 | 3.6 |
| without rain | 19.9 | 31.8 | 16.8 | 391 | 0 | 2.8 |
| without far folk | 18.9 | 30.9 | 16.4 | 385 | 0 | 2.5 |
| without flora | 14.5 | 30.7 | 14.9 | 313 | 0 | 4.1 |
| without townsfolk | 9.3 | 13.4 | 9.2 | 248 | 0 | 5.7 |
| without sun shadow redraw | 8.9 | 12.5 | 7.8 | 400 | 0 | 3.1 |
| nothing (empty scene, post chain only) | 3.1 | 3.9 | 2.5 | 30 | 0 | 8.2 |

townsfolk over 5 s: 1 dressings, freed {"hidden":0,"ranked":1,"far":0}; updateHiddenSkin 9× 24 ms: 4× other -> level 2, 2× auto level -> level 1, 1× applyShape -> level 2, 1× other -> level 0, 1× other -> level 1

CPU profile, 3 s (3233 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2107 | 65.2 |
| (native) | 780 | 24.1 |
| main.js | 239 | 7.4 |
| creatorUi.js | 87 | 2.7 |
| src.js | 19 | 0.6 |
| art.js | 1 | 0.0 |
| index.js | 1 | 0.0 |
| math.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 359 | 11.1 |
| multiplyMatrices three.js:1:47098 | 343 | 10.6 |
| writeBuffer (native):0:0 | 200 | 6.2 |
| updateMatrixWorld three.js:1:61326 | 175 | 5.4 |
| updateForRender three.js:3851:15750 | 152 | 4.7 |
| update three.js:3851:77218 | 129 | 4.0 |
| _update three.js:3845:95054 | 110 | 3.4 |
| setVertexBuffer (native):0:0 | 91 | 2.8 |
| t._update main.js:2:2365 | 90 | 2.8 |
| _renderObjectDirect three.js:3851:73474 | 71 | 2.2 |
| _projectObject three.js:3851:67866 | 66 | 2.0 |
| updateNumber three.js:3851:77777 | 59 | 1.8 |
| getMaterialCacheKey three.js:3845:78067 | 50 | 1.5 |
| _getNodeChildren three.js:3845:10532 | 49 | 1.5 |
| updateAttributes three.js:3845:83749 | 45 | 1.4 |
| draw three.js:4360:28070 | 42 | 1.3 |
| get needsGeometryUpdate three.js:3845:78884 | 42 | 1.3 |
| get three.js:4027:3560 | 41 | 1.3 |
| update three.js:3839:26984 | 40 | 1.2 |
| get value three.js:3839:3913 | 40 | 1.2 |
| a._renderObjectDirect main.js:2:1539 | 37 | 1.1 |
| Ic three.js:3825:19 | 35 | 1.1 |
| updateAttribute three.js:3845:84078 | 34 | 1.1 |
| update three.js:3839:9452 | 33 | 1.0 |
| getForRender three.js:3845:90247 | 30 | 0.9 |
| _getWeakMap three.js:3845:73263 | 29 | 0.9 |
| setBindGroup (native):0:0 | 27 | 0.8 |
| (anonymous) three.js:3825:28488 | 27 | 0.8 |
| apply three.js:5:55377 | 26 | 0.8 |
| updateBinding three.js:4359:5655 | 24 | 0.7 |
| (garbage collector) (native):0:0 | 24 | 0.7 |
| needsRenderUpdate three.js:4360:29845 | 23 | 0.7 |
| updateMatrixWorld three.js:1:146835 | 23 | 0.7 |
| slerpFlat three.js:1:10116 | 21 | 0.7 |
| getDynamicCacheKey three.js:3845:79276 | 19 | 0.6 |
| renderObject three.js:3851:71607 | 19 | 0.6 |
| intersectsObject three.js:1:154426 | 18 | 0.6 |
| setIndexBuffer (native):0:0 | 18 | 0.6 |
| fetch main.js:3:134107 | 18 | 0.6 |
| submit (native):0:0 | 17 | 0.5 |
| invert three.js:1:48739 | 17 | 0.5 |
| updateHiddenSkin creatorUi.js:487:23701 | 15 | 0.5 |
| getCacheKey three.js:3845:79578 | 15 | 0.4 |
| getGeometryCacheKey three.js:3845:77641 | 14 | 0.4 |
| setFromRotationMatrix three.js:1:53586 | 14 | 0.4 |

shaders:
```
shaders: 86 built in warm-up, 5 after (0 drawn late), worst block 8 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 2× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
