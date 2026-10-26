# Standard shots 2026-10-26 · 25f5dd5

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 232 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 15.0 | 80.1 | 4.0 | 80 + 23, 16 ms | over the 12 ms aim; still waiting to be drawn: 1 wild groups |
| [creator](02-creator.jpg) | 16.1 | 30.3 | 1.5 | 80 + 31, 16 ms | over the 12 ms aim; 1 shader violations |
| [town-noon](03-town-noon.jpg) | 20.6 | 37.9 | 1.5 | 80 + 7, 110 ms | over 16.7 ms; 1 shader violations; still waiting to be drawn: 1 wild groups |
| [pack](04-pack.jpg) | 18.0 | 24.8 | 1.5 | 80 + 7, 110 ms | over 16.7 ms; 1 shader violations |
| [map](05-map.jpg) | 13.4 | 18.7 | 1.5 | 80 + 7, 110 ms | over the 12 ms aim; 1 shader violations |
| [town-dusk](06-town-dusk.jpg) | 14.7 | 32.5 | 1.5 | 80 + 7, 110 ms | over the 12 ms aim; 1 shader violations |
| [town-night](07-town-night.jpg) | 14.3 | 31.7 | 1.5 | 80 + 7, 110 ms | over the 12 ms aim; 1 shader violations |
| [town-rain](08-town-rain.jpg) | 69.7 | 95.5 | 1.6 | 80 + 7, 110 ms | over 16.7 ms; over twice the town at noon; 1 shader violations |
| [trade](09-trade.jpg) | 13.8 | 22.5 | 1.5 | 80 + 7, 110 ms | over the 12 ms aim; 1 shader violations |
| [cellar](10-cellar.jpg) | 6.6 | 18.5 | 4.0 | 83 + 14, 10 ms | ok |
| [barrow](11-barrow.jpg) | 9.1 | 32.1 | 4.0 | 80 + 15, 13 ms | ok |
| [wild](12-wild.jpg) | 13.3 | 26.4 | 1.5 | 80 + 32, 13 ms | over the 12 ms aim; 1 shader violations |
| [fight](13-fight.jpg) | 18.1 | 42.3 | 1.5 | 80 + 37, 13 ms | over 16.7 ms; 2 shader violations |
| [talk](14-talk.jpg) | 13.6 | 42.9 | 3.2 | 80 + 4, 13 ms | over the 12 ms aim; 1 shader violations |

## creator

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 7 ms after a build of 25 ms ended (minimum 50 ms): "MeshPhysicalNodeMaterial" (node-async)

## town-noon

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## pack

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## map

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## town-dusk

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## town-night

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## town-rain

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## trade

- warmup: node-sync "ShadowMaterial of SkinnedMesh body<horse<Shadow Map [ ID: 14 ]" blocked 110 ms (budget 100 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)

## talk

- run: "ShadowMaterial of SkinnedMesh beard<townsfolk<Shadow Map [ ID: 14 ]" (node-sync) started 32 ms after a build of 20 ms ended (minimum 39 ms): "MeshStandardNodeMaterial" (node-async)
