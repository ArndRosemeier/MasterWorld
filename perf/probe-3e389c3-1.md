
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
| everything | 9.8 | 12.0 | 9.8 | 362 | 0 |  |
| without town | 9.4 | 11.5 | 9.5 | 348 | 0 | 0.3 |
| without volumes | 9.7 | 12.0 | 9.9 | 367 | 0 | 0.1 |
| without terrain | 7.9 | 9.6 | 8.0 | 284 | 0 | 2.1 |
| without sky | 10.2 | 12.2 | 10.1 | 375 | 0 | 0.1 |
| without sea | 10.3 | 13.0 | 10.3 | 376 | 0 | 0.2 |
| without grass | 11.1 | 27.0 | 12.6 | 380 | 0 | 0.4 |
| without hero | 12.6 | 28.5 | 13.8 | 385 | 0 | 4.0 |
| without horse | 12.1 | 15.8 | 12.1 | 365 | 0 | 4.1 |
| without cow | 12.1 | 16.6 | 12.3 | 386 | 0 | 0.1 |
| without far folk | 13.2 | 31.6 | 15.4 | 391 | 0 | -0.3 |
| without townsfolk | 10.5 | 26.6 | 11.0 | 242 | 0 | 2.2 |
| without flora | 10.8 | 29.0 | 12.2 | 306 | 0 | 1.5 |
| without sun shadow redraw | 10.2 | 19.1 | 9.5 | 396 | 0 | 2.6 |
| nothing (empty scene, post chain only) | 5.2 | 9.1 | 4.3 | 29 | 0 | 8.4 |

CPU profile, 3 s (3324 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2097 | 63.1 |
| (native) | 885 | 26.6 |
| main.js | 205 | 6.2 |
| creatorUi.js | 123 | 3.7 |
| src.js | 13 | 0.4 |
| math.js | 1 | 0.0 |
| art.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 493 | 14.8 |
| multiplyMatrices three.js:1:47098 | 324 | 9.7 |
| updateMatrixWorld three.js:1:61326 | 226 | 6.8 |
| writeBuffer (native):0:0 | 150 | 4.5 |
| updateForRender three.js:3851:15750 | 149 | 4.5 |
| update three.js:3851:77218 | 113 | 3.4 |
| _renderObjectDirect three.js:3851:73474 | 110 | 3.3 |
| setVertexBuffer (native):0:0 | 107 | 3.2 |
| t._update main.js:2:1840 | 89 | 2.7 |
| _update three.js:3845:95054 | 86 | 2.6 |
| get three.js:3845:80156 | 80 | 2.4 |
| _projectObject three.js:3851:67866 | 69 | 2.1 |
| update three.js:3839:26984 | 60 | 1.8 |
| updateAttributes three.js:3845:83749 | 52 | 1.6 |
| updateAttribute three.js:3845:84078 | 51 | 1.5 |
| _draw three.js:4360:26376 | 45 | 1.3 |
| _getNodeChildren three.js:3845:10532 | 43 | 1.3 |
| getMaterialCacheKey three.js:3845:78067 | 40 | 1.2 |
| draw three.js:4360:28070 | 38 | 1.1 |
| update three.js:3839:9452 | 35 | 1.1 |
| updateHiddenSkin creatorUi.js:487:23701 | 34 | 1.0 |
| updateNumber three.js:3851:77777 | 34 | 1.0 |
| get value three.js:3839:3913 | 34 | 1.0 |
| needsRenderUpdate three.js:4360:29845 | 31 | 0.9 |
| (garbage collector) (native):0:0 | 29 | 0.9 |
| renderObject three.js:3851:71607 | 29 | 0.9 |
| Ic three.js:3825:19 | 28 | 0.8 |
| apply three.js:5:55377 | 27 | 0.8 |
| setBindGroup (native):0:0 | 25 | 0.7 |
| slerpFlat three.js:1:10116 | 24 | 0.7 |
| updateMatrixWorld three.js:1:146835 | 24 | 0.7 |
| (anonymous) three.js:3825:28488 | 24 | 0.7 |
| getForRender three.js:3845:90247 | 20 | 0.6 |
| fetch main.js:3:134582 | 19 | 0.6 |
| setIndexBuffer (native):0:0 | 19 | 0.6 |
| update main.js:3:110002 | 18 | 0.5 |
| intersectsObject three.js:1:154426 | 15 | 0.5 |
| invert three.js:1:48739 | 15 | 0.5 |
| submit (native):0:0 | 15 | 0.4 |
| updateBinding three.js:4359:5655 | 15 | 0.4 |
| (anonymous) creatorUi.js:487:35064 | 14 | 0.4 |
| getGeometryCacheKey three.js:3845:77641 | 14 | 0.4 |
| updateVector3 three.js:3851:78181 | 13 | 0.4 |
| update three.js:5:74616 | 12 | 0.4 |
| updateBefore three.js:3851:15106 | 10 | 0.3 |

shaders:
```
shaders: 86 built in warm-up, 3 after, worst block 9 ms, 1 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 4 ms after a build of 17 ms ended (minimum 33 ms): "MeshStandardNodeMaterial" (node-async)
```

built after warm-up, by what:
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]

