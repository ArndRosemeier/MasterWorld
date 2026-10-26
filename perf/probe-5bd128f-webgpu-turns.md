
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 2.0 s

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
| far folk | 1 | 1 | 1 | 0 | 3388 |
| townsfolk | 27 | 394 | 65 | 394 | 3572069 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 13.5 | 61.9 | 13.3 | 361 | 0 |  |
| without town | 13.3 | 22.3 | 14.0 | 348 | 0 | -0.5 |
| without volumes | 11.6 | 14.8 | 12.1 | 366 | 0 | 0.2 |
| without terrain | 10.1 | 13.0 | 10.1 | 282 | 0 | 2.0 |
| without sky | 12.1 | 16.5 | 12.6 | 374 | 0 | 0.5 |
| without sea | 12.1 | 15.8 | 12.4 | 374 | 0 | 9.8 |
| without grass | 32.2 | 63.3 | 13.3 | 370 | 0 | 14.2 |
| without hero | 62.4 | 79.0 | 13.4 | 376 | 0 | -0.7 |
| without horse | 63.1 | 93.2 | 15.3 | 354 | 0 | -1.1 |
| without cow | 76.5 | 93.7 | 16.1 | 375 | 0 | -22.5 |
| without far folk | 35.6 | 59.1 | 13.1 | 380 | 0 | 18.7 |
| without townsfolk | 31.6 | 74.4 | 9.1 | 252 | 0 | 15.6 |
| without flora | 31.2 | 47.2 | 11.6 | 296 | 0 | 0.3 |
| without sun shadow redraw | 9.8 | 32.2 | 8.4 | 386 | 0 | 21.9 |
| nothing (empty scene, post chain only) | 61.7 | 77.5 | 4.4 | 30 | 0 | -7.1 |

CPU profile, 3 s (3313 ms sampled):

| script | ms | % |
|---|---|---|
| creatorUi.js | 1995 | 60.2 |
| three.js | 772 | 23.3 |
| (native) | 483 | 14.6 |
| main.js | 56 | 1.7 |
| src.js | 7 | 0.2 |

| function (self time) | ms | % |
|---|---|---|
| updateHiddenSkin creatorUi.js:487:23701 | 1523 | 46.0 |
| (program) (native):0:0 | 319 | 9.6 |
| br creatorUi.js:1:28008 | 141 | 4.3 |
| multiplyMatrices three.js:1:47098 | 96 | 2.9 |
| xr creatorUi.js:1:28403 | 84 | 2.5 |
| sampleInto creatorUi.js:1:23796 | 78 | 2.3 |
| bake creatorUi.js:1:25156 | 55 | 1.7 |
| updateMatrixWorld three.js:1:61326 | 48 | 1.4 |
| (garbage collector) (native):0:0 | 41 | 1.2 |
| updateForRender three.js:3851:15750 | 39 | 1.2 |
| traverseVisible three.js:1:60841 | 38 | 1.1 |
| update three.js:3851:77218 | 36 | 1.1 |
| writeBuffer (native):0:0 | 32 | 1.0 |
| _update three.js:3845:95054 | 32 | 1.0 |
| setVertexBuffer (native):0:0 | 26 | 0.8 |
| get three.js:3845:80156 | 26 | 0.8 |
| _renderObjectDirect three.js:3851:73474 | 26 | 0.8 |
| createAttribute three.js:4359:500 | 24 | 0.7 |
| setFromBufferAttribute three.js:1:83153 | 24 | 0.7 |
| t._update main.js:2:1840 | 22 | 0.7 |
| (anonymous) creatorUi.js:1:29527 | 21 | 0.6 |
| updateAttributes three.js:3845:83749 | 19 | 0.6 |
| updateVisibility creatorUi.js:487:14293 | 19 | 0.6 |
| update three.js:3839:26984 | 17 | 0.5 |
| createBuffer (native):0:0 | 17 | 0.5 |
| _projectObject three.js:3851:67866 | 15 | 0.5 |
| wr creatorUi.js:1:29809 | 15 | 0.4 |
| getMaterialCacheKey three.js:3845:78067 | 15 | 0.4 |
| _draw three.js:4360:26376 | 13 | 0.4 |
| get value three.js:3839:3913 | 12 | 0.4 |
| _removeInactiveBinding three.js:5:73056 | 12 | 0.4 |
| needsRenderUpdate three.js:4360:29845 | 12 | 0.4 |
| _getNodeChildren three.js:3845:10532 | 11 | 0.3 |
| updateAttribute three.js:3845:84078 | 11 | 0.3 |
| updateNumber three.js:3851:77777 | 10 | 0.3 |
| _bindAction three.js:5:69970 | 10 | 0.3 |
| Pt three.js:1:1956 | 10 | 0.3 |
| invert three.js:1:48739 | 10 | 0.3 |
| buildCrowd creatorUi.js:487:25445 | 8 | 0.3 |
| update three.js:3839:9452 | 8 | 0.3 |
| colorCrowd creatorUi.js:487:27408 | 8 | 0.2 |
| getForRender three.js:3845:90247 | 8 | 0.2 |
| computeBoundingSphere three.js:1:100334 | 7 | 0.2 |
| renderObject three.js:3851:71607 | 7 | 0.2 |
| compileAsync three.js:3851:45330 | 7 | 0.2 |

