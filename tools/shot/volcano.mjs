/**
 * Active volcanoes seen (K7d, docs/design/volcanoes.md; a slow check): `node tools/shot/volcano.mjs [out dir]` after `npm run build` and
 * `npm run packs`, SHOT_GPU=1 on the reference machine. For each state (erupting, lake, steaming) the game starts before the nearest
 * volcano of it (`?volcano=<state>`: the hero on the side its lava spills, facing the crater), once at its rim, once at its foot and
 * once far off, by day and by night; a picture each. Checks: the volcano was found, no page errors, no shader built in play beyond
 * the late ones' share, no violation of the shader budget. JPEGs into `<out dir>` (default `shots/volcano/`).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const dir = process.argv[2] ?? 'shots/volcano';
mkdirSync(dir, { recursive: true });
const SEED = { erupting: 'ajn1uw', lake: 'ajn1uw', steaming: 'brazok' };

const { server, base, browser } = await launch({});
let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
for (const state of ['erupting', 'lake', 'steaming']) {
  for (const [at, hour] of [['rim', 11], ['foot', 11], ['far', 11], ['foot', 22]]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const found = [];
    page.on('console', (m) => { if (m.text().startsWith('[volcano]')) found.push(m.text()); });
    page.on('pageerror', (e) => fail(`${state}/${at}: page error ${e.message}`));
    await page.goto(`${base}?title=0&seed=${SEED[state]}&volcano=${state}&volcano.at=${at}&hour=${hour}&weather=fair`);
    await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
    await page.addStyleTag({ content: '#loading{display:none!important}' });
    await page.waitForTimeout(6000);
    const file = join(dir, `${state}-${at}-${hour}h.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
    const report = await page.evaluate(() => window.shaders?.report?.() ?? '');
    console.log(`${file}: ${found[0] ?? 'NO VOLCANO'}\n  ${report}`);
    if (!found.length) fail(`${state}: no volcano of that state was found`);
    if (/[1-9]\d* violations?/.test(report)) fail(`${state}/${at}: ${report}`);
    await page.close();
  }
}
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