events around breaches:
```
node-async t=15810.4 16.5 ms MeshStandardNodeMaterial
gpu-module t=15827.4 0.0 ms createShaderModule
gpu-module t=15827.4 0.1 ms createShaderModule
node-sync t=15831.2 0.8 ms ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
gpu-module t=15832.1 0.0 ms createShaderModule
gpu-module t=15832.1 0.0 ms createShaderModule
gpu-pipeline-async t=15827.6 86.6 ms pipeline
gpu-pipeline-async t=15832.1 82.1 ms pipeline
```

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
| everything | 12.9 | 43.1 | 14.0 | 398 | 0 |  |
| without town | 15.4 | 41.5 | 16.2 | 374 | 0 | -2.2 |
| without volumes | 17.7 | 32.8 | 18.3 | 376 | 0 | -4.8 |
| without terrain | 10.6 | 15.6 | 11.1 | 281 | 0 | 1.3 |
| without sky | 11.9 | 29.7 | 13.4 | 364 | 0 | -0.1 |
| without sea | 11.8 | 31.1 | 15.7 | 350 | 0 | -0.4 |
| without grass | 9.5 | 12.8 | 10.2 | 333 | 0 | 1.4 |
| without hero | 9.6 | 13.3 | 10.5 | 333 | 0 | 0.2 |
| without horse | 7.9 | 9.9 | 8.1 | 302 | 1 | 0.3 |
| without cow | 8.1 | 11.5 | 8.9 | 309 | 0 | -0.0 |
| without far folk | 8.1 | 11.3 | 9.5 | 300 | 0 | 0.1 |
| without flora | 7.8 | 11.6 | 8.5 | 213 | 0 | 0.3 |
| without townsfolk | 7.6 | 12.2 | 8.8 | 248 | 0 | 0.6 |
| without sun shadow redraw | 7.8 | 9.1 | 6.9 | 265 | 0 | 0.5 |
| nothing (empty scene, post chain only) | 2.6 | 3.5 | 2.6 | 30 | 0 | 5.1 |

