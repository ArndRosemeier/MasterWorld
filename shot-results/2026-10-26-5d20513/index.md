# Standard shots 2026-10-26 · 5d20513

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 6 s), no frame cap · run took 358 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 8.7 | 11.4 | 1.5 | 135 + 71, 14 ms | ok |
| [creator](02-creator.jpg) | 38.6 | 62.9 | 6.3 | 206 + 234, 19 ms | over 16.7 ms; not all drawn: 16 townsfolk |
| [town-noon](03-town-noon.jpg) | 31.5 | 75.7 | 6.0 | 206 + 250, 17 ms | over 16.7 ms; not all drawn: 13 townsfolk |
| [pack](04-pack.jpg) | 10.9 | 26.2 | 4.0 | 206 + 306, 17 ms | ok |
| [map](05-map.jpg) | 17.9 | 28.3 | 2.3 | 206 + 310, 17 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 32.1 | 78.6 | 6.2 | 206 + 360, 17 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 30.5 | 62.1 | 6.0 | 206 + 387, 17 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 31.1 | 61.3 | 3.4 | 206 + 468, 17 ms | over 16.7 ms; 1 shader violations |
| [cellar](09-cellar.jpg) | 6.6 | 20.5 | 1.5 | 207 + 1, 12 ms | ok |
| [barrow](10-barrow.jpg) | 18.6 | 36.0 | 1.5 | 226 + 0, 16 ms | over 16.7 ms |
| [wild](11-wild.jpg) | 12.3 | 15.2 | 1.5 | 226 + 48, 16 ms | over the 12 ms aim; 3 shader violations |
| [fight](12-fight.jpg) | 11.6 | 13.9 | 1.5 | 226 + 59, 16 ms | 3 shader violations |
| [talk](13-talk.jpg) | 13.8 | 16.1 | 1.5 | 199 + 58, 15 ms | over the 12 ms aim |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 7 ms ended (minimum 13 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
