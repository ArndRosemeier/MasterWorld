
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
| far folk | 1 | 1 | 1 | 0 | 3388 |
| townsfolk | 27 | 394 | 65 | 394 | 3572069 |
| flora | 1 | 70 | 52 | 0 | 147912 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 11.6 | 15.3 | 11.9 | 362 | 0 |  |
| without town | 11.2 | 16.1 | 11.9 | 348 | 0 | 0.4 |
| without volumes | 11.6 | 14.7 | 11.9 | 366 | 0 | 0.0 |
| without terrain | 9.5 | 12.8 | 9.8 | 283 | 0 | 2.3 |
| without sky | 12.0 | 15.1 | 12.1 | 374 | 0 | 0.0 |
| without sea | 12.3 | 15.4 | 12.3 | 376 | 0 | 0.1 |
| without grass | 12.4 | 26.7 | 12.8 | 379 | 0 | 0.1 |
| without hero | 12.5 | 15.8 | 12.5 | 385 | 0 | 0.1 |
| without horse | 11.8 | 15.0 | 11.9 | 365 | 0 | 0.8 |
| without cow | 12.4 | 15.7 | 12.4 | 385 | 0 | 0.1 |
| without far folk | 12.4 | 15.9 | 12.6 | 390 | 0 | 0.2 |
| without townsfolk | 7.7 | 10.7 | 7.6 | 241 | 0 | 5.1 |
| without flora | 11.5 | 14.6 | 11.2 | 306 | 0 | 1.3 |
| without sun shadow redraw | 10.1 | 12.3 | 8.5 | 395 | 0 | 2.6 |
| nothing (empty scene, post chain only) | 3.5 | 5.5 | 2.8 | 29 | 0 | 9.1 |

townsfolk over 5 s: 4 dressings, freed {"hidden":0,"ranked":4,"far":0}; updateHiddenSkin 23× 60 ms: 11× other -> level 2, 4× applyShape -> level 2, 4× other -> level 0, 4× other -> level 1

