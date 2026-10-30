/**
 * The portal stone (show, don't tell): `node tools/shot/stone.mjs [out dir]` after `npm run build` and `npm run
 * packs`, SHOT_GPU=1 on the reference machine. The hero takes the stone out of the pack (I, a click on its card): it
 * fills in before them. A click on the first glyph sends a beam to the floor, which glows and fades (home). Some way
 * off, the second glyph tears a portal open beyond the stone, its twin at home; the hero walks through and comes out
 * at home, looks back through; opening one by home fizzles; one opened elsewhere closes the old far one. Checks:
 * the pack card raises it, each glyph takes, the hero crosses, the counts, no shader built in play (no VIOLATION),
 * no page errors. JPEGs into `<out dir>` (default `shots/stone/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/stone', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
await page.goto(`${base}?title=0&day=0&hour=${process.env.STONE_HOUR ?? 17}&weather=fair&hud${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(3000);

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
  console.log(file);
};
const state = () => page.evaluate(() => {
  const g = window.game, w = g.player.walker.pos;
  return { x: w.x, y: w.y, z: w.z, yaw: g.player.walker.yaw, raised: g.stone.raised, counts: { ...g.stone.counts }, home: g.stone.stone.home, far: g.stone.stone.far, passed: g.portals.passed };
});
/** The camera behind the hero, `turn` rad round from behind. */
const look = (turn = 0, zoom = 3.6, pitch = -0.18) => page.evaluate(([turn, zoom, pitch]) => {
  const p = window.game.player;
  p.heroCam.yaw = p.walker.yaw + turn;
  p.heroCam.pitch = pitch;
  p.heroCam.zoom = zoom;
}, [turn, zoom, pitch]);
/** Stand `ahead` m along the way the hero faces and `side` m to the right, turned by `turn` rad. */
const move = (ahead, side, turn = 0) => page.evaluate(([ahead, side, turn]) => {
  const p = window.game.player, w = p.walker, fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw);
  p.teleport(w.pos.x + fx * ahead - fz * side, undefined, w.pos.z + fz * ahead + fx * side, w.yaw + turn);
}, [ahead, side, turn]);
/** Click a glyph where it is on the screen. */
const press = async (glyph) => {
  const at = await page.evaluate((g) => window.game.stone.glyphOnScreen(g), glyph);
  console.log(`glyph ${glyph} at ${at.x.toFixed(0)},${at.y.toFixed(0)} (reach ${at.reach.toFixed(0)} px)`);
  await page.mouse.click(at.x, at.y);
};
/** Hold the stone up (by its card in the pack: I, then a click). */
const raise = async (byPack) => {
  if (byPack) {
    await page.keyboard.press('KeyI');
    await page.waitForTimeout(900);
    const card = page.locator('.use[title="Hold it up"]').first();
    if (!(await card.count())) { fail('no portal stone card in the pack'); await page.evaluate(() => window.game.stone.holdUp()); }
    else await card.click();
  } else await page.evaluate(() => window.game.stone.holdUp());
  await page.waitForTimeout(300);
  if (!(await state()).raised) fail('the stone did not come up');
  await look();
  await page.waitForTimeout(1300);
};

const s0 = await state();
console.log('start', JSON.stringify(s0));
await look();
await raise(true);
await shoot('1-stone-held-up');
await press(1);
await page.waitForTimeout(150);
await shoot('2-beam');
await page.waitForTimeout(900);
await shoot('3-floor-glows');
await page.waitForTimeout(2500);
await shoot('4-floor-fading');
const s1 = await state();
if (s1.raised) fail('the stone stayed up after the glyph');
if (s1.counts.home !== 1 || !s1.home) fail(`home not marked (${JSON.stringify(s1.counts)})`);
// Away from home: turn round, go 30 m off, open a portal there (it leads home).
await move(-6, 0, Math.PI);
await move(24, 0, 0);
await page.waitForTimeout(2500);
await raise(false);
await press(2);
await page.waitForTimeout(250);
await shoot('5-portal-tearing-open');
await page.waitForTimeout(1500);
await shoot('6-portal-open');
const s2 = await state();
if (s2.counts.opened !== 1) fail(`no portal opened (${JSON.stringify(s2.counts)}); fizzled ${s2.counts.fizzled}`);
await look(0.9, 5, -0.15);
await page.waitForTimeout(600);
await shoot('7-portal-from-the-side');
await look(Math.PI - 0.3, 7, -0.12);
await page.waitForTimeout(600);
await shoot('8-portal-from-behind');
// Walk through it.
await look();
await page.keyboard.down('KeyW');
await page.waitForFunction((n) => window.game.portals.passed > n, s2.passed, { timeout: 8000 }).catch(() => fail('the hero did not go through'));
await page.waitForTimeout(500);
await page.keyboard.up('KeyW');
await page.waitForTimeout(800);
const s3 = await state();
console.log('through', JSON.stringify(s3));
if (s1.home && Math.hypot(s3.x - s1.home.x, s3.z - s1.home.z) > 5) fail('not at home after going through');
await shoot('9-out-at-home');
await look(Math.PI, 4.5, -0.12);
await page.waitForTimeout(700);
await shoot('10-looking-back-through');
// By home a portal fizzles.
await look();
await raise(false);
await press(2);
await page.waitForTimeout(200);
await shoot('11-fizzle');
await page.waitForTimeout(1200);
const s4 = await state();
if (s4.counts.fizzled < 1) fail('opening by home did not fizzle');
// Elsewhere: the old far portal closes, home leads to the new one.
await move(0, 20, Math.PI / 2);
await page.waitForTimeout(2000);
await raise(false);
await press(2);
await page.waitForTimeout(1600);
await shoot('12-second-portal');
const s5 = await state();
if (s5.counts.opened !== 2 || !s5.far || (s2.far && Math.hypot(s5.far.x - s2.far.x, s5.far.z - s2.far.z) < 1)) fail(`the second portal did not replace the first (${JSON.stringify(s5)})`);
if (Math.hypot(s5.home.x - s1.home.x, s5.home.z - s1.home.z) > 1e-6) fail('home moved');
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'stone: FAILED' : 'stone: ok');
process.exit(failed ? 1 : 0);
