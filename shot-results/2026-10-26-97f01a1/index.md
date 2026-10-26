# Standard shots 2026-10-26 · 97f01a1

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 6 s), no frame cap · run took 357 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 12.2 | 39.6 | 1.5 | 135 + 71, 13 ms | over the 12 ms aim |
| [creator](02-creator.jpg) | 46.6 | 376.9 | 6.0 | 206 + 201, 16 ms | over 16.7 ms; not all drawn: 6 townsfolk |
| [town-noon](03-town-noon.jpg) | 32.0 | 124.1 | 6.0 | 206 + 266, 14 ms | over 16.7 ms; not all drawn: 1 townsfolk |
| [pack](04-pack.jpg) | 20.3 | 39.8 | 4.9 | 206 + 306, 14 ms | over 16.7 ms |
| [map](05-map.jpg) | 18.2 | 30.0 | 1.5 | 206 + 310, 14 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 25.5 | 63.0 | 5.8 | 206 + 358, 14 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 26.2 | 42.2 | 6.0 | 206 + 389, 14 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 21.5 | 76.2 | 6.1 | 206 + 525, 14 ms | over 16.7 ms; 1 shader violations; not all drawn: 6 townsfolk |
| [cellar](09-cellar.jpg) | 5.3 | 16.4 | 1.5 | 207 + 1, 31 ms | ok |
| [barrow](10-barrow.jpg) | 7.7 | 10.9 | 1.5 | 226 + 0, 12 ms | ok |
| [wild](11-wild.jpg) | 10.0 | 14.1 | 1.5 | 226 + 48, 12 ms | 3 shader violations |
| [fight](12-fight.jpg) | 12.8 | 14.6 | 1.5 | 226 + 59, 12 ms | over the 12 ms aim; 3 shader violations |
| [talk](13-talk.jpg) | 11.0 | 14.2 | 1.9 | 199 + 57, 11 ms | ok |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 6 ms ended (minimum 12 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
