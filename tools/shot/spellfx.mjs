/**
 * The spell lab's pictures (spell-lab.html): `node tools/shot/spellfx.mjs [out dir] [spell ids,…]` after `npm run
 * build`, SHOT_GPU=1 on the reference machine. Every spell (or those named) at its moments: gathering, just let
 * go, in flight, striking, a breath after, fading; each moment also from the side for the first spells. JPEGs into
 * `<out dir>` (default `shots/spellfx/<date>-<commit>/`), and the shader monitor's verdict (F3: nothing is built once
 * the lab plays; every spell shader was built behind its load). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/spellfx', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
const only = process.argv[3] ? process.argv[3].split(',') : null;
const cams = (process.env.SPELLFX_CAMS ?? 'behind').split(',');
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: Number(process.env.SPELLFX_W ?? 1280), height: Number(process.env.SPELLFX_H ?? 720) } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}spell-lab.html${process.env.SHOT_GPU ? '' : '?gl'}`);
await page.waitForFunction(() => window.__labReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#bar{display:none!important}' });
const ids = (await page.evaluate(() => window.lab.spells)).filter((id) => !only || only.includes(id));
const before = await page.evaluate(() => window.lab.shaders().summary());
for (const id of ids) {
  const tl = await page.evaluate((id) => window.lab.timeline(id), id);
  const moments = [
    ['gather', tl.cast * 0.75],
    ['loose', tl.cast + 0.06],
    ...(tl.strike > tl.cast + 0.1 ? [['flight', (tl.cast + tl.strike) / 2]] : []),
    ['strike', tl.strike + 0.08],
    ['after', tl.strike + 0.35],
    ['late', tl.strike + 1.1],
  ].filter(([, t]) => t > 0.01);
  for (const cam of cams) {
    for (const [what, t] of moments) {
      const drawn = await page.evaluate(([id, t, cam]) => window.lab.seek(id, t, cam), [id, t, cam]);
      const file = join(dir, `${id}-${cam}-${what}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
      console.log(`${file} (${t.toFixed(2)} s: ${drawn.sprites} sprites, ${drawn.solids} solids)`);
    }
  }
}
const after = await page.evaluate(() => { const m = window.lab.shaders(); return { ...m.summary(), lines: m.violations(), built: m.events.filter((e) => e.phase === 'run').map((e) => e.what) }; });
const spellBuilds = after.built.filter((w) => /spell/i.test(w));
console.log(`F3: ${after.violations} shader violations · ${after.run - before.run} builds while playing${spellBuilds.length ? ` · spell shaders built in play: ${spellBuilds.join(', ')}` : ''} · worst build ${after.worstMs.toFixed(1)} ms`);
let failed = !!spellBuilds.length || after.violations > 0;
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
