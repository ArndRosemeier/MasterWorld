# Standard shots 2026-10-27 · b847113

ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 305 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](01-title.jpg) | 12.6 | 28.9 | 1.5 | 81 + 9, 12 ms | over the 12 ms aim |
| [creator](02-creator.jpg) | 9.8 | 11.9 | 1.5 | 81 + 11, 12 ms | ok |
| [town-noon](03-town-noon.jpg) | 9.6 | 13.1 | 1.5 | 91 + 0, 10 ms | ok |
| [pack](04-pack.jpg) | 10.6 | 21.1 | 1.5 | 91 + 0, 10 ms | ok |
| [map](05-map.jpg) | 9.1 | 15.8 | 1.5 | 91 + 0, 10 ms | ok |
| [town-dusk](06-town-dusk.jpg) | 11.6 | 28.0 | 1.5 | 91 + 1, 10 ms | ok |
| [town-night](07-town-night.jpg) | 11.5 | 25.5 | 1.5 | 91 + 1, 10 ms | ok |
| [town-rain](08-town-rain.jpg) | 11.8 | 29.5 | 1.5 | 91 + 1, 10 ms | ok |
| [paddock](09-paddock.jpg) | 9.6 | 12.3 | 1.5 | 91 + 1, 10 ms | ok |
| [trade](10-trade.jpg) | 10.1 | 21.8 | 1.5 | 91 + 1, 10 ms | ok |
| [town-wet-sun](11-town-wet-sun.jpg) | 10.8 | 15.9 | 1.5 | 90 + 1, 9 ms | ok |
| [cellar](12-cellar.jpg) | 4.5 | 11.6 | 4.0 | 81 + 19, 10 ms | ok |
| [barrow](13-barrow.jpg) | 9.0 | 22.9 | 4.0 | 84 + 20, 10 ms | ok |
| [wild](14-wild.jpg) | 8.2 | 9.6 | 1.9 | 84 + 24, 10 ms | ok |
| [fight](15-fight.jpg) | 8.0 | 9.1 | 1.5 | 84 + 26, 10 ms | ok |
| [fight-magic](16-fight-magic.jpg) | 8.0 | 9.7 | 1.5 | 84 + 26, 10 ms | 1 page errors |
| [inn](17-inn.jpg) | 9.0 | 12.2 | 1.5 | 87 + 0, 14 ms | ok |
| [talk](18-talk.jpg) | 14.0 | 31.2 | 2.8 | 92 + 2, 17 ms | over the 12 ms aim |
| [hamlet](19-hamlet.jpg) | 10.4 | 25.3 | 4.0 | 80 + 8, 13 ms | ok |
| [road](20-road.jpg) | 11.4 | 13.2 | 1.5 | 80 + 8, 13 ms | ok |
| [village](21-village.jpg) | 8.8 | 23.5 | 4.0 | 80 + 9, 11 ms | ok |
| [hold](22-hold.jpg) | 15.0 | 29.8 | 4.0 | 79 + 24, 17 ms | over the 12 ms aim |
| [hold-crag](23-hold-crag.jpg) | 10.3 | 16.0 | 1.8 | 79 + 26, 17 ms | ok |
| [hold-warden](24-hold-warden.jpg) | 13.0 | 31.0 | 1.5 | 79 + 26, 17 ms | over the 12 ms aim |

## fight-magic

- page error: byte length of Float32Array should be a multiple of 4
