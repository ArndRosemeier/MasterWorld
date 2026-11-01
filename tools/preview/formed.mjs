/**
 * Pictures of tools/preview/formed.html (phase K gallery): `node tools/preview/formed.mjs out-dir [n] [size] [rocks] [floor seeds] [extra query]`.
 * Three sheets (one per rock setting: branchwork, maze, braids; n seeds each) and a few views from the floor.
 * A Vite dev server and SwiftShader; the caves are formed in workers of the page.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const out = process.argv[2] ?? 'shots/formed', n = process.argv[3] ?? '24', size = process.argv[4] ?? 'medium';
const rocks = (process.argv[5] ?? 'massive,jointed,thin-bedded').split(',');
// Seeds to look at from the floor (comma list, `none` for no floor views) and extra query (e.g. &frac=0.3).
const floors = (process.argv[6] ?? '1,2,3') === 'none' ? [] : (process.argv[6] ?? '1,2,3').split(',').map(Number), extra = process.argv[7] ?? '';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 5298 }, logLevel: 'silent' });
await server.listen();
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-angle=swiftshader', '--use-gl=angle', '--mute-audio'] });
const summary = {};
async function take(name, query, width, height) {
  const p = await browser.newPage({ viewport: { width, height } });
  p.on('pageerror', (e) => console.error(name, e.message));
  p.on('console', (m) => { if (m.type() === 'error') console.error(name, m.text()); });
  await p.goto(`http://localhost:5298/tools/preview/formed.html?${query}`);
  const info = JSON.parse(await p.waitForFunction(() => window.done, null, { timeout: 280000 }).then((h) => h.jsonValue()));
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: true });
  await p.close();
  return info;
}
for (const rock of rocks) {
  const info = await take(`sheet-${rock}-${size}`, `rock=${rock}&n=${n}&size=${size}&dress=1`, 2400, 300 * Math.ceil(Number(n) / 6));
  summary[rock] = { wallMs: info.wall, worstFormCarveMs: info.worstFormCarve, caves: info.stats };
  console.log(rock, size, 'wall', info.wall, 'ms for', n, 'caves; worst form+carve', info.worstFormCarve, 'ms');
  for (const seed of floors) console.log(' floor', seed, JSON.stringify(await take(`floor-${rock}-${size}-${seed}`, `view=floor&rock=${rock}&size=${size}&seed=${seed}${extra}`, 1650, 680)));
}
writeFileSync(`${out}/summary-${size}.json`, JSON.stringify(summary, null, 1));
await browser.close();
await server.close();
