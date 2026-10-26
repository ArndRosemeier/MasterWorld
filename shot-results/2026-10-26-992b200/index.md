# Standard shots 2026-10-26 · 992b200

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 224 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 11.6 | 58.9 | 1.5 | 88 + 23, 24 ms | still waiting to be drawn: 1 wild groups |
| [creator](02-creator.jpg) | 50.6 | 80.2 | 2.7 | 88 + 53, 24 ms | over 16.7 ms; 3 shader violations |
| [town-noon](03-town-noon.jpg) | 62.8 | 183.6 | 2.2 | 84 + 21, 13 ms | over 16.7 ms; 1 shader violations |
| [pack](04-pack.jpg) | 16.2 | 69.2 | 1.6 | 84 + 21, 13 ms | over the 12 ms aim; 1 shader violations |
| [map](05-map.jpg) | 14.2 | 51.9 | 1.5 | 84 + 21, 13 ms | over the 12 ms aim; 1 shader violations |
| [town-dusk](06-town-dusk.jpg) | 30.6 | 80.3 | 1.5 | 84 + 21, 13 ms | over 16.7 ms; 1 shader violations |
| [town-night](07-town-night.jpg) | 36.5 | 92.8 | 1.5 | 84 + 21, 13 ms | over 16.7 ms; 1 shader violations |
| [town-rain](08-town-rain.jpg) | 38.9 | 62.9 | 1.5 | 84 + 23, 13 ms | over 16.7 ms; 2 shader violations |
| [trade](09-trade.jpg) | 15.0 | 35.8 | 1.5 | 84 + 23, 13 ms | over the 12 ms aim; 2 shader violations |
| [cellar](10-cellar.jpg) | 8.1 | 43.6 | 4.0 | 91 + 18, 9 ms | 2 shader violations |
| [barrow](11-barrow.jpg) | 12.1 | 54.5 | 4.0 | 84 + 14, 10 ms | over the 12 ms aim |
| [wild](12-wild.jpg) | 10.6 | 15.6 | 1.5 | 84 + 31, 10 ms | 1 shader violations |
| [fight](13-fight.jpg) | 13.9 | 16.7 | 1.5 | 84 + 36, 10 ms | over the 12 ms aim; 2 shader violations |
| [talk](14-talk.jpg) | 14.6 | 27.5 | 2.6 | 84 + 20, 11 ms | over the 12 ms aim; 2 shader violations |

## creator

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 58 ms after a build of 65 ms ended (minimum 130 ms)

## town-noon

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)

## pack

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)

## map

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)

## town-dusk

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)

## town-night

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)

## town-rain

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)
- run: "MeshBasicNodeMaterial" started 0 ms after a build of 4 ms ended (minimum 9 ms)

## trade

- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 2 ms ended (minimum 3 ms)
- run: "MeshBasicNodeMaterial" started 0 ms after a build of 4 ms ended (minimum 9 ms)

## cellar

- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial (instanced) of Mesh far folk<Point Light Shadow [ torch shadow light ] - Face 1" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 1 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 1 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## talk

- run: "ShadowMaterial of SkinnedMesh body-crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh crowd<townsfolk<Shadow Map [ ID: 14 ]" started 0 ms after a build of 9 ms ended (minimum 17 ms)
