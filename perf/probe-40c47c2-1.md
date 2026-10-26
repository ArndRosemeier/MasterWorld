
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 2.4 s

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
| townsfolk | 28 | 409 | 64 | 409 | 3684534 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 11.6 | 28.3 | 11.8 | 360 | 0 |  |
| without town | 11.0 | 14.4 | 11.4 | 346 | 0 | 0.4 |
| without volumes | 11.2 | 15.0 | 11.7 | 366 | 0 | 0.2 |
| without terrain | 9.3 | 12.4 | 9.7 | 283 | 0 | 2.3 |
| without sky | 11.8 | 15.0 | 11.9 | 373 | 0 | -0.1 |
| without sea | 12.2 | 15.4 | 12.3 | 374 | 0 | -0.1 |
| without grass | 12.1 | 15.3 | 12.1 | 380 | 0 | 0.0 |
| without hero | 11.9 | 15.7 | 12.3 | 384 | 0 | 0.3 |
| without horse | 11.9 | 14.9 | 11.8 | 364 | 0 | 0.4 |
| without cow | 12.3 | 15.3 | 12.3 | 385 | 0 | 0.1 |
| without far folk | 12.8 | 15.3 | 12.6 | 390 | 0 | -0.4 |
| without townsfolk | 7.6 | 10.8 | 7.3 | 242 | 0 | 4.8 |
| without flora | 11.2 | 14.3 | 11.0 | 306 | 0 | 1.3 |
| without sun shadow redraw | 10.1 | 12.1 | 8.3 | 396 | 0 | 2.3 |
| nothing (empty scene, post chain only) | 3.5 | 5.4 | 2.8 | 29 | 0 | 9.1 |

townsfolk over 5 s: 3 dressings, freed {"hidden":0,"ranked":3,"far":0}; updateHiddenSkin 17× 46 ms: 8× other -> level 2, 3× applyShape -> level 2, 3× other -> level 0, 3× other -> level 1

