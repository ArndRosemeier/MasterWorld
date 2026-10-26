/**
 * The production build served and a Chromium to look at it (shot.mjs, title.mjs, tools/assets/peoples.mjs):
 * SwiftShader by default (no GPU needed, for the cloud container; set CHROMIUM_PATH there), the machine's
 * own GPU with SHOT_GPU=1; `headed` opens a real window (perf.mjs).
 */
import { chromium } from 'playwright';
import { preview } from 'vite';

export async function launch({ headed = false } = {}) {
  const server = await preview({ preview: { port: 5202, strictPort: false }, logLevel: 'silent' });
  const base = server.resolvedUrls.local[0];
  const gpu = !!process.env.SHOT_GPU;
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    channel: gpu ? 'chromium' : undefined,
    args: gpu
      ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
      : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
  });
  return { server, base, browser };
}
