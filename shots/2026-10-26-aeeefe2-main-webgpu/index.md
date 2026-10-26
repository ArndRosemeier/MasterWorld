# Standard shots 2026-10-26 · aeeefe2

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 159 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 7.7 | 9.3 | 4.0 | 90 + 22, 10 ms | ok |
| [creator](02-creator.jpg) | 19.5 | 45.7 | 1.5 | 90 + 28, 10 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 17.6 | 40.9 | 1.5 | 95 + 11, 23 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 15.1 | 20.9 | 1.5 | 95 + 12, 23 ms | over the 12 ms aim |
| [map](05-map.jpg) | 16.0 | 20.5 | 1.5 | 95 + 12, 23 ms | over the 12 ms aim |
| [town-dusk](06-town-dusk.jpg) | 19.8 | 45.9 | 1.5 | 95 + 12, 23 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 19.8 | 43.0 | 1.5 | 95 + 12, 23 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 24.6 | 45.6 | 1.5 | 95 + 14, 23 ms | over 16.7 ms; 1 shader violations |
| [trade](09-trade.jpg) | 5.2 | 21.7 | 1.5 | 95 + 14, 23 ms | 1 shader violations |
| [cellar](10-cellar.jpg) | 5.2 | 14.6 | 4.0 | 97 + 22, 13 ms | ok |
| [barrow](11-barrow.jpg) | 10.7 | 13.4 | 4.0 | 87 + 24, 9 ms | ok |
| [wild](12-wild.jpg) | 10.5 | 13.6 | 1.5 | 87 + 31, 9 ms | 1 shader violations |
| [fight](13-fight.jpg) | 13.4 | 14.8 | 1.5 | 87 + 36, 9 ms | over the 12 ms aim; 2 shader violations |
| [talk](14-talk.jpg) | 13.1 | 30.4 | 4.0 | 92 + 17, 7 ms | over the 12 ms aim; 1 shader violations |

## town-rain

- run: "MeshBasicNodeMaterial" started 1 ms after a build of 4 ms ended (minimum 8 ms)

## trade

- run: "MeshBasicNodeMaterial" started 1 ms after a build of 4 ms ended (minimum 8 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" started 0 ms after a build of 2 ms ended (minimum 4 ms)

## talk

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 1 ms ended (minimum 2 ms)
