# Shot sets a087e65, second sample (RTX 5070)

WebGPU (SET_GL=0) 15:41:50–15:44:29, then WebGL2 15:45:00–15:48:08. Folders: shots/2026-10-26-a087e65-webgpu-2, shots/2026-10-26-a087e65-gl-2. No other thread's node job ran (30 s quiet before each set). Both runs exited 0.

GPU at the start of each set (nvidia-smi: temp °C, graphics clock, memory clock, util, power, pstate | other processes' 3D engine use > 1 %):

```
15:41:48 gpu: 41, 367 MHz, 7001 MHz, 1 %, 19.68 W, P3 | 3D: 
15:44:59 gpu: 39, 292 MHz, 810 MHz, 1 %, 5.72 W, P5 | 3D: chrome(18872) 1%
```

GPU every 10 s during both sets:

```
15:41:18 gpu: 40, 427 MHz, 810 MHz, 1 %, 7.12 W, P5 | 3D: claude(2556) 2%
15:41:29 gpu: 41, 495 MHz, 810 MHz, 4 %, 8.13 W, P5 | 3D: claude(2556) 2%
15:41:40 gpu: 41, 487 MHz, 7001 MHz, 2 %, 21.13 W, P3 | 3D: 
15:41:52 gpu: 42, 2617 MHz, 14001 MHz, 8 %, 29.71 W, P0 | 3D: chrome(43768) 10%
15:42:03 gpu: 58, 2850 MHz, 14001 MHz, 66 %, 131.51 W, P0 | 3D: chrome(18872) 54%, chrome(43768) 9%
15:42:14 gpu: 67, 2790 MHz, 14001 MHz, 99 %, 210.96 W, P0 | 3D: chrome(43768) 95%
15:42:25 gpu: 54, 2850 MHz, 14001 MHz, 57 %, 132.50 W, P0 | 3D: claude(2556) 1%, chrome(43768) 55%
15:42:36 gpu: 41, 390 MHz, 7001 MHz, 1 %, 21.35 W, P3 | 3D: chrome(43768) 3%
15:42:48 gpu: 53, 2857 MHz, 14001 MHz, 46 %, 108.11 W, P0 | 3D: chrome(43768) 46%
15:42:59 gpu: 51, 2850 MHz, 14001 MHz, 43 %, 129.36 W, P0 | 3D: chrome(43768) 55%
15:43:10 gpu: 49, 2850 MHz, 14001 MHz, 5 %, 121.77 W, P0 | 3D: chrome(43768) 31%
15:43:21 gpu: 43, 1447 MHz, 14001 MHz, 1 %, 28.03 W, P0 | 3D: 
15:43:33 gpu: 47, 2865 MHz, 14001 MHz, 31 %, 91.68 W, P0 | 3D: chrome(43768) 28%
15:43:44 gpu: 41, 330 MHz, 14001 MHz, 0 %, 22.04 W, P0 | 3D: 
15:43:55 gpu: 58, 2857 MHz, 14001 MHz, 81 %, 148.37 W, P0 | 3D: chrome(43768) 95%
15:44:06 gpu: 60, 2835 MHz, 14001 MHz, 99 %, 186.44 W, P0 | 3D: chrome(43768) 98%
15:44:18 gpu: 42, 472 MHz, 7001 MHz, 1 %, 21.19 W, P3 | 3D: 
15:44:29 gpu: 45, 2865 MHz, 14001 MHz, 1 %, 107.46 W, P0 | 3D: 
15:44:40 gpu: 40, 345 MHz, 810 MHz, 1 %, 6.30 W, P5 | 3D: chrome(18872) 1%
15:44:51 gpu: 39, 300 MHz, 810 MHz, 4 %, 5.51 W, P5 | 3D: chrome(18872) 1%
15:45:02 gpu: 41, 2625 MHz, 14001 MHz, 8 %, 22.72 W, P0 | 3D: chrome(4632) 7%
15:45:14 gpu: 42, 2220 MHz, 14001 MHz, 8 %, 31.85 W, P0 | 3D: chrome(4632) 7%
15:45:25 gpu: 43, 2850 MHz, 14001 MHz, 14 %, 42.61 W, P0 | 3D: chrome(4632) 34%
15:45:36 gpu: 55, 2857 MHz, 14001 MHz, 51 %, 130.29 W, P0 | 3D: chrome(4632) 53%
15:45:47 gpu: 53, 2850 MHz, 14001 MHz, 49 %, 110.97 W, P0 | 3D: chrome(4632) 54%
15:45:59 gpu: 46, 480 MHz, 7001 MHz, 2 %, 20.78 W, P3 | 3D: 
15:46:10 gpu: 54, 2415 MHz, 14001 MHz, 40 %, 65.06 W, P0 | 3D: claude(2556) 1%, chrome(4632) 84%
15:46:21 gpu: 56, 2842 MHz, 14001 MHz, 63 %, 129.00 W, P0 | 3D: chrome(4632) 73%
15:46:32 gpu: 54, 2842 MHz, 14001 MHz, 60 %, 136.73 W, P0 | 3D: claude(2556) 1%, chrome(4632) 68%
15:46:44 gpu: 52, 2857 MHz, 14001 MHz, 41 %, 84.08 W, P0 | 3D: chrome(4632) 9%
15:46:55 gpu: 44, 457 MHz, 14001 MHz, 2 %, 22.95 W, P0 | 3D: chrome(4632) 1%
15:47:06 gpu: 49, 2865 MHz, 14001 MHz, 41 %, 93.18 W, P0 | 3D: chrome(4632) 5%
15:47:17 gpu: 41, 420 MHz, 7001 MHz, 2 %, 21.20 W, P3 | 3D: chrome(4632) 8%
15:47:28 gpu: 50, 2835 MHz, 14001 MHz, 45 %, 121.84 W, P0 | 3D: chrome(4632) 60%
15:47:40 gpu: 50, 2842 MHz, 14001 MHz, 12 %, 137.47 W, P0 | 3D: chrome(4632) 78%
15:47:51 gpu: 50, 2872 MHz, 14001 MHz, 5 %, 148.99 W, P0 | 3D: 
15:48:02 gpu: 44, 1170 MHz, 14001 MHz, 17 %, 28.91 W, P0 | 3D: chrome(4632) 17%
```

## WebGPU


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 158 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-a087e65-webgpu-2/01-title.jpg) | 6.1 | 9.9 | 4.0 | 84 + 24, 14 ms | ok |
| [creator](../shots/2026-10-26-a087e65-webgpu-2/02-creator.jpg) | 11.6 | 15.1 | 1.5 | 84 + 29, 14 ms | ok |
| [town-noon](../shots/2026-10-26-a087e65-webgpu-2/03-town-noon.jpg) | 10.4 | 12.7 | 1.5 | 86 + 3, 10 ms | ok |
| [pack](../shots/2026-10-26-a087e65-webgpu-2/04-pack.jpg) | 5.3 | 18.1 | 1.5 | 86 + 3, 10 ms | ok |
| [map](../shots/2026-10-26-a087e65-webgpu-2/05-map.jpg) | 3.8 | 16.1 | 1.5 | 86 + 3, 10 ms | ok |
| [town-dusk](../shots/2026-10-26-a087e65-webgpu-2/06-town-dusk.jpg) | 13.0 | 33.8 | 1.5 | 86 + 3, 10 ms | over the 12 ms aim |
| [town-night](../shots/2026-10-26-a087e65-webgpu-2/07-town-night.jpg) | 13.5 | 21.6 | 1.5 | 86 + 3, 10 ms | over the 12 ms aim |
| [town-rain](../shots/2026-10-26-a087e65-webgpu-2/08-town-rain.jpg) | 15.3 | 23.8 | 1.5 | 86 + 3, 10 ms | over the 12 ms aim |
| [trade](../shots/2026-10-26-a087e65-webgpu-2/09-trade.jpg) | 13.0 | 16.9 | 1.5 | 86 + 3, 10 ms | over the 12 ms aim |
| [cellar](../shots/2026-10-26-a087e65-webgpu-2/10-cellar.jpg) | 4.9 | 14.0 | 4.0 | 85 + 24, 11 ms | ok |
| [barrow](../shots/2026-10-26-a087e65-webgpu-2/11-barrow.jpg) | 6.3 | 10.1 | 4.1 | 81 + 26, 9 ms | ok |
| [wild](../shots/2026-10-26-a087e65-webgpu-2/12-wild.jpg) | 7.7 | 11.1 | 1.5 | 81 + 33, 9 ms | ok |
| [fight](../shots/2026-10-26-a087e65-webgpu-2/13-fight.jpg) | 13.1 | 16.4 | 1.5 | 81 + 38, 9 ms | over the 12 ms aim |
| [talk](../shots/2026-10-26-a087e65-webgpu-2/14-talk.jpg) | 8.4 | 11.2 | 2.3 | 82 + 4, 9 ms | ok |

