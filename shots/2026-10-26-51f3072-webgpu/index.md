# Standard shots 2026-10-26 · 51f3072

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 6 s), no frame cap · run took 245 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 10.8 | 18.0 | 1.5 | 75 + 23, 19 ms | ok |
| [creator](02-creator.jpg) | 18.7 | 37.1 | 2.8 | 98 + 6, 14 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 18.2 | 37.3 | 2.7 | 98 + 7, 13 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 11.5 | 25.1 | 1.5 | 98 + 7, 13 ms | ok |
| [map](05-map.jpg) | 12.9 | 22.7 | 1.5 | 98 + 7, 13 ms | over the 12 ms aim |
| [town-dusk](06-town-dusk.jpg) | 21.8 | 68.5 | 1.5 | 98 + 7, 13 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 81.4 | 118.3 | 1.6 | 98 + 7, 13 ms | over 16.7 ms; over twice the town at noon |
| [town-rain](08-town-rain.jpg) | 120.0 | 155.9 | 1.9 | 98 + 9, 13 ms | over 16.7 ms; over twice the town at noon; 1 shader violations |
| [cellar](09-cellar.jpg) | 7.6 | 23.9 | 1.5 | 100 + 1, 13 ms | ok |
| [barrow](10-barrow.jpg) | 9.2 | 13.9 | 1.5 | 96 + 1, 12 ms | ok |
| [wild](11-wild.jpg) | 12.6 | 19.6 | 1.5 | 96 + 8, 12 ms | over the 12 ms aim; 2 shader violations |
| [fight](12-fight.jpg) | 12.6 | 20.9 | 1.5 | 96 + 13, 12 ms | over the 12 ms aim; 3 shader violations |
| [talk](13-talk.jpg) | 12.6 | 19.7 | 3.0 | 95 + 9, 21 ms | over the 12 ms aim |

## town-rain

- run: "MeshBasicNodeMaterial" started 1 ms after a build of 4 ms ended (minimum 9 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh beard<bandit<creatures" started 23 ms after a build of 45 ms ended (minimum 91 ms)
- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh beard<bandit<creatures" started 23 ms after a build of 45 ms ended (minimum 91 ms)
- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" started 0 ms after a build of 2 ms ended (minimum 3 ms)
