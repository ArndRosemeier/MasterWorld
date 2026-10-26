# Standard shots 2026-10-26 · 1193502

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 6 s), no frame cap · run took 384 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 11.6 | 17.5 | 1.5 | 135 + 71, 14 ms | ok |
| [creator](02-creator.jpg) | 45.8 | 99.0 | 6.1 | 206 + 340, 18 ms | over 16.7 ms; not all drawn: 4 townsfolk |
| [town-noon](03-town-noon.jpg) | 29.4 | 46.0 | 2.8 | 206 + 306, 16 ms | over 16.7 ms; not all drawn: 1 townsfolk |
| [pack](04-pack.jpg) | 11.3 | 29.2 | 2.2 | 206 + 310, 16 ms | ok |
| [map](05-map.jpg) | 13.2 | 29.6 | 1.5 | 206 + 310, 16 ms | over the 12 ms aim |
| [town-dusk](06-town-dusk.jpg) | 31.1 | 46.4 | 6.1 | 206 + 361, 16 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 30.9 | 47.2 | 6.1 | 206 + 386, 16 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 31.4 | 79.1 | 6.1 | 206 + 482, 16 ms | over 16.7 ms; 1 shader violations |
| [cellar](09-cellar.jpg) | 6.6 | 19.5 | 1.5 | 207 + 1, 14 ms | ok |
| [barrow](10-barrow.jpg) | 9.4 | 13.8 | 1.5 | 226 + 0, 12 ms | ok |
| [wild](11-wild.jpg) | 12.4 | 16.0 | 1.5 | 226 + 48, 13 ms | over the 12 ms aim; 3 shader violations |
| [fight](12-fight.jpg) | 13.5 | 22.4 | 1.5 | 226 + 59, 13 ms | over the 12 ms aim; 3 shader violations |
| [talk](13-talk.jpg) | 16.5 | 24.6 | 1.5 | 199 + 56, 15 ms | over the 12 ms aim |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 6 ms ended (minimum 12 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 3 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 3 ms)