CPU profile, 3 s (3308 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2035 | 61.5 |
| (native) | 884 | 26.7 |
| main.js | 234 | 7.1 |
| creatorUi.js | 140 | 4.2 |
| src.js | 14 | 0.4 |
| art.js | 2 | 0.1 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 495 | 15.0 |
| multiplyMatrices three.js:1:47098 | 325 | 9.8 |
| updateMatrixWorld three.js:1:61326 | 215 | 6.5 |
| writeBuffer (native):0:0 | 138 | 4.2 |
| updateForRender three.js:3851:15750 | 126 | 3.8 |
| setVertexBuffer (native):0:0 | 111 | 3.3 |
| update three.js:3851:77218 | 103 | 3.1 |
| get three.js:3845:80156 | 102 | 3.1 |
| _update three.js:3845:95054 | 100 | 3.0 |
| t._update main.js:2:2366 | 76 | 2.3 |
| _projectObject three.js:3851:67866 | 59 | 1.8 |
| _renderObjectDirect three.js:3851:73474 | 58 | 1.7 |
| update three.js:3839:26984 | 57 | 1.7 |
| a._renderObjectDirect main.js:2:1539 | 56 | 1.7 |
| updateAttributes three.js:3845:83749 | 56 | 1.7 |
| updateHiddenSkin creatorUi.js:487:23701 | 50 | 1.5 |
| getMaterialCacheKey three.js:3845:78067 | 45 | 1.4 |
| _getNodeChildren three.js:3845:10532 | 44 | 1.3 |
| _draw three.js:4360:26376 | 41 | 1.3 |
| updateAttribute three.js:3845:84078 | 36 | 1.1 |
| needsRenderUpdate three.js:4360:29845 | 36 | 1.1 |
| update three.js:3839:9452 | 35 | 1.1 |
| setBindGroup (native):0:0 | 34 | 1.0 |
| (garbage collector) (native):0:0 | 34 | 1.0 |
| updateNumber three.js:3851:77777 | 32 | 1.0 |
| draw three.js:4360:28070 | 31 | 0.9 |
| get value three.js:3839:3913 | 31 | 0.9 |
| Ic three.js:3825:19 | 30 | 0.9 |
| apply three.js:5:55377 | 25 | 0.8 |
| slerpFlat three.js:1:10116 | 20 | 0.6 |
| fetch main.js:3:134582 | 19 | 0.6 |
| (anonymous) three.js:3825:28488 | 18 | 0.5 |
| updateMatrixWorld three.js:1:146835 | 18 | 0.5 |
| renderObject three.js:3851:71607 | 17 | 0.5 |
| update main.js:3:110002 | 17 | 0.5 |
| (anonymous) three.js:3839:19632 | 16 | 0.5 |
| updateForRender three.js:3845:83058 | 16 | 0.5 |
| setFromRotationMatrix three.js:1:53586 | 15 | 0.5 |
| intersectsObject three.js:1:154426 | 15 | 0.4 |
| setIndexBuffer (native):0:0 | 15 | 0.4 |
| submit (native):0:0 | 14 | 0.4 |
| (anonymous) creatorUi.js:487:35064 | 14 | 0.4 |
| getGeometryCacheKey three.js:3845:77641 | 13 | 0.4 |
| getRenderCacheKey three.js:4360:32209 | 13 | 0.4 |
| updateBefore three.js:3851:15106 | 13 | 0.4 |

shaders:
```
shaders: 79 built in warm-up, 10 after (8 drawn late), worst block 7 ms, 0 violations, 1 built again alike
built 4× alike (4 after warm-up, 7 ms): ShadowMaterial of Mesh flora
```

built after warm-up, by what:
- 4× ShadowMaterial of Mesh flora
- 3× MeshStandardNodeMaterial
- 1× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk

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
| far folk | 1 | 1 | 1 | 0 | 4004 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 30 | 498 | 77 | 498 | 4042936 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 13.2 | 29.6 | 12.9 | 394 | 0 |  |
| without town | 12.7 | 25.8 | 12.4 | 363 | 0 | 0.1 |
| without volumes | 12.0 | 15.5 | 12.3 | 373 | 1 | 0.3 |
| without terrain | 10.0 | 13.3 | 10.1 | 284 | 0 | 2.2 |
| without sky | 11.9 | 15.4 | 12.1 | 367 | 0 | -0.1 |
| without sea | 11.4 | 14.3 | 11.6 | 348 | 0 | -0.2 |
| without grass | 10.5 | 14.0 | 11.4 | 335 | 0 | 0.3 |
| without hero | 10.5 | 13.4 | 11.0 | 331 | 0 | 0.1 |
| without horse | 9.8 | 13.0 | 10.4 | 309 | 0 | 0.8 |
| without cow | 9.6 | 12.8 | 10.3 | 312 | 0 | 0.3 |
| without far folk | 9.5 | 12.6 | 10.2 | 308 | 0 | -0.3 |
| without flora | 7.6 | 10.9 | 8.4 | 219 | 0 | 1.6 |
| without townsfolk | 7.3 | 11.6 | 8.3 | 249 | 0 | 1.8 |
| without sun shadow redraw | 7.1 | 9.2 | 6.7 | 273 | 0 | 2.1 |
| nothing (empty scene, post chain only) | 2.8 | 4.6 | 2.9 | 29 | 0 | 6.3 |

townsfolk over 5 s: 0 dressings, freed {"hidden":1,"ranked":0,"far":1}; updateHiddenSkin 9× 29 ms: 2× auto level -> level 2, 2× auto level -> level 0, 2× other -> level 1, 2× other -> level 2, 1× auto level -> level 1

CPU profile, 3 s (3293 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2097 | 63.7 |
| (native) | 856 | 26.0 |
| main.js | 269 | 8.2 |
| creatorUi.js | 55 | 1.7 |
| src.js | 15 | 0.5 |
| packFetch.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 471 | 14.3 |
| updateMatrixWorld three.js:1:61326 | 272 | 8.3 |
| multiplyMatrices three.js:1:47098 | 266 | 8.1 |
| updateForRender three.js:3851:15750 | 146 | 4.4 |
| writeBuffer (native):0:0 | 135 | 4.1 |
| _update three.js:3845:95054 | 111 | 3.4 |
| update three.js:3851:77218 | 100 | 3.0 |
| setVertexBuffer (native):0:0 | 95 | 2.9 |
| t._update main.js:2:2366 | 74 | 2.2 |
| _renderObjectDirect three.js:3851:73474 | 65 | 2.0 |
| updateAttributes three.js:3845:83749 | 60 | 1.8 |
| a._renderObjectDirect main.js:2:1539 | 60 | 1.8 |
| getMaterialCacheKey three.js:3845:78067 | 57 | 1.7 |
| _getNodeChildren three.js:3845:10532 | 55 | 1.7 |
| draw three.js:4360:28070 | 53 | 1.6 |
| _projectObject three.js:3851:67866 | 51 | 1.5 |
| get needsGeometryUpdate three.js:3845:78884 | 46 | 1.4 |
| get value three.js:3839:3913 | 46 | 1.4 |
| update three.js:3839:26984 | 40 | 1.2 |
| get three.js:4027:3560 | 39 | 1.2 |
| updateNumber three.js:3851:77777 | 38 | 1.2 |
| Ic three.js:3825:19 | 36 | 1.1 |
| updateAttribute three.js:3845:84078 | 34 | 1.0 |
| _getWeakMap three.js:3845:73263 | 31 | 0.9 |
| update three.js:3839:9452 | 30 | 0.9 |
| needsRenderUpdate three.js:4360:29845 | 29 | 0.9 |
| updateMatrixWorld three.js:1:146835 | 28 | 0.8 |
| fetch main.js:3:134582 | 27 | 0.8 |
| setBindGroup (native):0:0 | 27 | 0.8 |
| update main.js:3:110002 | 26 | 0.8 |
| submit (native):0:0 | 25 | 0.8 |
| renderObject three.js:3851:71607 | 23 | 0.7 |
| intersectsObject three.js:1:154426 | 22 | 0.7 |
| (garbage collector) (native):0:0 | 21 | 0.6 |
| apply three.js:5:55377 | 20 | 0.6 |
| getGeometryCacheKey three.js:3845:77641 | 17 | 0.5 |
| updateHiddenSkin creatorUi.js:487:23701 | 16 | 0.5 |
| updateBinding three.js:4359:5655 | 16 | 0.5 |
| (anonymous) three.js:3825:28488 | 15 | 0.5 |
| getForRender three.js:3845:90247 | 15 | 0.5 |
| invert three.js:1:48739 | 15 | 0.4 |
| setIndexBuffer (native):0:0 | 14 | 0.4 |
| tend main.js:3:139550 | 14 | 0.4 |
| getDynamicCacheKey three.js:3845:79276 | 14 | 0.4 |
| beginRenderPass (native):0:0 | 14 | 0.4 |

shaders:
```
shaders: 79 built in warm-up, 11 after (9 drawn late), worst block 7 ms, 0 violations, 1 built again alike
built 4× alike (4 after warm-up, 7 ms): ShadowMaterial of Mesh flora
```

built after warm-up, by what:
- 4× ShadowMaterial of Mesh flora
- 3× MeshStandardNodeMaterial
- 1× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk

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
| everything | 10.4 | 22.7 | 11.0 | 316 | 0 |  |
| without town | 11.4 | 32.6 | 11.9 | 323 | 0 | -0.1 |
| without volumes | 12.6 | 16.3 | 12.8 | 361 | 0 | 0.2 |
| without terrain | 10.1 | 13.6 | 10.5 | 282 | 0 | 2.8 |
| without sky | 13.0 | 16.7 | 13.3 | 376 | 1 | -0.1 |
| without sea | 13.1 | 26.1 | 13.4 | 383 | 0 | 0.0 |
| without grass | 13.6 | 27.0 | 13.7 | 387 | 0 | -0.4 |
| without hero | 14.6 | 43.5 | 13.7 | 391 | 0 | 9.9 |
| without horse | 35.7 | 49.4 | 13.4 | 368 | 0 | 0.3 |
| without cow | 47.4 | 66.0 | 14.7 | 387 | 0 | -0.8 |
| without rain | 60.1 | 82.9 | 14.3 | 385 | 0 | 7.4 |
| without far folk | 65.1 | 92.1 | 14.1 | 386 | 0 | 3.0 |
| without flora | 57.1 | 68.4 | 12.9 | 309 | 0 | 1.8 |
| without townsfolk | 54.3 | 77.2 | 9.1 | 247 | 0 | 5.2 |
| without sun shadow redraw | 57.0 | 60.3 | 9.6 | 390 | 0 | 2.2 |
| nothing (empty scene, post chain only) | 49.4 | 66.3 | 4.0 | 30 | 0 | 10.2 |

townsfolk over 5 s: 1 dressings, freed {"hidden":0,"ranked":1,"far":0}; updateHiddenSkin 851× 2603 ms: 339× other -> level 2, 170× other -> level 1, 170× auto level -> level 1, 169× other -> level 0, 1× auto level -> level 2, 1× auto level -> level 0, 1× applyShape -> level 2

CPU profile, 3 s (3258 ms sampled):

| script | ms | % |
|---|---|---|
| creatorUi.js | 1868 | 57.4 |
| three.js | 841 | 25.8 |
| (native) | 457 | 14.0 |
| main.js | 88 | 2.7 |
| src.js | 3 | 0.1 |

| function (self time) | ms | % |
|---|---|---|
| updateHiddenSkin creatorUi.js:487:23701 | 1503 | 46.1 |
| (program) (native):0:0 | 259 | 7.9 |
| sampleInto creatorUi.js:1:23796 | 127 | 3.9 |
| multiplyMatrices three.js:1:47098 | 89 | 2.7 |
| writeBuffer (native):0:0 | 70 | 2.1 |
| updateMatrixWorld three.js:1:61326 | 60 | 1.8 |
| traverseVisible three.js:1:60841 | 57 | 1.7 |
| updateForRender three.js:3851:15750 | 42 | 1.3 |
| bake creatorUi.js:1:25156 | 41 | 1.3 |
| t._update main.js:2:2366 | 39 | 1.2 |
| br creatorUi.js:1:28008 | 37 | 1.1 |
| update three.js:3851:77218 | 33 | 1.0 |
| _update three.js:3845:95054 | 32 | 1.0 |
| xr creatorUi.js:1:28403 | 29 | 0.9 |
| update three.js:3839:26984 | 28 | 0.9 |
| setVertexBuffer (native):0:0 | 26 | 0.8 |
| (anonymous) creatorUi.js:1:25407 | 25 | 0.8 |
| (garbage collector) (native):0:0 | 23 | 0.7 |
| Pt three.js:1:1956 | 23 | 0.7 |
| _projectObject three.js:3851:67866 | 21 | 0.6 |
| createBuffer (native):0:0 | 18 | 0.5 |
| proto.updateHiddenSkin (native):10:37 | 17 | 0.5 |
| updateAttributes three.js:3845:83749 | 17 | 0.5 |
| get needsGeometryUpdate three.js:3845:78884 | 16 | 0.5 |
| draw three.js:4360:28070 | 16 | 0.5 |
| _removeInactiveBinding three.js:5:73056 | 14 | 0.4 |
| _renderObjectDirect three.js:3851:73474 | 14 | 0.4 |
| createAttribute three.js:4359:500 | 14 | 0.4 |
| a._renderObjectDirect main.js:2:1539 | 13 | 0.4 |
| get three.js:4027:3560 | 13 | 0.4 |
| getMaterialCacheKey three.js:3845:78067 | 12 | 0.4 |
| _getNodeChildren three.js:3845:10532 | 12 | 0.4 |
| updateNumber three.js:3851:77777 | 12 | 0.4 |
| update three.js:3839:9452 | 12 | 0.4 |
| needsRenderUpdate three.js:4360:29845 | 11 | 0.3 |
| get three.js:3845:81153 | 11 | 0.3 |
| _getWeakMap three.js:3845:73263 | 10 | 0.3 |
| get value three.js:3839:3913 | 10 | 0.3 |
| renderObject three.js:3851:71607 | 10 | 0.3 |
| apply three.js:5:55377 | 9 | 0.3 |
| Pn creatorUi.js:1:6320 | 8 | 0.2 |
| _bindAction three.js:5:69970 | 8 | 0.2 |
| (anonymous) three.js:3825:28488 | 7 | 0.2 |
| getForRender three.js:3845:90247 | 7 | 0.2 |
| submit (native):0:0 | 7 | 0.2 |

shaders:
```
shaders: 79 built in warm-up, 12 after (10 drawn late), worst block 7 ms, 0 violations, 1 built again alike
built 4× alike (4 after warm-up, 7 ms): ShadowMaterial of Mesh flora
```

built after warm-up, by what:
- 4× ShadowMaterial of Mesh flora
- 3× MeshStandardNodeMaterial
- 2× ShadowMaterial of SkinnedMesh beard<townsfolk
- 1× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk
