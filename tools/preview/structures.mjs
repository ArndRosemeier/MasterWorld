/**
 * Pictures of tools/preview/structures.html (Z4 galleries): `node tools/preview/structures.mjs out-dir [kinds] [from] [n] [views]`,
 * e.g. `node tools/preview/structures.mjs shots/z4 bridge,ruin 1 12 gallery,far,close`. One sheet per kind and view.
 * A Vite dev server; SwiftShader in the cloud (set CHROMIUM_PATH there), the machine's GPU on WebGPU with SHOT_GPU=1. Muted.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots/structures';
const kinds = (process.argv[3] ?? 'bridge,ruin').split(','), from = process.argv[4] ?? '1', n = process.argv[5] ?? '12';
const views = (process.argv[6] ?? 'gallery,far,close').split(',');
const gpu = !!process.env.SHOT_GPU;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5299 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined, channel: gpu ? 'chromium' : undefined,
  args: [...(gpu ? ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--use-gl=angle']), '--mute-audio'],
});
const summary = {};
for (const kind of kinds) for (const view of views) {
  const cols = 4, w = view === 'close' ? 560 : 640, h = view === 'close' ? 380 : 420;
  const p = await browser.newPage({ viewport: { width: w * cols, height: h * Math.ceil(Number(n) / cols) } });
  p.on('pageerror', (e) => console.error(kind, view, e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.error(kind, view, m.text().slice(0, 600)); });
  await p.goto(`http://localhost:5299/tools/preview/structures.html?kind=${kind}&from=${from}&n=${n}&view=${view}&w=${w}&h=${h}&cols=${cols}${gpu ? '' : '&gl=1'}`);
  const info = JSON.parse(await p.waitForFunction(() => window.done, null, { timeout: 290000 }).then((x) => x.jsonValue()));
  // The sheet is the page's last canvas (the renderer's own is not in the page).
  const url = await p.evaluate(() => [...document.querySelectorAll('canvas')].pop().toDataURL('image/jpeg', 0.9));
  writeFileSync(`${out}/${kind}-${view}-${from}.jpg`, Buffer.from(url.split(',')[1], 'base64'));
  summary[`${kind}-${view}`] = info;
  console.log(kind, view, info.error ?? `${info.ms} ms, worst build ${Math.max(...info.stats.map((s) => s.ms))} ms, most triangles ${Math.max(...info.stats.map((s) => s.tris))}`);
  await p.close();
}
writeFileSync(`${out}/summary.json`, JSON.stringify(summary, null, 1));
await browser.close();
await server.close();
