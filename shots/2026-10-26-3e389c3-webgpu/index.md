# Standard shots 2026-10-26 · 3e389c3

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 162 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 7.5 | 14.8 | 4.1 | 86 + 12, 8 ms | ok |
| [creator](02-creator.jpg) | 10.9 | 13.0 | 1.5 | 86 + 27, 8 ms | ok |
| [town-noon](03-town-noon.jpg) | 12.0 | 31.7 | 1.5 | 86 + 3, 9 ms | ok |
| [pack](04-pack.jpg) | 8.0 | 20.2 | 1.5 | 86 + 3, 9 ms | ok |
| [map](05-map.jpg) | 13.9 | 20.4 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [town-dusk](06-town-dusk.jpg) | 14.8 | 34.0 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [town-night](07-town-night.jpg) | 14.7 | 32.0 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [town-rain](08-town-rain.jpg) | 47.6 | 111.3 | 1.5 | 86 + 3, 9 ms | over 16.7 ms; over twice the town at noon |
| [trade](09-trade.jpg) | 15.0 | 27.6 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [cellar](10-cellar.jpg) | 5.1 | 14.1 | 4.0 | 83 + 26, 10 ms | 2 shader violations |
| [barrow](11-barrow.jpg) | 5.0 | 8.7 | 4.0 | 81 + 26, 9 ms | ok |
| [wild](12-wild.jpg) | 10.6 | 15.8 | 1.5 | 81 + 33, 9 ms | 1 shader violations |
| [fight](13-fight.jpg) | 12.0 | 17.4 | 1.5 | 81 + 38, 9 ms | 2 shader violations |
| [talk](14-talk.jpg) | 8.4 | 11.4 | 2.3 | 82 + 4, 14 ms | ok |

## cellar

- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync) started 13 ms after a build of 25 ms ended (minimum 51 ms): "MeshPhysicalNodeMaterial" (node-async)
- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync) started 1 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
