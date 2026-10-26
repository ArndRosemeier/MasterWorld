# Shot sets a86c50f (RTX 5070)

WebGPU (SET_GL=0), then WebGL2. Folders: shots/2026-10-26-a86c50f-webgpu, shots/2026-10-26-a86c50f-gl. Side-by-side sheets against 3e389c3 (left before, right new) in perf/a86c50f-compare/.

**Look:** the sun shadows in town are missing in the new pictures on both backends (horse and townsfolk shadows, and the large building/tree shadows across the square at noon). Cellar torch shadows are still there.

## WebGPU


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 155 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-a86c50f-webgpu/01-title.jpg) | 6.1 | 8.8 | 4.0 | 79 + 29, 7 ms | ok |
| [creator](../shots/2026-10-26-a86c50f-webgpu/02-creator.jpg) | 13.1 | 16.2 | 1.5 | 79 + 34, 7 ms | over the 12 ms aim |
| [town-noon](../shots/2026-10-26-a86c50f-webgpu/03-town-noon.jpg) | 11.4 | 14.3 | 1.5 | 82 + 7, 9 ms | ok |
| [pack](../shots/2026-10-26-a86c50f-webgpu/04-pack.jpg) | 11.6 | 18.6 | 1.5 | 82 + 7, 9 ms | ok |
| [map](../shots/2026-10-26-a86c50f-webgpu/05-map.jpg) | 3.4 | 14.8 | 1.5 | 82 + 7, 9 ms | ok |
| [town-dusk](../shots/2026-10-26-a86c50f-webgpu/06-town-dusk.jpg) | 12.7 | 32.5 | 1.5 | 82 + 7, 9 ms | over the 12 ms aim |
| [town-night](../shots/2026-10-26-a86c50f-webgpu/07-town-night.jpg) | 12.8 | 27.3 | 1.5 | 82 + 7, 9 ms | over the 12 ms aim |
| [town-rain](../shots/2026-10-26-a86c50f-webgpu/08-town-rain.jpg) | 36.4 | 50.6 | 1.5 | 82 + 7, 9 ms | over 16.7 ms; over twice the town at noon |
| [trade](../shots/2026-10-26-a86c50f-webgpu/09-trade.jpg) | 12.0 | 15.6 | 1.5 | 82 + 7, 9 ms | ok |
| [cellar](../shots/2026-10-26-a86c50f-webgpu/10-cellar.jpg) | 4.0 | 11.8 | 4.0 | 80 + 29, 11 ms | ok |
| [barrow](../shots/2026-10-26-a86c50f-webgpu/11-barrow.jpg) | 5.0 | 7.9 | 4.0 | 77 + 30, 7 ms | ok |
| [wild](../shots/2026-10-26-a86c50f-webgpu/12-wild.jpg) | 7.0 | 10.1 | 1.5 | 77 + 37, 7 ms | ok |
| [fight](../shots/2026-10-26-a86c50f-webgpu/13-fight.jpg) | 13.2 | 23.5 | 1.5 | 77 + 42, 7 ms | over the 12 ms aim |
| [talk](../shots/2026-10-26-a86c50f-webgpu/14-talk.jpg) | 8.4 | 11.4 | 2.4 | 77 + 9, 10 ms | ok |

## WebGL2


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 185 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-a86c50f-gl/01-title.jpg) | 8.2 | 40.3 | 4.1 | 76 + 31, 14 ms | ok |
| [creator](../shots/2026-10-26-a86c50f-gl/02-creator.jpg) | 13.5 | 26.0 | 1.5 | 76 + 36, 14 ms | over the 12 ms aim |
| [town-noon](../shots/2026-10-26-a86c50f-gl/03-town-noon.jpg) | 12.6 | 16.1 | 1.5 | 82 + 6, 8 ms | over the 12 ms aim; still waiting to be drawn: 1 wild groups |
| [pack](../shots/2026-10-26-a86c50f-gl/04-pack.jpg) | 13.3 | 18.2 | 1.5 | 82 + 6, 8 ms | over the 12 ms aim |
| [map](../shots/2026-10-26-a86c50f-gl/05-map.jpg) | 13.1 | 16.8 | 1.5 | 82 + 6, 8 ms | over the 12 ms aim |
| [town-dusk](../shots/2026-10-26-a86c50f-gl/06-town-dusk.jpg) | 14.2 | 32.1 | 1.5 | 82 + 6, 8 ms | over the 12 ms aim |
| [town-night](../shots/2026-10-26-a86c50f-gl/07-town-night.jpg) | 14.7 | 33.2 | 1.5 | 82 + 6, 8 ms | over the 12 ms aim |
| [town-rain](../shots/2026-10-26-a86c50f-gl/08-town-rain.jpg) | 75.7 | 90.4 | 1.6 | 82 + 6, 8 ms | over 16.7 ms; over twice the town at noon |
| [trade](../shots/2026-10-26-a86c50f-gl/09-trade.jpg) | 13.6 | 19.1 | 1.5 | 82 + 6, 8 ms | over the 12 ms aim |
| [cellar](../shots/2026-10-26-a86c50f-gl/10-cellar.jpg) | 4.7 | 13.4 | 4.0 | 83 + 19, 9 ms | ok |
| [barrow](../shots/2026-10-26-a86c50f-gl/11-barrow.jpg) | 7.5 | 23.0 | 4.0 | 80 + 18, 8 ms | ok |
| [wild](../shots/2026-10-26-a86c50f-gl/12-wild.jpg) | 10.0 | 13.1 | 1.5 | 80 + 32, 8 ms | ok |
| [fight](../shots/2026-10-26-a86c50f-gl/13-fight.jpg) | 13.3 | 15.6 | 1.5 | 80 + 37, 8 ms | over the 12 ms aim |
| [talk](../shots/2026-10-26-a86c50f-gl/14-talk.jpg) | 29.2 | 43.9 | 2.6 | 76 + 8, 14 ms | over 16.7 ms; over twice the town at noon |
