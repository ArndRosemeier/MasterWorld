
## noon: ?title=0&day=0&hour=12&weather=clear

settled in 2.8 s

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
| far folk | 1 | 1 | 1 | 0 | 2926 |
| townsfolk | 30 | 465 | 285 | 465 | 4008763 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 17.8 | 38.1 | 21.5 | 411 | 1 |  |
| without town | 17.3 | 37.9 | 20.8 | 400 | 0 | 0.1 |
| without volumes | 20.0 | 39.4 | 21.6 | 425 | 0 | -3.2 |
| without terrain | 16.0 | 35.8 | 19.2 | 350 | 0 | 1.9 |
| without sky | 17.9 | 39.2 | 22.5 | 451 | 0 | 2.2 |
| without sea | 17.1 | 38.7 | 22.0 | 444 | 0 | 1.7 |
| without grass | 20.7 | 39.4 | 22.5 | 454 | 0 | -1.7 |
| without hero | 21.2 | 38.2 | 22.4 | 452 | 0 | -1.6 |
| without horse | 19.1 | 38.5 | 21.2 | 433 | 0 | 1.2 |
| without flora | 17.8 | 38.9 | 21.1 | 371 | 0 | 1.6 |
| without far folk | 21.3 | 38.9 | 23.1 | 462 | 0 | -3.9 |
| without townsfolk | 13.4 | 19.1 | 13.3 | 237 | 0 | 4.5 |
| without sun shadow redraw | 16.1 | 20.0 | 13.2 | 397 | 0 | 2.0 |
| nothing (empty scene, post chain only) | 5.7 | 10.5 | 5.1 | 23 | 0 | 12.4 |

CPU profile, 3 s (3605 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2196 | 60.9 |
| (native) | 1071 | 29.7 |
| main.js | 197 | 5.5 |
| creatorUi.js | 122 | 3.4 |
| src.js | 19 | 0.5 |
| release.js | 0 | 0.0 |
| index.js | 0 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 702 | 19.5 |
| multiplyMatrices three.js:7215:18 | 274 | 7.6 |
| updateMatrixWorld three.js:9009:19 | 248 | 6.9 |
| writeBuffer (native):0:0 | 142 | 3.9 |
| update three.js:74992:8 | 133 | 3.7 |
| _update three.js:52288:9 | 122 | 3.4 |
| updateForRender three.js:69906:17 | 120 | 3.3 |
| _projectObject three.js:74173:16 | 117 | 3.3 |
| getMaterialCacheKey three.js:50569:21 | 112 | 3.1 |
| get three.js:50764:5 | 104 | 2.9 |
| bindings._update main.js:293:29 | 90 | 2.5 |
| updateValue three.js:40823:13 | 86 | 2.4 |
| setVertexBuffer (native):0:0 | 85 | 2.4 |
| _renderObjectDirect three.js:74463:21 | 76 | 2.1 |
| updateAttributes three.js:51148:18 | 68 | 1.9 |
| needsRenderUpdate three.js:89705:19 | 49 | 1.4 |
| updateHiddenSkin creatorUi.js:4244:18 | 33 | 0.9 |
| updateAttribute three.js:51163:17 | 32 | 0.9 |
| apply three.js:26975:7 | 31 | 0.9 |
| _draw three.js:89532:7 | 31 | 0.9 |
| updateNumber three.js:75027:14 | 31 | 0.9 |
| draw three.js:89621:6 | 29 | 0.8 |
| cyrb53 three.js:30671:16 | 28 | 0.8 |
| updateMatrixWorld three.js:16328:19 | 27 | 0.8 |
| invert three.js:7365:8 | 26 | 0.7 |
| get value three.js:38526:11 | 26 | 0.7 |
| update three.js:38946:8 | 25 | 0.7 |
| setBindGroup (native):0:0 | 25 | 0.7 |
| updateBinding three.js:87068:15 | 25 | 0.7 |
| (garbage collector) (native):0:0 | 25 | 0.7 |
| submit (native):0:0 | 24 | 0.7 |
| (anonymous) creatorUi.js:4736:17 | 23 | 0.6 |
| renderObject three.js:74381:14 | 22 | 0.6 |
| update main.js:7515:8 | 21 | 0.6 |
| update three.js:40816:8 | 19 | 0.5 |
| n2 src.js:237:4 | 18 | 0.5 |
| setPipeline (native):0:0 | 16 | 0.5 |
| setIndexBuffer (native):0:0 | 16 | 0.4 |
| getRenderCacheKey three.js:89761:19 | 16 | 0.4 |
| trail main.js:2183:7 | 15 | 0.4 |
| slerpFlat three.js:2585:18 | 15 | 0.4 |
| _getChildren three.js:31284:14 | 15 | 0.4 |
| beginRenderPass (native):0:0 | 15 | 0.4 |
| (anonymous) three.js:33611:25 | 14 | 0.4 |
| fetch main.js:8982:7 | 13 | 0.4 |

shaders:
```
shaders: 98 built in warm-up, 11 after, worst block 14 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 4× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 3× MeshStandardNodeMaterial
- 2× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
