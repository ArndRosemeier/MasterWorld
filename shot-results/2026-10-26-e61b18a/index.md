# Standard shots 2026-10-26 · e61b18a

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 6 s), no frame cap · run took 286 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 9.0 | 10.9 | 1.5 | 135 + 71, 12 ms | ok |
| [creator](02-creator.jpg) | 16.6 | 50.2 | 6.0 | 206 + 103, 12 ms | over the 12 ms aim |
| [town-noon](03-town-noon.jpg) | 25.1 | 56.5 | 6.1 | 206 + 115, 11 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 20.2 | 46.1 | 6.0 | 206 + 217, 12 ms | over 16.7 ms |
| [map](05-map.jpg) | 17.3 | 29.7 | 6.0 | 206 + 298, 12 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 21.1 | 59.8 | 6.0 | 206 + 350, 12 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 33.9 | 124.0 | 2.1 | 206 + 371, 12 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 31.4 | 59.7 | 6.0 | 206 + 433, 12 ms | over 16.7 ms; 1 shader violations |
| [cellar](09-cellar.jpg) | 5.4 | 16.3 | 1.5 | 207 + 1, 11 ms | ok |
| [barrow](10-barrow.jpg) | 7.6 | 10.2 | 1.5 | 226 + 0, 12 ms | ok |
| [wild](11-wild.jpg) | 11.1 | 13.8 | 1.5 | 226 + 48, 12 ms | 3 shader violations |
| [fight](12-fight.jpg) | 12.7 | 14.9 | 1.5 | 226 + 59, 12 ms | over the 12 ms aim; 3 shader violations |
| [talk](13-talk.jpg) | 13.1 | 16.9 | 6.0 | 199 + 58, 13 ms | over the 12 ms aim |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 4 ms ended (minimum 7 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
