/**
 * Every go-to of the debug menu (src/app/goPlaces.ts): `node tools/shot/goto.mjs [out dir] [label filter]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. Starts at the start town by day,
 * runs each go-to in turn (each finds the nearest of its kind or has one made), prints what it said, and shoots
 * where the hero ended up. Fails on a page error or a go-to that throws. JPEGs into `<out dir>` (default
 * `shots/goto/<date>-<commit>/`). A slow check (docs/CHECKS.md): GOTO_WAIT ms after each (default 2500).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000), WAIT = Number(process.env.GOTO_WAIT ?? 2500);
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/goto', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
const only = process.argv[3] ? new RegExp(process.argv[3], 'i') : null;
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&seed=masterworld${process.env.SET_GL === '1' ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
const labels = (await page.evaluate(() => window.game.goes)).filter((l) => !only || only.test(l));
let failed = false, n = 0;
for (const label of labels) {
  const t0 = Date.now();
  const said = await page.evaluate((l) => Promise.resolve(window.game.go(l)).then((r) => String(r), (e) => `THREW ${e}`), label);
  const ms = Date.now() - t0;
  if (said.startsWith('THREW')) failed = true;
  await page.waitForTimeout(WAIT);
  const file = join(dir, `${String(++n).padStart(2, '0')}-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 80, timeout: TIMEOUT });
  console.log(`${label} (${ms} ms): ${said}  ${file}`);
  while (errors.length) { failed = true; console.log(`  PAGE ERROR: ${errors.shift()}`); }
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
