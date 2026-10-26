# Standard shots 2026-10-26 · 2647793

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 328 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 9.3 | 12.9 | 1.5 | 135 + 71, 11 ms | ok |
| [creator](02-creator.jpg) | 31.5 | 172.1 | 4.0 | 202 + 164, 14 ms | over 16.7 ms; still waiting to be drawn: 5 townsfolk |
| [town-noon](03-town-noon.jpg) | 31.1 | 64.5 | 4.1 | 202 + 175, 13 ms | over 16.7 ms; still waiting to be drawn: 4 townsfolk |
| [pack](04-pack.jpg) | 20.1 | 38.0 | 4.2 | 202 + 304, 13 ms | over 16.7 ms |
| [map](05-map.jpg) | 10.5 | 26.0 | 3.0 | 202 + 310, 13 ms | ok |
| [town-dusk](06-town-dusk.jpg) | 19.5 | 46.5 | 4.0 | 202 + 353, 13 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 20.6 | 41.5 | 4.0 | 202 + 385, 13 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 30.8 | 77.1 | 4.1 | 202 + 475, 13 ms | over 16.7 ms; 1 shader violations; still waiting to be drawn: 3 townsfolk |
| [cellar](09-cellar.jpg) | 5.4 | 16.8 | 1.5 | 207 + 1, 11 ms | ok |
| [barrow](10-barrow.jpg) | 9.8 | 11.7 | 1.5 | 226 + 0, 17 ms | ok |
| [wild](11-wild.jpg) | 15.0 | 19.2 | 1.5 | 226 + 48, 17 ms | over the 12 ms aim; 3 shader violations |
| [fight](12-fight.jpg) | 12.9 | 16.1 | 1.5 | 226 + 59, 17 ms | over the 12 ms aim; 3 shader violations |
| [talk](13-talk.jpg) | 31.9 | 57.0 | 2.4 | 199 + 58, 19 ms | over 16.7 ms; still waiting to be drawn: 1 townsfolk |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 3 ms ended (minimum 7 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 3 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 3 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 3 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 3 ms)
