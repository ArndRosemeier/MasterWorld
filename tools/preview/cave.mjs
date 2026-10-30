/** Pictures of tools/preview/cave.html: `node tools/preview/cave.mjs out [n]` (a Vite dev server and SwiftShader). */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots/cave-preview', n = process.argv[3] ?? '4';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5299 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--use-gl=angle', '--mute-audio'] });
for (const view of ['floor', 'floor2', 'above', 'shaft', 'wall']) {
  const p = await browser.newPage({ viewport: { width: 1100, height: 650 } });
  p.on('pageerror', (e) => console.error(e.message));
  await p.goto(`http://localhost:5299/tools/preview/cave.html?n=${n}&view=${view}`);
  console.log(view, await p.waitForFunction(() => window.done, null, { timeout: 120000 }).then((h) => h.jsonValue()));
  await p.screenshot({ path: `${out}/${n}-${view}.png` });
  await p.close();
}
await browser.close();
await server.close();
