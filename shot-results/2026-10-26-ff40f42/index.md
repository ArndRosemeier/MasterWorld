# Standard shots 2026-10-26 · ff40f42

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 336 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 13.0 | 15.6 | 1.5 | 135 + 71, 42 ms | over the 12 ms aim |
| [creator](02-creator.jpg) | 22.1 | 175.5 | 4.1 | 206 + 49, 17 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 26.6 | 81.1 | 4.0 | 206 + 154, 13 ms | over 16.7 ms; still waiting to be drawn: 5 townsfolk |
| [pack](04-pack.jpg) | 19.8 | 55.2 | 4.0 | 206 + 286, 13 ms | over 16.7 ms; still waiting to be drawn: 1 townsfolk |
| [map](05-map.jpg) | 22.2 | 56.2 | 2.1 | 206 + 306, 13 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 32.8 | 73.8 | 4.0 | 206 + 352, 13 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 31.1 | 58.1 | 4.0 | 206 + 382, 13 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 30.8 | 62.2 | 3.8 | 206 + 453, 13 ms | over 16.7 ms; 1 shader violations |
| [cellar](09-cellar.jpg) | 5.2 | 15.5 | 1.5 | 207 + 1, 21 ms | ok |
| [barrow](10-barrow.jpg) | 9.8 | 12.4 | 1.5 | 226 + 0, 12 ms | ok |
| [wild](11-wild.jpg) | 16.1 | 39.6 | 1.5 | 226 + 48, 31 ms | over the 12 ms aim; 3 shader violations |
| [fight](12-fight.jpg) | 21.2 | 41.4 | 1.5 | 226 + 59, 31 ms | over 16.7 ms; 3 shader violations |
| [talk](13-talk.jpg) | 13.7 | 16.2 | 2.7 | 199 + 56, 18 ms | over the 12 ms aim |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 5 ms ended (minimum 10 ms)

## wild

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 2 ms ended (minimum 5 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)

## fight

- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 2 ms ended (minimum 5 ms)
- run: "ShadowMaterial of SkinnedMesh brows-eyebrow001<bandit<creatures (shadow warm-up)" started 0 ms after a build of 1 ms ended (minimum 2 ms)