CPU profile, 3 s (3287 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2146 | 65.3 |
| (native) | 919 | 28.0 |
| main.js | 185 | 5.6 |
| creatorUi.js | 26 | 0.8 |
| src.js | 11 | 0.3 |
| math.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 486 | 14.8 |
| multiplyMatrices three.js:1:47098 | 259 | 7.9 |
| updateMatrixWorld three.js:1:61326 | 228 | 6.9 |
| updateForRender three.js:3851:15750 | 188 | 5.7 |
| _update three.js:3845:95054 | 123 | 3.8 |
| writeBuffer (native):0:0 | 120 | 3.7 |
| _renderObjectDirect three.js:3851:73474 | 114 | 3.5 |
| update three.js:3851:77218 | 114 | 3.5 |
| getMaterialCacheKey three.js:3845:78067 | 83 | 2.5 |
| setVertexBuffer (native):0:0 | 80 | 2.4 |
| setPipeline (native):0:0 | 71 | 2.2 |
| update three.js:3839:9452 | 67 | 2.0 |
| _getNodeChildren three.js:3845:10532 | 64 | 1.9 |
| t._update main.js:2:1840 | 64 | 1.9 |
| get value three.js:3839:3913 | 56 | 1.7 |
| update three.js:3839:26984 | 48 | 1.5 |
| _projectObject three.js:3851:67866 | 45 | 1.4 |
| Ic three.js:3825:19 | 41 | 1.2 |
| tend main.js:3:139550 | 39 | 1.2 |
| fetch main.js:3:134582 | 39 | 1.2 |
| getForRender three.js:3845:90247 | 39 | 1.2 |
| updateAttributes three.js:3845:83749 | 37 | 1.1 |
| submit (native):0:0 | 36 | 1.1 |
| draw three.js:4360:28070 | 33 | 1.0 |
| (garbage collector) (native):0:0 | 33 | 1.0 |
| get needsGeometryUpdate three.js:3845:78884 | 30 | 0.9 |
| updateNumber three.js:3851:77777 | 30 | 0.9 |
| _getWeakMap three.js:3845:73263 | 28 | 0.9 |
| getGeometryCacheKey three.js:3845:77641 | 26 | 0.8 |
| setBindGroup (native):0:0 | 25 | 0.8 |
| get three.js:4027:3560 | 25 | 0.8 |
| needsRenderUpdate three.js:4360:29845 | 23 | 0.7 |
| updateAttribute three.js:3845:84078 | 23 | 0.7 |
| getCacheKey three.js:3845:79578 | 22 | 0.7 |
| updateMatrixWorld three.js:1:146835 | 22 | 0.7 |
| renderObject three.js:3851:71607 | 20 | 0.6 |
| updateReference three.js:3839:4181 | 15 | 0.5 |
| (anonymous) three.js:3825:28488 | 15 | 0.5 |
| updateBefore three.js:3851:15106 | 15 | 0.5 |
| intersectsObject three.js:1:154426 | 15 | 0.4 |
| (idle) (native):0:0 | 13 | 0.4 |
| invert three.js:1:48739 | 13 | 0.4 |
| getCacheKey three.js:3825:5241 | 12 | 0.4 |
| updateBinding three.js:4359:5655 | 12 | 0.4 |
| createCommandEncoder (native):0:0 | 11 | 0.3 |

shaders:
```
shaders: 86 built in warm-up, 4 after, worst block 9 ms, 1 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 4 ms after a build of 17 ms ended (minimum 33 ms): "MeshStandardNodeMaterial" (node-async)
```

built after warm-up, by what:
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

events around breaches:
```
node-async t=15810.4 16.5 ms MeshStandardNodeMaterial
gpu-module t=15827.4 0.0 ms createShaderModule
gpu-module t=15827.4 0.1 ms createShaderModule
node-sync t=15831.2 0.8 ms ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
gpu-module t=15832.1 0.0 ms createShaderModule
gpu-module t=15832.1 0.0 ms createShaderModule
gpu-pipeline-async t=15827.6 86.6 ms pipeline
gpu-pipeline-async t=15832.1 82.1 ms pipeline
```

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
| far folk | 1 | 1 | 1 | 0 | 12628 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| townsfolk | 10 | 208 | 102 | 208 | 1345792 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 8.5 | 13.2 | 8.9 | 311 | 0 |  |
| without town | 10.0 | 22.5 | 10.1 | 324 | 0 | -0.4 |
| without volumes | 11.6 | 30.7 | 13.4 | 365 | 0 | -0.5 |
| without terrain | 8.8 | 10.9 | 8.7 | 290 | 0 | 2.6 |
| without sky | 11.1 | 14.0 | 10.9 | 373 | 1 | 0.2 |
| without sea | 11.3 | 15.0 | 11.6 | 382 | 0 | -0.1 |
| without grass | 11.3 | 14.0 | 11.1 | 385 | 0 | -0.1 |
| without hero | 11.6 | 45.9 | 11.5 | 389 | 0 | 10.2 |
| without horse | 34.6 | 55.6 | 14.2 | 368 | 0 | 1.9 |
| without cow | 46.3 | 78.1 | 17.1 | 387 | 0 | 13.4 |
| without rain | 106.7 | 140.4 | 23.5 | 385 | 0 | -12.6 |
| without far folk | 93.5 | 140.4 | 21.4 | 384 | 0 | 0.2 |
| without flora | 75.9 | 79.6 | 15.9 | 307 | 0 | 2.0 |
| without townsfolk | 63.1 | 92.6 | 11.7 | 246 | 0 | 14.7 |
| without sun shadow redraw | 93.3 | 124.8 | 15.6 | 387 | 0 | -15.4 |
| nothing (empty scene, post chain only) | 61.7 | 92.4 | 4.6 | 31 | 0 | 17.1 |

CPU profile, 3 s (3336 ms sampled):

| script | ms | % |
|---|---|---|
| creatorUi.js | 1974 | 59.2 |
| three.js | 802 | 24.1 |
| (native) | 503 | 15.1 |
| main.js | 51 | 1.5 |
| src.js | 6 | 0.2 |

| function (self time) | ms | % |
|---|---|---|
| updateHiddenSkin creatorUi.js:487:23701 | 1620 | 48.6 |
| (program) (native):0:0 | 337 | 10.1 |
| sampleInto creatorUi.js:1:23796 | 119 | 3.6 |
| multiplyMatrices three.js:1:47098 | 80 | 2.4 |
| traverseVisible three.js:1:60841 | 57 | 1.7 |
| updateForRender three.js:3851:15750 | 55 | 1.6 |
| writeBuffer (native):0:0 | 53 | 1.6 |
| updateMatrixWorld three.js:1:61326 | 45 | 1.3 |
| update three.js:3851:77218 | 44 | 1.3 |
| br creatorUi.js:1:28008 | 40 | 1.2 |
| bake creatorUi.js:1:25156 | 38 | 1.2 |
| Pt three.js:1:1956 | 33 | 1.0 |
| _update three.js:3845:95054 | 31 | 0.9 |
| (anonymous) creatorUi.js:1:25407 | 30 | 0.9 |
| _renderObjectDirect three.js:3851:73474 | 27 | 0.8 |
| xr creatorUi.js:1:28403 | 27 | 0.8 |
| (garbage collector) (native):0:0 | 26 | 0.8 |
| setVertexBuffer (native):0:0 | 20 | 0.6 |
| createAttribute three.js:4359:500 | 18 | 0.5 |
| t._update main.js:2:1840 | 18 | 0.5 |
| getMaterialCacheKey three.js:3845:78067 | 17 | 0.5 |
| _projectObject three.js:3851:67866 | 17 | 0.5 |
| updateVisibility creatorUi.js:487:14293 | 17 | 0.5 |
| createBuffer (native):0:0 | 16 | 0.5 |
| _removeInactiveBinding three.js:5:73056 | 16 | 0.5 |
| updateNumber three.js:3851:77777 | 15 | 0.4 |
| updateAttributes three.js:3845:83749 | 15 | 0.4 |
| update three.js:3839:26984 | 14 | 0.4 |
| sample creatorUi.js:1:23359 | 14 | 0.4 |
| _bindAction three.js:5:69970 | 13 | 0.4 |
| _getNodeChildren three.js:3845:10532 | 12 | 0.4 |
| updateBinding three.js:4359:5655 | 12 | 0.3 |
| needsRenderUpdate three.js:4360:29845 | 11 | 0.3 |
| get three.js:4027:3560 | 10 | 0.3 |
| (idle) (native):0:0 | 9 | 0.3 |
| get three.js:3845:81153 | 9 | 0.3 |
| get needsGeometryUpdate three.js:3845:78884 | 9 | 0.3 |
| draw three.js:4360:28070 | 9 | 0.3 |
| yield (native):0:0 | 9 | 0.3 |
| update three.js:3839:9452 | 8 | 0.3 |
| setFromBufferAttribute three.js:1:83153 | 8 | 0.2 |
| (anonymous) three.js:3825:28488 | 7 | 0.2 |
| setBindGroup (native):0:0 | 7 | 0.2 |
| updateMatrixWorld three.js:1:146835 | 7 | 0.2 |
| update main.js:3:110002 | 6 | 0.2 |

shaders:
```
shaders: 86 built in warm-up, 5 after, worst block 9 ms, 1 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 4 ms after a build of 17 ms ended (minimum 33 ms): "MeshStandardNodeMaterial" (node-async)
```

built after warm-up, by what:
- 2× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× MeshStandardNodeMaterial
- 1× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]

events around breaches:
```
node-async t=15810.4 16.5 ms MeshStandardNodeMaterial
gpu-module t=15827.4 0.0 ms createShaderModule
gpu-module t=15827.4 0.1 ms createShaderModule
node-sync t=15831.2 0.8 ms ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
gpu-module t=15832.1 0.0 ms createShaderModule
gpu-module t=15832.1 0.0 ms createShaderModule
gpu-pipeline-async t=15827.6 86.6 ms pipeline
gpu-pipeline-async t=15832.1 82.1 ms pipeline
```
