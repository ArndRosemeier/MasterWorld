# Standard shots 2026-10-26 · 5bd128f

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 162 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 6.8 | 9.4 | 4.0 | 83 + 25, 9 ms | ok |
| [creator](02-creator.jpg) | 57.8 | 79.2 | 1.5 | 83 + 30, 9 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 46.3 | 69.7 | 1.6 | 86 + 4, 9 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 43.7 | 56.3 | 1.5 | 86 + 4, 9 ms | over 16.7 ms |
| [map](05-map.jpg) | 44.9 | 50.9 | 1.5 | 86 + 4, 9 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 46.9 | 102.7 | 1.5 | 86 + 4, 9 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 61.6 | 77.7 | 1.5 | 86 + 4, 9 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 107.1 | 126.2 | 1.6 | 86 + 4, 9 ms | over 16.7 ms; over twice the town at noon |
| [trade](09-trade.jpg) | 14.6 | 20.0 | 1.5 | 86 + 4, 9 ms | over the 12 ms aim |
| [cellar](10-cellar.jpg) | 4.8 | 13.5 | 4.0 | 86 + 23, 9 ms | ok |
| [barrow](11-barrow.jpg) | 5.1 | 9.2 | 4.0 | 81 + 26, 11 ms | ok |
| [wild](12-wild.jpg) | 7.4 | 11.4 | 1.5 | 81 + 33, 11 ms | 1 shader violations |
| [fight](13-fight.jpg) | 13.0 | 16.4 | 1.5 | 81 + 38, 11 ms | over the 12 ms aim; 2 shader violations |
| [talk](14-talk.jpg) | 32.0 | 47.2 | 2.7 | 81 + 6, 10 ms | over 16.7 ms |

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
