/**
 * A house's door swings open as the hero comes to it and shuts behind them (render it, don't narrate it):
 * `node tools/shot/doors.mjs [out dir]` after `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference
 * machine. The hero starts in the street before the guild house's door (`room=guild-out`), walks in, turns and
 * walks out again. Checks: the door is shut at the start, opens wide as the hero comes through, and is shut again
 * once the hero has walked away; no shader built in play, no page errors. JPEGs into `<out dir>` (default
 * `shots/doors/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/doors', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair&room=guild-out${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(3000);
await page.click('canvas', { position: { x: 640, y: 360 } }).catch(() => {});

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
  console.log(file);
};
const door = () => page.evaluate(() => window.game.rooms?.doorOpen ?? -1);
/** The camera behind the hero, a little to the side and above. */
const behind = () => page.evaluate(() => {
  const p = window.game.player;
  p.heroCam.yaw = p.walker.yaw + 0.35;
  p.heroCam.pitch = -0.3;
  p.heroCam.zoom = 3.4;
});
/** The camera before the hero, looking back at them (and the door they walk away from). */
const ahead = () => page.evaluate(() => {
  const p = window.game.player;
  p.heroCam.yaw = p.walker.yaw + Math.PI - 0.35;
  p.heroCam.pitch = -0.25;
  p.heroCam.zoom = 4.5;
});
/** Who stands within the door's reach, and what they do (when it is open with nobody coming). */
const nearDoor = () => page.evaluate(() => {
  const r = window.game.rooms, d = r?.open?.b.door;
  if (!d) return 'no open house';
  const near = (x, z) => Math.hypot(x - d[0], z - d[1]) < 3.2;
  const p = window.game.player.walker.pos;
  const inside = (r.people() ?? []).filter((q) => near(q.x, q.z)).map((q) => `inside ${q.act}`);
  const town = r.open.door.town.life.agents.filter((a) => !a.hidden && near(a.x, a.z)).map((a) => `street ${a.act}`);
  return [near(p.x, p.z) ? 'hero' : '', ...inside, ...town].filter(Boolean).join(', ') || 'nobody';
});
/** Walk on (W held, Shift: walking pace) for `ms`, a picture every `every` ms; the widest the door stood open. */
const walk = async (tag, ms, every) => {
  let widest = 0;
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  for (let t = 0, i = 0; t < ms; t += every, i++) {
    await page.waitForTimeout(every);
    widest = Math.max(widest, await door());
    await shoot(`${tag}-${String(i).padStart(2, '0')}`);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  return widest;
};

await behind();
await page.waitForTimeout(800);
const d0 = await door();
console.log('start door', d0.toFixed(2));
if (d0 > 0.05) fail(`the door stands open before the hero comes (${d0.toFixed(2)}; near it: ${await nearDoor()})`);
await shoot('0-before');
const inWide = await walk('1-in', 5000, 500);
console.log('in: widest', inWide.toFixed(2));
if (inWide < 0.95) fail(`the door never opened wide on the way in (${inWide.toFixed(2)})`);
// Round, and out again.
await page.evaluate(() => { const p = window.game.player; p.walker.yaw += Math.PI; });
await ahead();
await page.waitForTimeout(500);
const outWide = await walk('2-out', 6500, 500);
console.log('out: widest', outWide.toFixed(2));
if (outWide < 0.95) fail(`the door never opened wide on the way out (${outWide.toFixed(2)})`);
await page.waitForTimeout(1500);
const d1 = await door();
console.log('end door', d1.toFixed(2));
if (d1 > 0.05) fail(`the door stays open behind the hero (${d1.toFixed(2)}; near it: ${await nearDoor()})`);
await page.evaluate(() => { const p = window.game.player; p.walker.yaw += Math.PI; });
await behind();
await page.waitForTimeout(600);
await shoot('3-shut-behind');
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'doors: FAILED' : 'doors: ok');
process.exit(failed ? 1 : 0);
