# Standard shots 2026-10-26 · 25f5dd5

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 198 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 15.5 | 114.6 | 4.1 | 82 + 24, 17 ms | over the 12 ms aim |
| [creator](02-creator.jpg) | 23.2 | 33.7 | 1.5 | 82 + 31, 17 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 16.9 | 31.8 | 1.5 | 83 + 5, 18 ms | over 16.7 ms; 1 shader violations |
| [pack](04-pack.jpg) | 8.7 | 20.2 | 1.5 | 83 + 5, 18 ms | 1 shader violations |
| [map](05-map.jpg) | 8.5 | 18.8 | 1.5 | 83 + 5, 18 ms | 1 shader violations |
| [town-dusk](06-town-dusk.jpg) | 13.1 | 39.9 | 1.5 | 83 + 5, 18 ms | over the 12 ms aim; 1 shader violations |
| [town-night](07-town-night.jpg) | 26.1 | 47.8 | 1.5 | 83 + 5, 18 ms | over 16.7 ms; 1 shader violations |
| [town-rain](08-town-rain.jpg) | 17.7 | 48.2 | 1.5 | 83 + 5, 18 ms | over 16.7 ms; 1 shader violations |
| [trade](09-trade.jpg) | 5.0 | 20.3 | 1.5 | 83 + 5, 18 ms | 1 shader violations |
| [cellar](10-cellar.jpg) | 9.8 | 55.1 | 4.0 | 83 + 24, 11 ms | 2 shader violations |
| [barrow](11-barrow.jpg) | 6.9 | 23.6 | 4.1 | 81 + 26, 9 ms | ok |
| [wild](12-wild.jpg) | 8.9 | 13.0 | 1.5 | 81 + 33, 9 ms | 1 shader violations |
| [fight](13-fight.jpg) | 12.7 | 27.7 | 1.5 | 81 + 38, 9 ms | over the 12 ms aim; 2 shader violations |
| [talk](14-talk.jpg) | 50.5 | 154.5 | 2.7 | 81 + 6, 33 ms | over 16.7 ms; over twice the town at noon |

## town-noon

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## pack

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## map

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## town-dusk

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## town-night

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## town-rain

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## trade

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 1 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync)

## cellar

- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync) started 13 ms after a build of 22 ms ended (minimum 45 ms): "MeshPhysicalNodeMaterial" (node-async)
- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync) started 1 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 4 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 4 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
