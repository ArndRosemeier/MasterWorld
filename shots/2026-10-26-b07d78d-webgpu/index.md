# Standard shots 2026-10-26 · b07d78d

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 179 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 6.2 | 9.6 | 4.0 | 84 + 22, 11 ms | ok |
| [creator](02-creator.jpg) | 49.9 | 99.2 | 1.6 | 84 + 28, 11 ms | over 16.7 ms; over twice the town at noon |
| [town-noon](03-town-noon.jpg) | 18.1 | 40.1 | 1.5 | 88 + 0, 9 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 7.0 | 19.9 | 1.5 | 88 + 0, 9 ms | ok |
| [map](05-map.jpg) | 9.1 | 22.0 | 1.5 | 88 + 0, 9 ms | ok |
| [town-dusk](06-town-dusk.jpg) | 14.6 | 47.4 | 1.5 | 88 + 0, 9 ms | over the 12 ms aim |
| [town-night](07-town-night.jpg) | 56.7 | 77.2 | 1.6 | 88 + 0, 9 ms | over 16.7 ms; over twice the town at noon |
| [town-rain](08-town-rain.jpg) | 114.0 | 133.9 | 1.5 | 88 + 2, 9 ms | over 16.7 ms; over twice the town at noon; 1 shader violations |
| [trade](09-trade.jpg) | 15.5 | 21.4 | 1.5 | 88 + 2, 9 ms | over the 12 ms aim; 1 shader violations |
| [cellar](10-cellar.jpg) | 5.0 | 18.3 | 4.0 | 89 + 21, 11 ms | ok |
| [barrow](11-barrow.jpg) | 8.5 | 17.3 | 4.0 | 81 + 6, 10 ms | ok |
| [wild](12-wild.jpg) | 9.6 | 38.3 | 4.0 | 81 + 25, 10 ms | 1 shader violations |
| [fight](13-fight.jpg) | 23.7 | 44.8 | 1.6 | 81 + 31, 10 ms | over 16.7 ms; 2 shader violations |
| [talk](14-talk.jpg) | 9.9 | 15.2 | 2.1 | 83 + 3, 8 ms | ok |

## town-rain

- run: "MeshBasicNodeMaterial" (node-sync) started 0 ms after a build of 4 ms ended (minimum 7 ms): "MeshBasicNodeMaterial" (node-sync)

## trade

- run: "MeshBasicNodeMaterial" (node-sync) started 0 ms after a build of 4 ms ended (minimum 7 ms): "MeshBasicNodeMaterial" (node-sync)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
