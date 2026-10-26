# Standard shots 2026-10-26 · 51f3072

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 6 s), no frame cap · run took 252 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 6.2 | 10.4 | 1.5 | 74 + 23, 11 ms | ok |
| [creator](02-creator.jpg) | 11.2 | 14.6 | 4.1 | 97 + 9, 8 ms | ok |
| [town-noon](03-town-noon.jpg) | 36.1 | 49.8 | 2.5 | 97 + 7, 8 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 38.8 | 65.4 | 1.5 | 97 + 7, 8 ms | over 16.7 ms |
| [map](05-map.jpg) | 37.4 | 44.6 | 1.5 | 97 + 7, 8 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 40.4 | 71.9 | 1.6 | 97 + 7, 8 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 45.0 | 92.3 | 1.5 | 97 + 7, 8 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 73.6 | 96.5 | 1.7 | 97 + 9, 8 ms | over 16.7 ms; over twice the town at noon; 1 shader violations |
| [cellar](09-cellar.jpg) | 3.6 | 9.9 | 1.5 | 99 + 1, 8 ms | ok |
| [barrow](10-barrow.jpg) | 8.6 | 25.3 | 1.5 | 96 + 0, 13 ms | ok |
| [wild](11-wild.jpg) | 48.1 | 81.2 | 1.5 | 96 + 7, 13 ms | over 16.7 ms; 1 shader violations |
| [fight](12-fight.jpg) | 55.6 | 64.7 | 1.6 | 96 + 12, 13 ms | over 16.7 ms; 2 shader violations |
| [talk](13-talk.jpg) | 19.0 | 44.3 | 5.3 | 94 + 8, 15 ms | over 16.7 ms |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 4 ms ended (minimum 8 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 0 ms after a build of 1 ms ended (minimum 3 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 0 ms after a build of 1 ms ended (minimum 3 ms)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" started 0 ms after a build of 1 ms ended (minimum 2 ms)
