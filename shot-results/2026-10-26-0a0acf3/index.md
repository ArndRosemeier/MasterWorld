# Standard shots 2026-10-26 · 0a0acf3

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 280 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 10.2 | 13.8 | 1.5 | 135 + 71, 18 ms | ok |
| [creator](02-creator.jpg) | 24.4 | 186.6 | 4.0 | 135 + 189, 28 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 30.4 | 114.8 | 4.0 | 206 + 155, 12 ms | over 16.7 ms; still waiting to be drawn: 5 townsfolk |
| [pack](04-pack.jpg) | 20.8 | 57.9 | 4.0 | 206 + 289, 12 ms | over 16.7 ms; still waiting to be drawn: 1 townsfolk |
| [map](05-map.jpg) | 18.4 | 54.5 | 1.8 | 206 + 306, 12 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 25.7 | 51.4 | 4.1 | 206 + 352, 12 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 27.1 | 60.4 | 4.0 | 206 + 386, 12 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 31.0 | 60.6 | 4.0 | 206 + 455, 12 ms | over 16.7 ms; 1 shader violations |
| [cellar](09-cellar.jpg) | 7.3 | 34.0 | 1.5 | 207 + 1, 11 ms | ok |
| [barrow](10-barrow.jpg) | 8.1 | 10.2 | 1.5 | 226 + 0, 12 ms | ok |
| [wild](11-wild.jpg) | 10.5 | 14.0 | 1.5 | 226 + 48, 12 ms | 3 shader violations |
| [fight](12-fight.jpg) | 14.1 | 16.1 | 1.5 | 226 + 59, 12 ms | over the 12 ms aim; 3 shader violations |
| [talk](13-talk.jpg) | 12.2 | 15.2 | 2.3 | 199 + 56, 12 ms | over the 12 ms aim |

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
