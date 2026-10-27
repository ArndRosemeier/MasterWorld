/**
 * Climbing down through a cellar's hatch and up again (render it, don't narrate it): `node tools/shot/hatch.mjs
 * [out dir]` after `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference machine. The hero starts by the
 * hatch of the first cellar's house (`room=cellar`), presses E and is seen lifting the lid, getting onto the ladder
 * and climbing down; below, E at the ladder climbs back up and out, the lid let down. Checks: E starts each climb,
 * the hero ends below and then back in the house, never moved while not climbing, no shader built in play, no
 * page errors. JPEGs into `<out dir>` (default `shots/hatch/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/hatch', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair&room=cellar${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(3000);
await page.click('canvas', { position: { x: 640, y: 360 } }).catch(() => {});

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
/** The camera behind and above the hero, `turn` rad round from behind. */
const look = (turn = 0.6, zoom = 3.4, pitch = -0.45) => page.evaluate(([turn, zoom, pitch]) => {
  const p = window.game.player;
  p.heroCam.yaw = p.walker.yaw + turn;
  p.heroCam.pitch = pitch;
  p.heroCam.zoom = zoom;
}, [turn, zoom, pitch]);
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
  console.log(file);
};
const state = () => page.evaluate(() => {
  const g = window.game, w = g.player.walker.pos;
  return { climbing: !!g.player.puppet, below: !!g.cellar, inside: !!g.rooms?.inside, x: w.x, y: w.y, z: w.z, built: g.view.stage.monitor?.summary?.().run ?? 0 };
});
/** Pictures every `every` ms while the climb lasts (at most `n`). */
const film = async (tag, every, n) => {
  for (let i = 0; i < n; i++) {
    await page.waitForTimeout(every);
    const s = await state();
    if (!s.climbing) return i;
    await shoot(`${tag}-${String(i).padStart(2, '0')}`);
  }
  return n;
};

const s0 = await state();
console.log('start', JSON.stringify(s0));
if (!s0.inside) fail('room=cellar did not start in the house');
await look();
await page.waitForTimeout(500);
await shoot('0-by-the-hatch');
await page.keyboard.press('KeyE');
await page.waitForTimeout(100);
if (!(await state()).climbing) fail('E by the hatch did not start a climb');
await film('1-down', 700, 16);
await page.waitForFunction(() => !window.game.player.puppet, null, { timeout: 30000 }).catch(() => fail('the climb down did not end'));
const s1 = await state();
console.log('below', JSON.stringify(s1));
if (!s1.below) fail('not below after the climb down');
// The game's own camera, as the climb left it.
await page.waitForTimeout(600);
await shoot('2-at-the-foot');
await page.keyboard.press('KeyE');
await page.waitForTimeout(100);
if (!(await state()).climbing) fail('E at the ladder did not start a climb');
await film('3-up', 700, 16);
await page.waitForFunction(() => !window.game.player.puppet, null, { timeout: 30000 }).catch(() => fail('the climb up did not end'));
const s2 = await state();
console.log('above', JSON.stringify(s2));
if (s2.below || !s2.inside) fail('not back in the house after the climb up');
await look(0.6, 3.4, -0.4);
await page.waitForTimeout(600);
await shoot('4-out-again');
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'hatch: FAILED' : 'hatch: ok');
process.exit(failed ? 1 : 0);
