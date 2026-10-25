/**
 * Bakes the title card's turning figures: `npm run build`, then `node tools/assets/peoples.mjs`
 * (SHOT_GPU=1 on a desktop with a graphics card; minutes in SwiftShader). Opens the build at
 * `?gl&bake=peoples` (src/app/bake.ts) and writes public/title/peoples/<people>.webp, one row of pictures each.
 */
import fs from 'node:fs';
import { launch } from '../shot/launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 1800000);
const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(`${base}?gl&bake=peoples`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
const baked = await page.evaluate(() => window.__bake);
fs.mkdirSync('public/title/peoples', { recursive: true });
for (const [id, url] of Object.entries(baked)) {
  const file = `public/title/peoples/${id}.webp`;
  fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
  console.log(`${file}: ${fs.statSync(file).size} bytes`);
}
await browser.close();
await server.close();
