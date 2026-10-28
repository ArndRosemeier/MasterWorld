/**
 * Wounded foes limp and slow (sim/creatures.ts paceOf, render/limp.ts): `node tools/shot/limp.mjs [out dir]`
 * after `npm run packs` and `npm run build`, SHOT_GPU=1 on the reference machine. For wolves and bandits out
 * on the land and goblins and rats in the town's cellar, the nearest one is brought to a fifth of its health
 * and turned to run; a strip of pictures follows it limping off, and its measured pace is printed beside its
 * whole one (it must be slower than the hero's run, 5.2 m/s). JPEGs into `<out dir>` (default
 * `shots/limp/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { meet } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/limp', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const SCENES = [
  { id: 'wolves', query: '&hour=10&weather=fair', wild: 'wolves' },
  { id: 'bandits', query: '&hour=10&weather=fair', wild: 'bandits' },
  { id: 'goblins', query: '&hour=12&cellar=2&dweller=goblins' },
  { id: 'rats', query: '&hour=12&cellar=2&dweller=rats' },
];
const only = process.env.LIMP_ONLY?.split(',');
const FIGHT = `(() => { const g = window.game; return g.cellars?.fightBelow ?? g.wild?.encounters.find((e) => e.leading) ?? null; })()`;

const { server, base, browser } = await launch({});
const errors = [];
let failed = false;
for (const s of SCENES.filter((x) => !only || only.includes(x.id))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`${s.id}: ${e.message}`));
  await page.goto(`${base}?title=0&day=0&weather=fair${gl ? '&gl' : ''}${s.query}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  if (s.wild) await meet(s.wild, 9)(page);
  const ok = await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false);
  if (!ok) { console.log(`${s.id}: no fight found`); failed = true; await page.close(); continue; }
  // The hero 3 m off the nearest one, looking at it; it is brought low and runs.
  await page.evaluate(`(() => {
    const g = window.game, f = ${FIGHT}, O = f.spellFrame().offset, p = g.player.walker.pos;
    const c = f.delve.den.alive.reduce((a, b) => Math.hypot(b.x + O.x - p.x, b.z + O.z - p.z) < Math.hypot(a.x + O.x - p.x, a.z + O.z - p.z) ? b : a);
    const cx = c.x + O.x, cz = c.z + O.z, l = Math.max(0.01, Math.hypot(p.x - cx, p.z - cz));
    const x = cx + (p.x - cx) / l * 3, z = cz + (p.z - cz) / l * 3;
    g.player.teleport(x, c.y + O.y, z, Math.atan2(x - cx, z - cz));
    g.character.health = g.character.maxHealth * 5;
    c.health = c.def.health * 0.2;
    c.state = 'fight';
    f.delve.den.frighten(c);
    window.__limper = c;
  })()`);
  await page.waitForTimeout(400);
  const from = await page.evaluate(() => { const c = window.__limper; return { x: c.x, z: c.z, t: performance.now() }; });
  for (let i = 0; i < 6; i++) {
    await page.screenshot({ path: join(dir, `${s.id}-${i}.jpg`), type: 'jpeg', quality: 85 });
    await page.waitForTimeout(120);
  }
  const to = await page.evaluate(() => { const c = window.__limper; return { x: c.x, z: c.z, t: performance.now(), whole: c.def.speed, state: c.state }; });
  const pace = Math.hypot(to.x - from.x, to.z - from.z) / ((to.t - from.t) / 1000);
  console.log(`${s.id}: at a fifth of its health it went ${pace.toFixed(1)} m/s (whole ${to.whole} m/s), ${to.state}`);
  if (pace >= 5.2) { console.log(`${s.id}: outruns the hero`); failed = true; }
  await page.close();
}
for (const e of errors) console.log(`page error: ${e}`);
await browser.close();
await server.close();
console.log(`pictures in ${dir}`);
if (failed || errors.length) process.exit(1);