CPU profile, 3 s (3272 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2132 | 65.1 |
| (native) | 815 | 24.9 |
| main.js | 166 | 5.1 |
| creatorUi.js | 138 | 4.2 |
| src.js | 21 | 0.7 |
| art.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 426 | 13.0 |
| multiplyMatrices three.js:1:47098 | 335 | 10.2 |
| updateMatrixWorld three.js:1:61326 | 219 | 6.7 |
| writeBuffer (native):0:0 | 152 | 4.6 |
| updateForRender three.js:3851:15750 | 132 | 4.0 |
| _renderObjectDirect three.js:3851:73474 | 125 | 3.8 |
| update three.js:3851:77218 | 115 | 3.5 |
| setVertexBuffer (native):0:0 | 107 | 3.3 |
| _update three.js:3845:95054 | 95 | 2.9 |
| _projectObject three.js:3851:67866 | 80 | 2.5 |
| get three.js:3845:80156 | 75 | 2.3 |
| t._update main.js:2:1840 | 74 | 2.3 |
| update three.js:3839:26984 | 56 | 1.7 |
| updateAttributes three.js:3845:83749 | 53 | 1.6 |
| _draw three.js:4360:26376 | 51 | 1.6 |
| updateHiddenSkin creatorUi.js:487:23701 | 50 | 1.5 |
| updateAttribute three.js:3845:84078 | 42 | 1.3 |
| updateNumber three.js:3851:77777 | 41 | 1.2 |
| getMaterialCacheKey three.js:3845:78067 | 39 | 1.2 |
| draw three.js:4360:28070 | 37 | 1.1 |
| _getNodeChildren three.js:3845:10532 | 36 | 1.1 |
| get value three.js:3839:3913 | 35 | 1.1 |
| apply three.js:5:55377 | 34 | 1.0 |
| needsRenderUpdate three.js:4360:29845 | 33 | 1.0 |
| update three.js:3839:9452 | 30 | 0.9 |
| getForRender three.js:3845:90247 | 30 | 0.9 |
| setBindGroup (native):0:0 | 30 | 0.9 |
| Ic three.js:3825:19 | 29 | 0.9 |
| updateMatrixWorld three.js:1:146835 | 27 | 0.8 |
| renderObject three.js:3851:71607 | 22 | 0.7 |
| setIndexBuffer (native):0:0 | 22 | 0.7 |
| (anonymous) three.js:3825:28488 | 22 | 0.7 |
| getGeometryCacheKey three.js:3845:77641 | 21 | 0.6 |
| slerpFlat three.js:1:10116 | 19 | 0.6 |
| updateBinding three.js:4359:5655 | 19 | 0.6 |
| fetch main.js:3:134582 | 18 | 0.5 |
| (garbage collector) (native):0:0 | 17 | 0.5 |
| submit (native):0:0 | 17 | 0.5 |
| intersectsObject three.js:1:154426 | 17 | 0.5 |
| setFromRotationMatrix three.js:1:53586 | 14 | 0.4 |
| n2 src.js:1:2793 | 13 | 0.4 |
| updateVector3 three.js:3851:78181 | 13 | 0.4 |
| (anonymous) creatorUi.js:487:35064 | 13 | 0.4 |
| update three.js:5:74616 | 11 | 0.3 |
| (anonymous) three.js:3839:19632 | 11 | 0.3 |

shaders:
```
shaders: 86 built in warm-up, 3 after, worst block 8 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]

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
| far folk | 1 | 1 | 1 | 0 | 10010 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 24 | 409 | 76 | 409 | 3319611 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 13.4 | 34.5 | 13.5 | 393 | 0 |  |
| without town | 13.0 | 25.1 | 13.0 | 379 | 0 | 0.0 |
| without volumes | 13.1 | 26.5 | 13.4 | 394 | 0 | 0.3 |
| without terrain | 11.3 | 15.5 | 11.3 | 311 | 0 | 2.2 |
| without sky | 13.6 | 28.6 | 13.8 | 399 | 0 | -0.3 |
| without sea | 13.0 | 26.1 | 13.7 | 398 | 0 | 0.5 |
| without grass | 13.4 | 26.5 | 13.8 | 398 | 0 | -0.1 |
| without hero | 13.6 | 28.8 | 14.3 | 399 | 0 | -0.2 |
| without horse | 12.5 | 16.1 | 12.8 | 371 | 0 | 0.9 |
| without cow | 13.1 | 26.8 | 13.5 | 391 | 0 | 0.2 |
| without rain | 13.5 | 28.2 | 14.0 | 394 | 0 | -0.3 |
| without far folk | 13.0 | 27.5 | 13.5 | 396 | 0 | 0.2 |
| without flora | 11.8 | 15.1 | 11.9 | 313 | 0 | 1.3 |
| without townsfolk | 7.9 | 11.1 | 7.7 | 246 | 0 | 5.2 |
| without sun shadow redraw | 10.9 | 12.8 | 9.3 | 412 | 0 | 2.4 |
| nothing (empty scene, post chain only) | 3.5 | 5.5 | 2.9 | 30 | 0 | 10.3 |

townsfolk over 5 s: 4 dressings, freed {"hidden":3,"ranked":1,"far":0}; updateHiddenSkin 21× 59 ms: 9× other -> level 2, 4× applyShape -> level 2, 4× other -> level 0, 4× other -> level 1

CPU profile, 3 s (3248 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2186 | 67.3 |
| (native) | 772 | 23.8 |
| main.js | 153 | 4.7 |
| creatorUi.js | 118 | 3.6 |
| src.js | 16 | 0.5 |
| art.js | 3 | 0.1 |
| index.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 350 | 10.8 |
| multiplyMatrices three.js:1:47098 | 345 | 10.6 |
| updateMatrixWorld three.js:1:61326 | 225 | 6.9 |
| writeBuffer (native):0:0 | 189 | 5.8 |
| updateForRender three.js:3851:15750 | 131 | 4.0 |
| update three.js:3851:77218 | 120 | 3.7 |
| _update three.js:3845:95054 | 115 | 3.5 |
| _renderObjectDirect three.js:3851:73474 | 114 | 3.5 |
| setVertexBuffer (native):0:0 | 91 | 2.8 |
| _projectObject three.js:3851:67866 | 72 | 2.2 |
| t._update main.js:2:1840 | 67 | 2.1 |
| update three.js:3839:26984 | 66 | 2.0 |
| updateAttributes three.js:3845:83749 | 57 | 1.7 |
| draw three.js:4360:28070 | 55 | 1.7 |
| getMaterialCacheKey three.js:3845:78067 | 55 | 1.7 |
| updateNumber three.js:3851:77777 | 51 | 1.6 |
| get three.js:4027:3560 | 50 | 1.5 |
| updateAttribute three.js:3845:84078 | 40 | 1.2 |
| needsRenderUpdate three.js:4360:29845 | 38 | 1.2 |
| setBindGroup (native):0:0 | 38 | 1.2 |
| get needsGeometryUpdate three.js:3845:78884 | 38 | 1.2 |
| get value three.js:3839:3913 | 36 | 1.1 |
| _getNodeChildren three.js:3845:10532 | 36 | 1.1 |
| updateHiddenSkin creatorUi.js:487:23701 | 34 | 1.0 |
| updateMatrixWorld three.js:1:146835 | 26 | 0.8 |
| (anonymous) three.js:3825:28488 | 26 | 0.8 |
| apply three.js:5:55377 | 25 | 0.8 |
| intersectsObject three.js:1:154426 | 25 | 0.8 |
| getForRender three.js:3845:90247 | 25 | 0.8 |
| _getWeakMap three.js:3845:73263 | 24 | 0.7 |
| Ic three.js:3825:19 | 24 | 0.7 |
| (garbage collector) (native):0:0 | 23 | 0.7 |
| renderObject three.js:3851:71607 | 20 | 0.6 |
| update three.js:3839:9452 | 20 | 0.6 |
| updateBinding three.js:4359:5655 | 20 | 0.6 |
| update three.js:5:74616 | 17 | 0.5 |
| setFromRotationMatrix three.js:1:53586 | 16 | 0.5 |
| fetch main.js:3:134582 | 16 | 0.5 |
| setIndexBuffer (native):0:0 | 15 | 0.5 |
| submit (native):0:0 | 14 | 0.4 |
| slerpFlat three.js:1:10116 | 14 | 0.4 |
| getGeometryCacheKey three.js:3845:77641 | 14 | 0.4 |
| invert three.js:1:48739 | 13 | 0.4 |
| (anonymous) creatorUi.js:487:35064 | 12 | 0.4 |
| _renderObjects three.js:3851:69810 | 12 | 0.4 |

shaders:
```
shaders: 86 built in warm-up, 3 after, worst block 8 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
