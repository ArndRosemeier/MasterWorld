
## noon: ?title=0&day=0&gl&hour=12&weather=clear

settled in 6.2 s

| part | objects | meshes | casters | skinned | triangles |
|---|---|---|---|---|---|
| town | 1 | 34 | 34 | 0 | 71910 |
| volumes | 1 | 1 | 1 | 0 | 19845 |
| terrain | 270 | 270 | 270 | 0 | 2350080 |
| sky | 1 | 1 | 0 | 0 | 12 |
| sea | 1 | 1 | 0 | 0 | 57408 |
| grass | 1 | 2 | 0 | 0 | 10752 |
| hero | 1 | 14 | 14 | 13 | 81843 |
| horse | 4 | 22 | 18 | 22 | 610476 |
| flora | 1 | 70 | 52 | 0 | 147912 |
| far folk | 1 | 1 | 1 | 0 | 3080 |
| townsfolk | 30 | 461 | 371 | 461 | 4030735 |

| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |
|---|---|---|---|---|---|---|
| everything | 18.0 | 34.1 | 22.8 | 435 | 0 |  |
| without town | 17.7 | 36.1 | 22.3 | 428 | 0 | 0.3 |
| without volumes | 18.5 | 35.1 | 23.4 | 459 | 0 | -0.3 |
| without terrain | 14.8 | 18.0 | 18.7 | 388 | 0 | 3.6 |
| without sky | 18.2 | 26.9 | 22.8 | 468 | 0 | 0.3 |
| without sea | 18.3 | 23.7 | 23.0 | 473 | 0 | 0.2 |
| without grass | 18.6 | 33.8 | 23.5 | 473 | 0 | -0.1 |
| without hero | 19.1 | 37.1 | 24.2 | 478 | 0 | 0.3 |
| without horse | 18.3 | 37.5 | 23.2 | 457 | 0 | 1.3 |
| without flora | 17.8 | 20.6 | 22.2 | 433 | 0 | 1.5 |
| without far folk | 19.6 | 38.9 | 25.1 | 492 | 0 | 0.2 |
| without townsfolk | 9.6 | 12.2 | 11.4 | 209 | 0 | 10.1 |
| without sun shadow redraw | 12.4 | 14.1 | 10.9 | 387 | 0 | 7.2 |
| nothing (empty scene, post chain only) | 4.0 | 5.4 | 4.2 | 35 | 0 | 15.8 |

CPU profile, 3 s (3493 ms sampled):

| script | ms | % |
|---|---|---|
| three.js | 2500 | 71.6 |
| (native) | 813 | 23.3 |
| main.js | 122 | 3.5 |
| creatorUi.js | 45 | 1.3 |
| src.js | 13 | 0.4 |
| release.js | 1 | 0.0 |

| function (self time) | ms | % |
|---|---|---|
| (program) (native):0:0 | 567 | 16.2 |
| getMaterialCacheKey three.js:50569:21 | 274 | 7.8 |
| multiplyMatrices three.js:7215:18 | 232 | 6.6 |
| updateForRender three.js:69906:17 | 212 | 6.1 |
| update three.js:38946:8 | 175 | 5.0 |
| updateMatrixWorld three.js:9009:19 | 173 | 5.0 |
| update three.js:74992:8 | 149 | 4.3 |
| get three.js:50764:5 | 117 | 3.4 |
| _renderObjectDirect three.js:74463:21 | 116 | 3.3 |
| get value three.js:38526:11 | 93 | 2.7 |
| _projectObject three.js:74173:16 | 70 | 2.0 |
| cyrb53 three.js:30671:16 | 63 | 1.8 |
| bufferSubData (native):0:0 | 61 | 1.7 |
| updateValue three.js:40823:13 | 57 | 1.6 |
| _update three.js:52288:9 | 56 | 1.6 |
| draw three.js:80654:6 | 55 | 1.6 |
| bindings._update main.js:293:29 | 53 | 1.5 |
| updateAttributes three.js:51148:18 | 40 | 1.1 |
| updateNumber three.js:75027:14 | 38 | 1.1 |
| _bindUniforms three.js:81564:15 | 37 | 1.1 |
| bindBuffer (native):0:0 | 37 | 1.1 |
| renderObject three.js:74381:14 | 34 | 1.0 |
| updateReference three.js:38571:17 | 33 | 1.0 |
| bufferData (native):0:0 | 33 | 0.9 |
| bindVertexArray (native):0:0 | 31 | 0.9 |
| apply three.js:26975:7 | 30 | 0.9 |
| updateAttribute three.js:51163:17 | 28 | 0.8 |
| updateMatrixWorld three.js:16328:19 | 26 | 0.7 |
| getGeometryCacheKey three.js:50540:21 | 24 | 0.7 |
| (garbage collector) (native):0:0 | 24 | 0.7 |
| (anonymous) three.js:33611:25 | 21 | 0.6 |
| updateVector3 three.js:75068:15 | 18 | 0.5 |
| invert three.js:7365:8 | 17 | 0.5 |
| bindBufferBase (native):0:0 | 17 | 0.5 |
| bindTexture (native):0:0 | 15 | 0.4 |
| bindBufferBase three.js:78406:16 | 15 | 0.4 |
| update three.js:40816:8 | 15 | 0.4 |
| updateMatrix3 three.js:75134:15 | 13 | 0.4 |
| getDrawParameters three.js:50497:19 | 13 | 0.4 |
| updateVector4 three.js:75090:15 | 13 | 0.4 |
| updateBefore three.js:69855:14 | 12 | 0.3 |
| update three.js:33437:8 | 11 | 0.3 |
| updateBinding three.js:81165:15 | 10 | 0.3 |
| update main.js:7478:8 | 10 | 0.3 |
| bindTexture three.js:78371:13 | 9 | 0.3 |

shaders:
```
shaders: 103 built in warm-up, 22 after, worst block 15 ms, 1 violations, 0 built again alike
run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 1 ms ended (minimum 2 ms)
```

built after warm-up, by what:
- 12× ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]
- 6× MeshStandardNodeMaterial
- 2× MeshPhysicalNodeMaterial
- 1× ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]
- 1× ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]
