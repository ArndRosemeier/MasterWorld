
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 2.2 s

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
| townsfolk | 28 | 409 | 65 | 409 | 3677541 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 11.8 | 29.6 | 13.6 | 361 | 0 |  |
| without town | 13.7 | 31.7 | 14.9 | 348 | 0 | 0.3 |
| without volumes | 18.6 | 32.6 | 20.3 | 366 | 0 | -4.7 |
| without terrain | 9.8 | 16.1 | 11.1 | 283 | 0 | 2.1 |
| without sky | 13.9 | 32.2 | 16.2 | 374 | 0 | -0.1 |
| without sea | 17.4 | 32.4 | 18.3 | 376 | 0 | -2.2 |
| without grass | 16.8 | 33.9 | 19.4 | 378 | 0 | -0.1 |
| without hero | 16.1 | 41.4 | 20.0 | 385 | 0 | 1.5 |
| without horse | 17.6 | 36.4 | 18.9 | 365 | 0 | -0.3 |
| without cow | 35.3 | 87.3 | 39.1 | 385 | 0 | -9.9 |
| without far folk | 31.4 | 47.2 | 33.0 | 390 | 0 | 0.8 |
| without townsfolk | 18.3 | 39.4 | 18.4 | 241 | 0 | 12.6 |
| without flora | 23.3 | 44.5 | 23.5 | 306 | 0 | 7.7 |
| without sun shadow redraw | 18.7 | 39.4 | 16.6 | 396 | 0 | 8.7 |
| nothing (empty scene, post chain only) | 7.8 | 12.6 | 6.7 | 29 | 0 | 15.2 |

