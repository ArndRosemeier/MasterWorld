# Standard shots 2026-10-26 · b07d78d

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 206 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 7.3 | 17.0 | 4.0 | 82 + 23, 18 ms | still waiting to be drawn: 1 wild groups |
| [creator](02-creator.jpg) | 46.6 | 65.1 | 1.6 | 82 + 31, 18 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 40.2 | 59.5 | 1.6 | 78 + 10, 8 ms | over 16.7 ms; still waiting to be drawn: 1 wild groups |
| [pack](04-pack.jpg) | 39.4 | 66.2 | 1.5 | 78 + 10, 8 ms | over 16.7 ms |
| [map](05-map.jpg) | 40.7 | 46.5 | 1.5 | 78 + 10, 8 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 38.5 | 70.5 | 1.5 | 78 + 10, 8 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 73.2 | 90.2 | 1.6 | 78 + 10, 8 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 98.9 | 128.5 | 1.7 | 78 + 12, 8 ms | over 16.7 ms; over twice the town at noon; 1 shader violations |
| [trade](09-trade.jpg) | 10.5 | 19.4 | 1.5 | 78 + 13, 8 ms | 1 shader violations |
| [cellar](10-cellar.jpg) | 4.0 | 13.1 | 4.0 | 84 + 18, 9 ms | ok |
| [barrow](11-barrow.jpg) | 9.8 | 81.4 | 4.6 | 78 + 11, 8 ms | ok |
| [wild](12-wild.jpg) | 39.3 | 61.9 | 1.5 | 78 + 30, 8 ms | over 16.7 ms; 1 shader violations |
| [fight](13-fight.jpg) | 34.0 | 57.8 | 1.6 | 78 + 35, 8 ms | over 16.7 ms; 2 shader violations |
| [talk](14-talk.jpg) | 36.3 | 67.7 | 3.6 | 78 + 7, 10 ms | over 16.7 ms |

## town-rain

- run: "MeshBasicNodeMaterial" (node-sync) started 0 ms after a build of 4 ms ended (minimum 8 ms): "MeshBasicNodeMaterial" (node-sync)

## trade

- run: "MeshBasicNodeMaterial" (node-sync) started 0 ms after a build of 4 ms ended (minimum 8 ms): "MeshBasicNodeMaterial" (node-sync)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
