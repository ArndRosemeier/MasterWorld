# Shot sets 3e389c3 (RTX 5070)

WebGPU (SET_GL=0), then WebGL2. Folders: shots/2026-10-26-3e389c3-webgpu, shots/2026-10-26-3e389c3-gl.

## WebGPU


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGPU · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 162 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-3e389c3-webgpu/01-title.jpg) | 7.5 | 14.8 | 4.1 | 86 + 12, 8 ms | ok |
| [creator](../shots/2026-10-26-3e389c3-webgpu/02-creator.jpg) | 10.9 | 13.0 | 1.5 | 86 + 27, 8 ms | ok |
| [town-noon](../shots/2026-10-26-3e389c3-webgpu/03-town-noon.jpg) | 12.0 | 31.7 | 1.5 | 86 + 3, 9 ms | ok |
| [pack](../shots/2026-10-26-3e389c3-webgpu/04-pack.jpg) | 8.0 | 20.2 | 1.5 | 86 + 3, 9 ms | ok |
| [map](../shots/2026-10-26-3e389c3-webgpu/05-map.jpg) | 13.9 | 20.4 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [town-dusk](../shots/2026-10-26-3e389c3-webgpu/06-town-dusk.jpg) | 14.8 | 34.0 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [town-night](../shots/2026-10-26-3e389c3-webgpu/07-town-night.jpg) | 14.7 | 32.0 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [town-rain](../shots/2026-10-26-3e389c3-webgpu/08-town-rain.jpg) | 47.6 | 111.3 | 1.5 | 86 + 3, 9 ms | over 16.7 ms; over twice the town at noon |
| [trade](../shots/2026-10-26-3e389c3-webgpu/09-trade.jpg) | 15.0 | 27.6 | 1.5 | 86 + 3, 9 ms | over the 12 ms aim |
| [cellar](../shots/2026-10-26-3e389c3-webgpu/10-cellar.jpg) | 5.1 | 14.1 | 4.0 | 83 + 26, 10 ms | 2 shader violations |
| [barrow](../shots/2026-10-26-3e389c3-webgpu/11-barrow.jpg) | 5.0 | 8.7 | 4.0 | 81 + 26, 9 ms | ok |
| [wild](../shots/2026-10-26-3e389c3-webgpu/12-wild.jpg) | 10.6 | 15.8 | 1.5 | 81 + 33, 9 ms | 1 shader violations |
| [fight](../shots/2026-10-26-3e389c3-webgpu/13-fight.jpg) | 12.0 | 17.4 | 1.5 | 81 + 38, 9 ms | 2 shader violations |
| [talk](../shots/2026-10-26-3e389c3-webgpu/14-talk.jpg) | 8.4 | 11.4 | 2.3 | 82 + 4, 14 ms | ok |

### cellar

- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync) started 13 ms after a build of 25 ms ended (minimum 51 ms): "MeshPhysicalNodeMaterial" (node-async)
- run: "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync) started 1 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of Mesh flora<Point Light Shadow [ torch shadow light ] - Face 1" (node-sync)

### wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

### fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)

## WebGL2


ANGLE (NVIDIA, NVIDIA GeForce RTX 5070 (0x00002F04) Direct3D11 vs_5_0 ps_5_0, D3D11) · WebGL 2 · 1920×1080 · frame times over 2 s once no shader was built for 1.5 s (at most 4 s), no frame cap · run took 210 s

| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |
|---|---|---|---|---|---|
| [title](../shots/2026-10-26-3e389c3-gl/01-title.jpg) | 6.9 | 31.8 | 4.0 | 80 + 27, 9 ms | ok |
| [creator](../shots/2026-10-26-3e389c3-gl/02-creator.jpg) | 12.7 | 27.6 | 1.5 | 80 + 31, 9 ms | over the 12 ms aim |
| [town-noon](../shots/2026-10-26-3e389c3-gl/03-town-noon.jpg) | 13.8 | 29.9 | 1.5 | 82 + 5, 8 ms | over the 12 ms aim |
| [pack](../shots/2026-10-26-3e389c3-gl/04-pack.jpg) | 15.1 | 19.9 | 1.5 | 82 + 5, 8 ms | over the 12 ms aim |
| [map](../shots/2026-10-26-3e389c3-gl/05-map.jpg) | 15.1 | 19.4 | 1.5 | 82 + 5, 8 ms | over the 12 ms aim |
| [town-dusk](../shots/2026-10-26-3e389c3-gl/06-town-dusk.jpg) | 21.2 | 34.6 | 1.5 | 82 + 5, 8 ms | over 16.7 ms |
| [town-night](../shots/2026-10-26-3e389c3-gl/07-town-night.jpg) | 20.7 | 32.4 | 1.5 | 82 + 5, 8 ms | over 16.7 ms |
| [town-rain](../shots/2026-10-26-3e389c3-gl/08-town-rain.jpg) | 95.5 | 120.6 | 1.7 | 82 + 5, 8 ms | over 16.7 ms; over twice the town at noon |
| [trade](../shots/2026-10-26-3e389c3-gl/09-trade.jpg) | 18.9 | 22.5 | 1.5 | 82 + 5, 8 ms | over 16.7 ms |
| [cellar](../shots/2026-10-26-3e389c3-gl/10-cellar.jpg) | 7.6 | 25.6 | 4.0 | 83 + 14, 11 ms | ok |
| [barrow](../shots/2026-10-26-3e389c3-gl/11-barrow.jpg) | 16.0 | 78.1 | 4.0 | 80 + 14, 10 ms | over the 12 ms aim |
| [wild](../shots/2026-10-26-3e389c3-gl/12-wild.jpg) | 14.9 | 31.4 | 1.5 | 80 + 31, 10 ms | over the 12 ms aim; 1 shader violations |
| [fight](../shots/2026-10-26-3e389c3-gl/13-fight.jpg) | 14.4 | 29.1 | 1.5 | 80 + 36, 10 ms | over the 12 ms aim; 2 shader violations |
| [talk](../shots/2026-10-26-3e389c3-gl/14-talk.jpg) | 22.0 | 38.6 | 3.0 | 80 + 5, 18 ms | over 16.7 ms |

### wild

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)

### fight

- run: "ShadowMaterial of SkinnedMesh body<deer<creatures" (node-sync) started 0 ms after a build of 2 ms ended (minimum 3 ms): "ShadowMaterial of SkinnedMesh eyes<deer<creatures" (node-sync)
- run: "ShadowMaterial of SkinnedMesh body<wolf<creatures" (node-sync) started 0 ms after a build of 1 ms ended (minimum 2 ms): "ShadowMaterial of SkinnedMesh eyes<wolf<creatures" (node-sync)
