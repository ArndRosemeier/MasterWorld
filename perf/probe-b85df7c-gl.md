
## noon: ?title=0&day=0&gl&hour=12&weather=clear

settled in 4.4 s

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
| far folk | 1 | 1 | 1 | 0 | 3080 |
| townsfolk | 30 | 465 | 285 | 465 | 4008763 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 21.7 | 44.1 | 24.4 | 367 | 1 |  |
| without town | 21.0 | 41.3 | 22.8 | 360 | 0 | -0.6 |
| without volumes | 20.5 | 43.9 | 24.2 | 395 | 0 | 0.0 |
| without terrain | 17.8 | 38.1 | 20.1 | 320 | 0 | 3.6 |
| without sky | 20.2 | 44.5 | 24.0 | 402 | 0 | 0.7 |
| without sea | 19.7 | 44.1 | 24.9 | 411 | 0 | 0.8 |
| without grass | 20.2 | 45.7 | 25.1 | 406 | 0 | 1.1 |
| without hero | 20.7 | 43.6 | 25.0 | 413 | 0 | 1.0 |
| without horse | 22.1 | 44.5 | 24.4 | 399 | 0 | -1.5 |
| without flora | 22.8 | 42.7 | 23.1 | 376 | 0 | -0.8 |
| without far folk | 23.3 | 44.2 | 25.5 | 422 | 0 | 1.6 |
| without townsfolk | 14.3 | 20.7 | 14.8 | 197 | 0 | 11.9 |
| without sun shadow redraw | 18.4 | 32.1 | 16.0 | 370 | 0 | 4.7 |
| nothing (empty scene, post chain only) | 6.6 | 11.2 | 5.5 | 26 | 0 | 14.1 |

CPU profile, 3 s (3613 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2448 | 67.8 |
| (native) | 920 | 25.5 |
| main.js | 152 | 4.2 |
| creatorUi.js | 87 | 2.4 |
| src.js | 5 | 0.1 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 653 | 18.1 |
| multiplyMatrices three.js:7215:18 | 280 | 7.8 |
| updateMatrixWorld three.js:9009:19 | 224 | 6.2 |
| updateForRender three.js:69906:17 | 184 | 5.1 |
| update three.js:38946:8 | 167 | 4.6 |
| getMaterialCacheKey three.js:50569:21 | 166 | 4.6 |
| update three.js:74992:8 | 135 | 3.7 |
| _renderObjectDirect three.js:74463:21 | 104 | 2.9 |
| get three.js:50764:5 | 99 | 2.7 |
| get value three.js:38526:11 | 94 | 2.6 |
| _projectObject three.js:74173:16 | 80 | 2.2 |
| draw three.js:80654:6 | 64 | 1.8 |
| updateNumber three.js:75027:14 | 59 | 1.6 |
| bindings._update main.js:293:29 | 56 | 1.5 |
| _update three.js:52288:9 | 55 | 1.5 |
| update three.js:40816:8 | 54 | 1.5 |
| bufferSubData (native):0:0 | 54 | 1.5 |
| bindBuffer (native):0:0 | 49 | 1.4 |
| updateAttributes three.js:51148:18 | 49 | 1.4 |
| cyrb53 three.js:30671:16 | 42 | 1.2 |
| bindTexture (native):0:0 | 36 | 1.0 |
| bufferData (native):0:0 | 32 | 0.9 |
| bindBufferBase three.js:78406:16 | 30 | 0.8 |
| (anonymous) three.js:33611:25 | 29 | 0.8 |
| updateAttribute three.js:51163:17 | 29 | 0.8 |
| updateMatrixWorld three.js:16328:19 | 28 | 0.8 |
| _bindUniforms three.js:81564:15 | 28 | 0.8 |
| renderObject three.js:74381:14 | 26 | 0.7 |
| apply three.js:26975:7 | 25 | 0.7 |
| updateHiddenSkin creatorUi.js:4244:18 | 21 | 0.6 |
| fetch main.js:8982:7 | 20 | 0.6 |
| updateReference three.js:38571:17 | 20 | 0.5 |
| getGeometryCacheKey three.js:50540:21 | 19 | 0.5 |
| updateBinding three.js:81165:15 | 19 | 0.5 |
| (anonymous) creatorUi.js:4736:17 | 19 | 0.5 |
| bindVertexArray (native):0:0 | 19 | 0.5 |
| invert three.js:7365:8 | 18 | 0.5 |
| (anonymous) three.js:40027:81 | 15 | 0.4 |
| (garbage collector) (native):0:0 | 15 | 0.4 |
| bindBufferBase (native):0:0 | 15 | 0.4 |
| _update three.js:27854:9 | 14 | 0.4 |
| getDynamicCacheKey three.js:50654:20 | 14 | 0.4 |
| activeTexture (native):0:0 | 13 | 0.4 |
| (anonymous) three.js:42676:19 | 13 | 0.4 |
| follow main.js:3557:8 | 13 | 0.3 |

shaders:
```
shaders: 97 built in warm-up, 12 after, worst block 16 ms, 0 violations, 0 built again alike
```

built after warm-up, by what:
- 5× MeshStandardNodeMaterial
- 3× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 2× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
