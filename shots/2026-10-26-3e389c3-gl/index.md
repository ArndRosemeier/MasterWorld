# Standard shots 2026-10-26 · 3e389c3

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 210 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 6.9 | 31.8 | 4.0 | 80 + 27, 9 ms | ok |
| [creator](02-creator.jpg) | 12.7 | 27.6 | 1.5 | 80 + 31, 9 ms | over the 12 ms aim |
| [town-noon](03-town-noon.jpg) | 13.8 | 29.9 | 1.5 | 82 + 5, 8 ms | over the 12 ms aim |
| [pack](04-pack.jpg) | 15.1 | 19.9 | 1.5 | 82 + 5, 8 ms | over the 12 ms aim |
| [map](05-map.jpg) | 15.1 | 19.4 | 1.5 | 82 + 5, 8 ms | over the 12 ms aim |
| [town-dusk](06-town-dusk.jpg) | 21.2 | 34.6 | 1.5 | 82 + 5, 8 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 20.7 | 32.4 | 1.5 | 82 + 5, 8 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 95.5 | 120.6 | 1.7 | 82 + 5, 8 ms | over 16.7 ms; over twice the town at noon |
| [trade](09-trade.jpg) | 18.9 | 22.5 | 1.5 | 82 + 5, 8 ms | over 16.7 ms |
| [cellar](10-cellar.jpg) | 7.6 | 25.6 | 4.0 | 83 + 14, 11 ms | ok |
| [barrow](11-barrow.jpg) | 16.0 | 78.1 | 4.0 | 80 + 14, 10 ms | over the 12 ms aim |
| [wild](12-wild.jpg) | 14.9 | 31.4 | 1.5 | 80 + 31, 10 ms | over the 12 ms aim; 1 shader violations |
| [fight](13-fight.jpg) | 14.4 | 29.1 | 1.5 | 80 + 36, 10 ms | over the 12 ms aim; 2 shader violations |
| [talk](14-talk.jpg) | 22.0 | 38.6 | 3.0 | 80 + 5, 18 ms | over 16.7 ms |

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