shaders:
```
shaders: 85 built in warm-up, 3 after, worst block 10 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× MeshStandardNodeMaterial
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
| far folk | 1 | 1 | 1 | 0 | 4466 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 30 | 499 | 119 | 499 | 4082994 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 77.8 | 110.1 | 13.7 | 382 | 0 |  |
| without town | 13.0 | 21.5 | 13.2 | 367 | 1 | 32.8 |
| without volumes | 12.3 | 16.4 | 12.6 | 366 | 0 | 1.1 |
| without terrain | 10.6 | 14.2 | 10.6 | 279 | 0 | 1.9 |
| without sky | 12.4 | 17.0 | 12.8 | 352 | 0 | -0.7 |
| without sea | 10.4 | 13.6 | 11.1 | 331 | 0 | 0.4 |
| without grass | 10.3 | 13.3 | 10.8 | 322 | 0 | 0.2 |
| without hero | 10.6 | 16.3 | 12.1 | 323 | 0 | -0.2 |
| without horse | 9.3 | 11.7 | 10.1 | 297 | 0 | 0.6 |
| without cow | 9.8 | 14.2 | 10.5 | 308 | 0 | -0.2 |
| without far folk | 9.1 | 11.7 | 9.8 | 302 | 0 | 0.5 |
| without flora | 6.8 | 10.2 | 8.1 | 216 | 0 | 1.9 |
| without townsfolk | 6.7 | 11.8 | 8.5 | 248 | 0 | 1.3 |
| without sun shadow redraw | 7.7 | 9.4 | 7.0 | 264 | 0 | 0.3 |
| nothing (empty scene, post chain only) | 3.0 | 4.4 | 3.2 | 29 | 0 | 5.1 |

CPU profile, 3 s (3335 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2210 | 66.3 |
| (native) | 855 | 25.6 |
| main.js | 203 | 6.1 |
| creatorUi.js | 49 | 1.5 |
| src.js | 17 | 0.5 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 495 | 14.8 |
| multiplyMatrices three.js:1:47098 | 301 | 9.0 |
| updateMatrixWorld three.js:1:61326 | 207 | 6.2 |
| updateForRender three.js:3851:15750 | 185 | 5.5 |
| _update three.js:3845:95054 | 127 | 3.8 |
| writeBuffer (native):0:0 | 116 | 3.5 |
| update three.js:3851:77218 | 110 | 3.3 |
| _renderObjectDirect three.js:3851:73474 | 108 | 3.2 |
| getMaterialCacheKey three.js:3845:78067 | 89 | 2.7 |
| setVertexBuffer (native):0:0 | 85 | 2.5 |
| _getNodeChildren three.js:3845:10532 | 76 | 2.3 |
| t._update main.js:2:1840 | 67 | 2.0 |
| _projectObject three.js:3851:67866 | 62 | 1.8 |
| update three.js:3839:26984 | 55 | 1.7 |
| updateAttributes three.js:3845:83749 | 47 | 1.4 |
| update three.js:3839:9452 | 47 | 1.4 |
| Ic three.js:3825:19 | 45 | 1.3 |
| get value three.js:3839:3913 | 42 | 1.3 |
| updateNumber three.js:3851:77777 | 36 | 1.1 |
| submit (native):0:0 | 33 | 1.0 |
| update main.js:3:108366 | 32 | 1.0 |
| draw three.js:4360:28070 | 31 | 0.9 |
| getForRender three.js:3845:90247 | 30 | 0.9 |
| renderObject three.js:3851:71607 | 30 | 0.9 |
| get needsGeometryUpdate three.js:3845:78884 | 29 | 0.9 |
| get three.js:4027:3560 | 28 | 0.8 |
| fetch main.js:3:132946 | 28 | 0.8 |
| getGeometryCacheKey three.js:3845:77641 | 25 | 0.8 |
| updateAttribute three.js:3845:84078 | 24 | 0.7 |
| (garbage collector) (native):0:0 | 23 | 0.7 |
| getCacheKey three.js:3845:79578 | 22 | 0.7 |
| setBindGroup (native):0:0 | 21 | 0.6 |
| needsRenderUpdate three.js:4360:29845 | 21 | 0.6 |
| tend main.js:3:137914 | 20 | 0.6 |
| apply three.js:5:55377 | 20 | 0.6 |
| _getWeakMap three.js:3845:73263 | 19 | 0.6 |
| updateMatrixWorld three.js:1:146835 | 19 | 0.6 |
| invert three.js:1:48739 | 18 | 0.5 |
| intersectsObject three.js:1:154426 | 16 | 0.5 |
| updateBinding three.js:4359:5655 | 14 | 0.4 |
| updateHiddenSkin creatorUi.js:487:23701 | 14 | 0.4 |
| beginRenderPass (native):0:0 | 14 | 0.4 |
| getDynamicCacheKey three.js:3845:79276 | 13 | 0.4 |
| _getChildren three.js:3825:4728 | 13 | 0.4 |
| n2 src.js:1:2793 | 12 | 0.4 |

shaders:
```
shaders: 85 built in warm-up, 4 after, worst block 10 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 1× MeshStandardNodeMaterial
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
| townsfolk | 30 | 605 | 133 | 605 | 4183669 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 16.5 | 33.8 | 16.0 | 385 | 0 |  |
| without town | 13.6 | 26.0 | 14.5 | 372 | 0 | 2.7 |
| without volumes | 16.2 | 39.1 | 17.3 | 396 | 0 | -0.6 |
| without terrain | 12.2 | 18.8 | 12.6 | 297 | 0 | 2.6 |
| without sky | 15.4 | 20.0 | 15.2 | 394 | 0 | -0.5 |
| without sea | 21.0 | 59.5 | 15.1 | 400 | 0 | 8.3 |
| without grass | 62.5 | 78.4 | 15.4 | 398 | 0 | 5.5 |
| without hero | 139.8 | 201.8 | 14.7 | 393 | 0 | -7.8 |
| without horse | 140.1 | 170.4 | 13.7 | 365 | 0 | 15.9 |
| without cow | 125.4 | 158.5 | 14.5 | 383 | 0 | 14.9 |
| without rain | 155.6 | 188.9 | 15.0 | 386 | 0 | -11.2 |
| without far folk | 170.7 | 189.6 | 14.0 | 384 | 0 | -34.1 |
| without flora | 63.0 | 94.5 | 14.1 | 314 | 0 | 38.3 |
| without townsfolk | 92.6 | 94.4 | 9.8 | 254 | 0 | -6.9 |
| without sun shadow redraw | 92.9 | 110.9 | 9.8 | 400 | 0 | 0.2 |
| nothing (empty scene, post chain only) | 78.4 | 124.4 | 4.5 | 33 | 0 | 30.3 |

