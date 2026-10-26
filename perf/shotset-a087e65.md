# Shot sets a087e65 (RTX 5070)

WebGPU (SET_GL=0), then WebGL2. Folders: shots/2026-10-26-a087e65-webgpu, shots/2026-10-26-a087e65-gl. Side-by-side sheets against 3e389c3 (left before, right new) in perf/a087e65-compare/.

**Look:** sun shadows are back on both backends and the pictures match 3e389c3 (mean pixel difference 0.4–0.9 on the town shots, against 7–13 at a86c50f). Nothing missing or popping that I could see; remaining differences are timing (poses, people's positions, the title's peoples card).

## WebGPU


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 184 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-a087e65-webgpu/01-title.jpg) | 6.4 | 11.5 | 4.0 | 83 + 12, 10 ms | ok |
| [creator](../shots/2026-10-26-a087e65-webgpu/02-creator.jpg) | 18.1 | 44.9 | 1.5 | 83 + 20, 10 ms | over 16.7 ms |
| [town-noon](../shots/2026-10-26-a087e65-webgpu/03-town-noon.jpg) | 16.7 | 34.8 | 1.5 | 88 + 1, 11 ms | over 16.7 ms |
| [pack](../shots/2026-10-26-a087e65-webgpu/04-pack.jpg) | 4.6 | 21.0 | 1.5 | 88 + 1, 11 ms | ok |
| [map](../shots/2026-10-26-a087e65-webgpu/05-map.jpg) | 5.3 | 20.9 | 1.5 | 88 + 1, 11 ms | ok |
| [town-dusk](../shots/2026-10-26-a087e65-webgpu/06-town-dusk.jpg) | 17.4 | 40.2 | 1.5 | 88 + 1, 11 ms | over 16.7 ms |
| [town-night](../shots/2026-10-26-a087e65-webgpu/07-town-night.jpg) | 16.2 | 34.0 | 1.5 | 88 + 1, 11 ms | over the 12 ms aim |
| [town-rain](../shots/2026-10-26-a087e65-webgpu/08-town-rain.jpg) | 16.6 | 39.7 | 1.5 | 88 + 1, 11 ms | over the 12 ms aim |
| [trade](../shots/2026-10-26-a087e65-webgpu/09-trade.jpg) | 14.2 | 22.2 | 1.5 | 88 + 1, 11 ms | over the 12 ms aim |
| [cellar](../shots/2026-10-26-a087e65-webgpu/10-cellar.jpg) | 5.7 | 16.9 | 4.1 | 86 + 23, 11 ms | ok |
| [barrow](../shots/2026-10-26-a087e65-webgpu/11-barrow.jpg) | 12.2 | 25.6 | 3.0 | 82 + 4, 15 ms | over the 12 ms aim |
| [wild](../shots/2026-10-26-a087e65-webgpu/12-wild.jpg) | 16.9 | 44.6 | 1.5 | 82 + 15, 15 ms | over 16.7 ms |
| [fight](../shots/2026-10-26-a087e65-webgpu/13-fight.jpg) | 31.2 | 77.8 | 3.3 | 82 + 25, 15 ms | over 16.7 ms |
| [talk](../shots/2026-10-26-a087e65-webgpu/14-talk.jpg) | 10.3 | 14.7 | 2.4 | 82 + 4, 9 ms | ok |

## WebGL2


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 194 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-a087e65-gl/01-title.jpg) | 10.5 | 63.7 | 4.0 | 82 + 19, 15 ms | ok |
| [creator](../shots/2026-10-26-a087e65-gl/02-creator.jpg) | 16.8 | 36.7 | 1.5 | 82 + 24, 15 ms | over 16.7 ms |
| [town-noon](../shots/2026-10-26-a087e65-gl/03-town-noon.jpg) | 37.4 | 78.0 | 1.5 | 81 + 6, 10 ms | over 16.7 ms; still waiting to be drawn: 1 wild groups |
| [pack](../shots/2026-10-26-a087e65-gl/04-pack.jpg) | 20.1 | 33.3 | 1.5 | 81 + 6, 10 ms | over 16.7 ms |
| [map](../shots/2026-10-26-a087e65-gl/05-map.jpg) | 19.3 | 32.7 | 1.5 | 81 + 6, 10 ms | over 16.7 ms |
| [town-dusk](../shots/2026-10-26-a087e65-gl/06-town-dusk.jpg) | 61.7 | 138.7 | 1.6 | 81 + 6, 10 ms | over 16.7 ms |
| [town-night](../shots/2026-10-26-a087e65-gl/07-town-night.jpg) | 31.3 | 57.1 | 1.5 | 81 + 6, 10 ms | over 16.7 ms |
| [town-rain](../shots/2026-10-26-a087e65-gl/08-town-rain.jpg) | 23.5 | 47.3 | 1.5 | 81 + 6, 10 ms | over 16.7 ms |
| [trade](../shots/2026-10-26-a087e65-gl/09-trade.jpg) | 18.3 | 31.9 | 1.5 | 81 + 6, 10 ms | over 16.7 ms |
| [cellar](../shots/2026-10-26-a087e65-gl/10-cellar.jpg) | 4.3 | 13.3 | 4.0 | 84 + 19, 8 ms | ok |
| [barrow](../shots/2026-10-26-a087e65-gl/11-barrow.jpg) | 6.3 | 38.9 | 4.0 | 80 + 18, 8 ms | ok |
| [wild](../shots/2026-10-26-a087e65-gl/12-wild.jpg) | 9.3 | 12.1 | 1.5 | 80 + 32, 8 ms | ok |
| [fight](../shots/2026-10-26-a087e65-gl/13-fight.jpg) | 13.0 | 15.4 | 1.5 | 80 + 37, 8 ms | over the 12 ms aim |
| [talk](../shots/2026-10-26-a087e65-gl/14-talk.jpg) | 8.4 | 10.5 | 2.5 | 80 + 5, 13 ms | ok |
