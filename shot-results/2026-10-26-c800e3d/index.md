# Standard shots 2026-10-26 · c800e3d

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 12 s), no frame cap · run took 452 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 7.5 | 14.0 | 1.5 | 134 + 72, 11 ms | ok |
| [creator](02-creator.jpg) | 42.5 | 191.7 | 12.0 | 202 + 171, 12 ms | over 16.7 ms |
| [town-noon](03-town-noon.jpg) | 23.8 | 640.6 | 12.0 | 206 + 70, 12 ms | over 16.7 ms |
| [pack](04-pack.jpg) | 18.3 | 72.1 | 12.0 | 206 + 210, 15 ms | over 16.7 ms |
| [map](05-map.jpg) | 19.1 | 110.5 | 12.0 | 206 + 300, 15 ms | over 16.7 ms |
| [town-dusk](06-town-dusk.jpg) | 32.4 | 48.9 | 12.1 | 206 + 350, 15 ms | over 16.7 ms |
| [town-night](07-town-night.jpg) | 32.0 | 46.8 | 7.9 | 206 + 380, 15 ms | over 16.7 ms |
| [town-rain](08-town-rain.jpg) | 30.8 | 49.6 | 9.1 | 206 + 458, 15 ms | over 16.7 ms; 1 shader violations |
| [cellar](09-cellar.jpg) | 26.7 | 64.0 | 1.6 | 208 + 0, 11 ms | over 16.7 ms |
| [barrow](10-barrow.jpg) | 32.3 | 42.5 | 1.6 | 226 + 0, 12 ms | over 16.7 ms |
| [wild](11-wild.jpg) | 56.8 | 76.4 | 1.6 | 240 + 0, 11 ms | over 16.7 ms; over twice the town at noon |
| [fight](12-fight.jpg) | 31.9 | 47.9 | 1.5 | 210 + 0, 12 ms | over 16.7 ms |
| [talk](13-talk.jpg) | 10.9 | 15.6 | 9.7 | 199 + 58, 15 ms | ok |

## town-rain

- run: "MeshBasicNodeMaterial" started 0 ms after a build of 5 ms ended (minimum 10 ms)