CPU profile, 3 s (3269 ms sampled):

| script | ms | % |
|---|---|---|
| creatorUi.js | 2170 | 66.4 |
| three.js | 667 | 20.4 |
| (native) | 390 | 11.9 |
| main.js | 38 | 1.2 |
| src.js | 4 | 0.1 |
| math.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| updateHiddenSkin creatorUi.js:487:23701 | 1694 | 51.8 |
| (program) (native):0:0 | 252 | 7.7 |
| br creatorUi.js:1:28008 | 142 | 4.3 |
| xr creatorUi.js:1:28403 | 89 | 2.7 |
| multiplyMatrices three.js:1:47098 | 75 | 2.3 |
| sampleInto creatorUi.js:1:23796 | 72 | 2.2 |
| bake creatorUi.js:1:25156 | 67 | 2.0 |
| (garbage collector) (native):0:0 | 46 | 1.4 |
| updateForRender three.js:3851:15750 | 41 | 1.3 |
| traverseVisible three.js:1:60841 | 38 | 1.2 |
| Pt three.js:1:1956 | 35 | 1.1 |
| update three.js:3851:77218 | 32 | 1.0 |
| setFromBufferAttribute three.js:1:83153 | 31 | 0.9 |
| writeBuffer (native):0:0 | 28 | 0.9 |
| _update three.js:3845:95054 | 24 | 0.7 |
| update three.js:3839:26984 | 24 | 0.7 |
| updateMatrixWorld three.js:1:61326 | 23 | 0.7 |
| (anonymous) creatorUi.js:1:29527 | 22 | 0.7 |
| createAttribute three.js:4359:500 | 21 | 0.6 |
| createBuffer (native):0:0 | 18 | 0.6 |
| updateVisibility creatorUi.js:487:14293 | 18 | 0.6 |
| wr creatorUi.js:1:29809 | 17 | 0.5 |
| _projectObject three.js:3851:67866 | 15 | 0.5 |
| _removeInactiveBinding three.js:5:73056 | 14 | 0.4 |
| setVertexBuffer (native):0:0 | 13 | 0.4 |
| _renderObjectDirect three.js:3851:73474 | 13 | 0.4 |
| (anonymous) three.js:3825:28488 | 12 | 0.4 |
| _bindAction three.js:5:69970 | 12 | 0.4 |
| t._update main.js:2:1840 | 12 | 0.4 |
| updateAttributes three.js:3845:83749 | 11 | 0.3 |
| getForRender three.js:3845:90247 | 11 | 0.3 |
| getMaterialCacheKey three.js:3845:78067 | 10 | 0.3 |
| get needsGeometryUpdate three.js:3845:78884 | 10 | 0.3 |
| updateNumber three.js:3851:77777 | 10 | 0.3 |
| (idle) (native):0:0 | 9 | 0.3 |
| get value three.js:3839:3913 | 8 | 0.3 |
| computeBoundingSphere three.js:1:100334 | 8 | 0.2 |
| updateAttribute three.js:3845:84078 | 7 | 0.2 |
| colorCrowd creatorUi.js:487:27408 | 7 | 0.2 |
| _getNodeChildren three.js:3845:10532 | 6 | 0.2 |
| Ic three.js:3825:19 | 6 | 0.2 |
| Cr creatorUi.js:1:29093 | 6 | 0.2 |
| traverse three.js:1:60746 | 5 | 0.2 |
| draw three.js:4360:28070 | 5 | 0.2 |
| get three.js:4027:3560 | 5 | 0.2 |

shaders:
```
shaders: 85 built in warm-up, 5 after, worst block 10 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 2× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