CPU profile, 3 s (3472 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2174 | 62.6 |
| (native) | 943 | 27.2 |
| main.js | 170 | 4.9 |
| creatorUi.js | 149 | 4.3 |
| src.js | 33 | 1.0 |
| packFetch.js | 1 | 0.0 |
| art.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 578 | 16.7 |
| multiplyMatrices three.js:1:47098 | 367 | 10.6 |
| updateMatrixWorld three.js:1:61326 | 231 | 6.6 |
| updateForRender three.js:3851:15750 | 128 | 3.7 |
| update three.js:3851:77218 | 119 | 3.4 |
| writeBuffer (native):0:0 | 119 | 3.4 |
| _renderObjectDirect three.js:3851:73474 | 106 | 3.1 |
| setVertexBuffer (native):0:0 | 99 | 2.8 |
| _update three.js:3845:95054 | 94 | 2.7 |
| _projectObject three.js:3851:67866 | 83 | 2.4 |
| get three.js:3845:80156 | 80 | 2.3 |
| t._update main.js:2:1840 | 76 | 2.2 |
| update three.js:3839:26984 | 62 | 1.8 |
| getMaterialCacheKey three.js:3845:78067 | 53 | 1.5 |
| updateAttributes three.js:3845:83749 | 48 | 1.4 |
| updateNumber three.js:3851:77777 | 47 | 1.4 |
| updateHiddenSkin creatorUi.js:487:23701 | 46 | 1.3 |
| _draw three.js:4360:26376 | 43 | 1.3 |
| _getNodeChildren three.js:3845:10532 | 43 | 1.2 |
| submit (native):0:0 | 38 | 1.1 |
| update three.js:3839:9452 | 36 | 1.0 |
| updateAttribute three.js:3845:84078 | 35 | 1.0 |
| get value three.js:3839:3913 | 35 | 1.0 |
| draw three.js:4360:28070 | 33 | 1.0 |
| apply three.js:5:55377 | 32 | 0.9 |
| needsRenderUpdate three.js:4360:29845 | 27 | 0.8 |
| getForRender three.js:3845:90247 | 26 | 0.7 |
| Ic three.js:3825:19 | 24 | 0.7 |
| setBindGroup (native):0:0 | 24 | 0.7 |
| (garbage collector) (native):0:0 | 21 | 0.6 |
| invert three.js:1:48739 | 20 | 0.6 |
| renderObject three.js:3851:71607 | 20 | 0.6 |
| updateMatrixWorld three.js:1:146835 | 20 | 0.6 |
| (anonymous) creatorUi.js:487:35064 | 19 | 0.6 |
| (anonymous) three.js:3825:28488 | 19 | 0.5 |
| slerpFlat three.js:1:10116 | 18 | 0.5 |
| intersectsObject three.js:1:154426 | 18 | 0.5 |
| update main.js:3:109876 | 17 | 0.5 |
| getGeometryCacheKey three.js:3845:77641 | 16 | 0.5 |
| fbm2 src.js:1:4767 | 16 | 0.5 |
| updateBefore three.js:3851:15106 | 16 | 0.5 |
| setIndexBuffer (native):0:0 | 15 | 0.4 |
| (anonymous) three.js:3839:19632 | 14 | 0.4 |
| fetch main.js:3:134456 | 14 | 0.4 |
| update three.js:5:74616 | 14 | 0.4 |

shaders:
```
shaders: 85 built in warm-up, 4 after, worst block 9 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 2× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
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
| townsfolk | 30 | 498 | 98 | 498 | 4062099 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 22.1 | 77.2 | 22.3 | 402 | 0 |  |
| without town | 21.3 | 53.4 | 21.1 | 374 | 0 | -1.1 |
| without volumes | 14.7 | 32.0 | 15.8 | 376 | 1 | 1.9 |
| without terrain | 13.2 | 31.9 | 15.4 | 281 | 0 | 3.9 |
| without sky | 13.7 | 32.1 | 15.4 | 364 | 0 | 3.2 |
| without sea | 13.1 | 31.9 | 15.8 | 348 | 0 | -0.1 |
| without grass | 11.2 | 27.6 | 13.5 | 333 | 0 | 0.3 |
| without hero | 11.4 | 16.6 | 12.8 | 332 | 0 | 1.1 |
| without horse | 22.6 | 35.9 | 25.0 | 302 | 0 | -9.5 |
| without cow | 11.6 | 29.8 | 13.4 | 308 | 0 | 0.2 |
| without far folk | 11.6 | 30.5 | 16.3 | 300 | 0 | 1.4 |
| without flora | 16.1 | 30.3 | 17.8 | 214 | 0 | -1.9 |
| without townsfolk | 9.2 | 14.1 | 10.6 | 248 | 0 | 3.1 |
| without sun shadow redraw | 8.8 | 26.8 | 9.3 | 261 | 0 | 2.8 |
| nothing (empty scene, post chain only) | 3.7 | 6.9 | 4.4 | 33 | 0 | 6.8 |

CPU profile, 3 s (3337 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 1994 | 59.7 |
| (native) | 1114 | 33.4 |
| main.js | 182 | 5.5 |
| creatorUi.js | 36 | 1.1 |
| src.js | 11 | 0.3 |
| math.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 489 | 14.7 |
| multiplyMatrices three.js:1:47098 | 253 | 7.6 |
| setPipeline (native):0:0 | 237 | 7.1 |
| updateMatrixWorld three.js:1:61326 | 235 | 7.0 |
| writeBuffer (native):0:0 | 163 | 4.9 |
| updateForRender three.js:3851:15750 | 143 | 4.3 |
| _renderObjectDirect three.js:3851:73474 | 110 | 3.3 |
| _update three.js:3845:95054 | 106 | 3.2 |
| update three.js:3851:77218 | 90 | 2.7 |
| setVertexBuffer (native):0:0 | 76 | 2.3 |
| t._update main.js:2:1840 | 70 | 2.1 |
| getMaterialCacheKey three.js:3845:78067 | 57 | 1.7 |
| _getNodeChildren three.js:3845:10532 | 49 | 1.5 |
| get value three.js:3839:3913 | 48 | 1.4 |
| update three.js:3839:26984 | 45 | 1.3 |
| Ic three.js:3825:19 | 43 | 1.3 |
| updateAttributes three.js:3845:83749 | 43 | 1.3 |
| draw three.js:4360:28070 | 41 | 1.2 |
| updateNumber three.js:3851:77777 | 41 | 1.2 |
| get three.js:4027:3560 | 40 | 1.2 |
| _projectObject three.js:3851:67866 | 39 | 1.2 |
| update three.js:3839:9452 | 38 | 1.2 |
| get needsGeometryUpdate three.js:3845:78884 | 36 | 1.1 |
| submit (native):0:0 | 34 | 1.0 |
| updateAttribute three.js:3845:84078 | 34 | 1.0 |
| setBindGroup (native):0:0 | 33 | 1.0 |
| getForRender three.js:3845:90247 | 32 | 1.0 |
| needsRenderUpdate three.js:4360:29845 | 29 | 0.9 |
| update main.js:3:109876 | 27 | 0.8 |
| _getWeakMap three.js:3845:73263 | 26 | 0.8 |
| updateMatrixWorld three.js:1:146835 | 24 | 0.7 |
| renderObject three.js:3851:71607 | 24 | 0.7 |
| getGeometryCacheKey three.js:3845:77641 | 22 | 0.7 |
| intersectsObject three.js:1:154426 | 21 | 0.6 |
| apply three.js:5:55377 | 20 | 0.6 |
| (garbage collector) (native):0:0 | 18 | 0.5 |
| fetch main.js:3:134456 | 17 | 0.5 |
| setIndexBuffer (native):0:0 | 16 | 0.5 |
| setFromRotationMatrix three.js:1:53586 | 14 | 0.4 |
| updateBinding three.js:4359:5655 | 13 | 0.4 |
| updateVector2 three.js:3851:77958 | 13 | 0.4 |
| updateReference three.js:3839:4181 | 13 | 0.4 |
| invert three.js:1:48739 | 12 | 0.4 |
| updateMatrix3 three.js:3851:78948 | 12 | 0.4 |
| getCacheKey three.js:3845:79578 | 10 | 0.3 |

shaders:
```
shaders: 85 built in warm-up, 5 after, worst block 11 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 2× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

## 14 h, rain

settled in 1.6 s

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
| far folk | 1 | 1 | 1 | 0 | 9702 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 29 | 581 | 119 | 581 | 4012639 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 14.9 | 30.8 | 15.8 | 382 | 0 |  |
| without town | 15.3 | 32.1 | 16.2 | 378 | 0 | -0.5 |
| without volumes | 13.5 | 29.5 | 14.3 | 391 | 0 | 0.6 |
| without terrain | 10.7 | 15.6 | 11.3 | 306 | 0 | 2.9 |
| without sky | 14.5 | 31.4 | 16.9 | 391 | 1 | -0.1 |
| without sea | 14.9 | 31.3 | 16.5 | 399 | 0 | 0.4 |
| without grass | 15.0 | 31.9 | 17.1 | 401 | 0 | -0.1 |
| without hero | 29.2 | 48.7 | 16.3 | 405 | 0 | 12.8 |
| without horse | 56.9 | 80.8 | 25.5 | 384 | 0 | -2.1 |
| without cow | 54.9 | 63.7 | 14.8 | 402 | 0 | -0.1 |
| without rain | 88.1 | 126.4 | 22.0 | 398 | 0 | 3.0 |
| without far folk | 120.2 | 170.1 | 25.1 | 399 | 0 | -17.2 |
| without flora | 94.3 | 125.6 | 23.8 | 320 | 0 | -1.0 |
| without townsfolk | 79.7 | 124.9 | 15.7 | 249 | 0 | 6.4 |
| without sun shadow redraw | 63.5 | 93.0 | 11.9 | 401 | 0 | 15.1 |
| nothing (empty scene, post chain only) | 77.0 | 140.1 | 7.4 | 34 | 0 | 9.0 |

CPU profile, 3 s (3483 ms sampled):

| script | ms | % |
|---|---|---|
| creatorUi.js | 2065 | 59.3 |
| three.js | 827 | 23.7 |
| (native) | 527 | 15.1 |
| main.js | 61 | 1.7 |
| src.js | 3 | 0.1 |
| packFetch.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| updateHiddenSkin creatorUi.js:487:23701 | 1717 | 49.3 |
| (program) (native):0:0 | 360 | 10.3 |
| sampleInto creatorUi.js:1:23796 | 102 | 2.9 |
| multiplyMatrices three.js:1:47098 | 83 | 2.4 |
| traverseVisible three.js:1:60841 | 65 | 1.9 |
| writeBuffer (native):0:0 | 61 | 1.7 |
| updateMatrixWorld three.js:1:61326 | 54 | 1.5 |
| br creatorUi.js:1:28008 | 51 | 1.5 |
| updateForRender three.js:3851:15750 | 49 | 1.4 |
| update three.js:3851:77218 | 43 | 1.2 |
| bake creatorUi.js:1:25156 | 39 | 1.1 |
| update three.js:3839:26984 | 35 | 1.0 |
| _update three.js:3845:95054 | 33 | 0.9 |
| updateVisibility creatorUi.js:487:14293 | 28 | 0.8 |
| Pt three.js:1:1956 | 27 | 0.8 |
| (anonymous) creatorUi.js:1:25407 | 25 | 0.7 |
| (garbage collector) (native):0:0 | 25 | 0.7 |
| t._update main.js:2:1840 | 24 | 0.7 |
| xr creatorUi.js:1:28403 | 24 | 0.7 |
| setVertexBuffer (native):0:0 | 21 | 0.6 |
| _renderObjectDirect three.js:3851:73474 | 21 | 0.6 |
| _projectObject three.js:3851:67866 | 18 | 0.5 |
| createBuffer (native):0:0 | 17 | 0.5 |
| _removeInactiveBinding three.js:5:73056 | 17 | 0.5 |
| createAttribute three.js:4359:500 | 15 | 0.4 |
| update three.js:3839:9452 | 14 | 0.4 |
| getMaterialCacheKey three.js:3845:78067 | 14 | 0.4 |
| updateAttributes three.js:3845:83749 | 14 | 0.4 |
| get three.js:4027:3560 | 13 | 0.4 |
| updateNumber three.js:3851:77777 | 13 | 0.4 |
| _getNodeChildren three.js:3845:10532 | 12 | 0.4 |
| _bindAction three.js:5:69970 | 12 | 0.4 |
| draw three.js:4360:28070 | 12 | 0.3 |
| get three.js:3845:81153 | 11 | 0.3 |
| sample creatorUi.js:1:23359 | 10 | 0.3 |
| get value three.js:3839:3913 | 10 | 0.3 |
| setFromBufferAttribute three.js:1:83153 | 9 | 0.3 |
| updateMatrixWorld three.js:1:146835 | 9 | 0.3 |
| (idle) (native):0:0 | 8 | 0.2 |
| Ic three.js:3825:19 | 7 | 0.2 |
| getMappedRange (native):0:0 | 7 | 0.2 |
| (anonymous) creatorUi.js:487:35064 | 7 | 0.2 |
| invert three.js:1:48739 | 7 | 0.2 |
| (anonymous) three.js:3825:28488 | 7 | 0.2 |
| n three.js:5:58854 | 7 | 0.2 |

shaders:
```
shaders: 85 built in warm-up, 6 after, worst block 11 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 2× MeshStandardNodeMaterial
- 2× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