## WebGL2


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 187 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-a087e65-gl-2/01-title.jpg) | 9.4 | 40.0 | 4.0 | 80 + 27, 12 ms | ok |
| [creator](../shots/2026-10-26-a087e65-gl-2/02-creator.jpg) | 15.2 | 24.6 | 1.5 | 80 + 31, 12 ms | over the 12 ms aim |
| [town-noon](../shots/2026-10-26-a087e65-gl-2/03-town-noon.jpg) | 11.3 | 14.8 | 1.5 | 82 + 5, 10 ms | ok |
| [pack](../shots/2026-10-26-a087e65-gl-2/04-pack.jpg) | 12.7 | 20.0 | 1.5 | 82 + 5, 10 ms | over the 12 ms aim |
| [map](../shots/2026-10-26-a087e65-gl-2/05-map.jpg) | 11.9 | 14.6 | 1.5 | 82 + 5, 10 ms | ok |
| [town-dusk](../shots/2026-10-26-a087e65-gl-2/06-town-dusk.jpg) | 12.6 | 28.8 | 1.5 | 82 + 5, 10 ms | over the 12 ms aim |
| [town-night](../shots/2026-10-26-a087e65-gl-2/07-town-night.jpg) | 13.0 | 28.9 | 1.5 | 82 + 5, 10 ms | over the 12 ms aim |
| [town-rain](../shots/2026-10-26-a087e65-gl-2/08-town-rain.jpg) | 13.7 | 28.1 | 1.5 | 82 + 5, 10 ms | over the 12 ms aim |
| [trade](../shots/2026-10-26-a087e65-gl-2/09-trade.jpg) | 16.1 | 23.7 | 1.5 | 82 + 5, 10 ms | over the 12 ms aim |
| [cellar](../shots/2026-10-26-a087e65-gl-2/10-cellar.jpg) | 5.4 | 18.0 | 4.0 | 84 + 15, 10 ms | ok |
| [barrow](../shots/2026-10-26-a087e65-gl-2/11-barrow.jpg) | 8.4 | 27.2 | 4.0 | 80 + 16, 9 ms | ok |
| [wild](../shots/2026-10-26-a087e65-gl-2/12-wild.jpg) | 9.4 | 12.0 | 1.5 | 80 + 32, 9 ms | ok |
| [fight](../shots/2026-10-26-a087e65-gl-2/13-fight.jpg) | 13.0 | 14.9 | 1.5 | 80 + 37, 9 ms | over the 12 ms aim |
| [talk](../shots/2026-10-26-a087e65-gl-2/14-talk.jpg) | 8.2 | 9.8 | 2.6 | 80 + 4, 9 ms | ok |
