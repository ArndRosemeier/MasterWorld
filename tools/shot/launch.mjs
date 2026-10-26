/**
 * The production build served and a Chromium to look at it (shot.mjs, title.mjs, tools/assets/peoples.mjs):
 * SwiftShader by default (no GPU needed, for the cloud container; set CHROMIUM_PATH there), the machine's
 * own GPU with SHOT_GPU=1; `headed` opens a real window (perf.mjs); `args` adds browser switches (set.mjs:
 * no frame cap, so frame times show the work and not the screen's refresh).
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The animal packs `npm run packs` copies (its ANIMALS list) that the build lacks. A build from packs copied before
 * a kind was added serves the page itself for that pack's manifest (a JSON error per body, and no animal).
 */
export function missingPacks(dist = join(root, 'dist')) {
  const m = readFileSync(join(root, 'tools/packs/actors.mjs'), 'utf8').match(/const ANIMALS = \[([^\]]*)\]/);
  if (!m) throw new Error('tools/packs/actors.mjs: no ANIMALS list');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((k) => !existsSync(join(dist, 'packs', k, 'manifest.json')));
}

/** The Actors version the build's packs were copied from, when it is not the installed one (else ''). */
export function stalePacks(dist = join(root, 'dist')) {
  const want = JSON.parse(readFileSync(join(root, 'node_modules/@actors/generator/package.json'), 'utf8')).version;
  const stamp = join(dist, 'packs/human/.selection');
  const have = existsSync(stamp) ? JSON.parse(readFileSync(stamp, 'utf8')).version : 'none';
  return have === want ? '' : `dist/packs are from Actors ${have}, installed is ${want}`;
}

export async function launch({ headed = false, args: extra = [] } = {}) {
  const missing = missingPacks();
  if (missing.length) throw new Error(`dist/packs has no ${missing.join(', ')}: run \`npm run packs\` and \`npm run build\` first`);
  const stale = stalePacks();
  if (stale) throw new Error(`${stale}: run \`npm run packs\` and \`npm run build\` first`);
  const server = await preview({ preview: { port: 5202, strictPort: false }, logLevel: 'silent' });
  const base = server.resolvedUrls.local[0];
  const gpu = !!process.env.SHOT_GPU;
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    channel: gpu ? 'chromium' : undefined,
    args: [...(gpu
      ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist']
      : ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist']), ...extra],
  });
  return { server, base, browser };
}
