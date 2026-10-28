/**
 * The map hand-over in the world (D35, rule 11: shown, not told): `node tools/shot/handover.mjs [out dir]` after
 * `npm run build` and `npm run packs`, on the reference machine, muted (launch.mjs). The hero talks with the
 * innkeeper by day (`talk=inn`), asks for news, and is told of a place: the hero holds the map out, the
 * innkeeper takes it and marks it, and hands it back. Shots: held out, being marked, handed back. Checks: the
 * innkeeper is seen marking it (activity 'mark'), the talk tells nothing of it, no shader built in play, no page
 * errors. JPEGs into `<out dir>` (default `shots/handover/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { drawnNear, shadersQuiet } from './wait.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/handover', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&talk=inn${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await drawnNear(page, 15000);
await shadersQuiet(page, 4000);

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT });
  console.log(file);
};
const t0 = Date.now(), at = (s) => page.waitForTimeout(Math.max(0, t0 + s * 1000 - Date.now()));
// Asked for news: told of a place, the map is handed over.
const told = await page.evaluate(() => {
  const t = window.game.talk;
  if (!t?.open) return 'no talk open';
  t.choose('news');
  return '';
});
if (told) fail(told);
const seen = { mark: false };
const watch = setInterval(async () => {
  const act = await page.evaluate(() => window.game.talk?.partner?.act ?? null).catch(() => null);
  if (act === 'mark') seen.mark = true;
}, 100);
await at(0.6); await shoot('01-held-out');
await at(1.6); await shoot('02-marked');
await at(3.1); await shoot('03-handed-back');
await at(4.2);
clearInterval(watch);
if (!seen.mark) fail('the innkeeper was never seen marking the map');
const lines = await page.evaluate(() => [...document.querySelectorAll('.talk .lines p')].map((p) => p.textContent));
if (lines.some((l) => /hold out your map|marks the place/i.test(l ?? ''))) fail('the talk still tells of the hand-over');
const sh = await page.evaluate(() => window.shaders?.summary() ?? null);
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { console.log(errors.join('\n')); failed = true; }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
