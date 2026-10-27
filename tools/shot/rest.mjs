/**
 * Resting (sitting down on the ground to heal): `node tools/shot/rest.mjs [out dir]` after `npm run build` and
 * `npm run packs` (the sit clips), SHOT_GPU=1 on the reference machine. One page in the start town at mid-morning:
 * the hero, hurt, sits down with the rest key; pictures while sitting down, sat (from the side and the front) and
 * standing up again. Checks: resting heals at least twice as fast as standing still, walking off and the key again
 * stand the hero up. JPEGs into `<out dir>` (default `shots/rest/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/rest', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(2000);
await page.click('canvas', { position: { x: 960, y: 540 } }).catch(() => {});

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
/** The camera round the hero: `turn` rad from behind, `zoom` m away. */
const look = (turn, zoom = 3.2) => page.evaluate(([turn, zoom]) => {
  const p = window.game.player;
  p.heroCam.yaw = p.walker.yaw + turn;
  p.heroCam.pitch = -0.25;
  p.heroCam.zoom = zoom;
}, [turn, zoom]);
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT });
  console.log(file);
};
/** Health regained over `secs` s from half health. */
const regain = async (secs) => {
  const from = await page.evaluate(() => { const h = window.game.character; h.health = Math.round(h.maxHealth / 2); return h.health; });
  await page.waitForTimeout(secs * 1000);
  return (await page.evaluate(() => window.game.character.health)) - from;
};
const resting = () => page.evaluate(() => window.game.character.resting);

await look(Math.PI * 0.55);
const stood = await regain(5);
await page.keyboard.press('KeyX');
if (!(await resting())) fail('the rest key did not sit the hero down');
await page.waitForTimeout(600);
await shoot('1-sitting-down');
await page.waitForTimeout(1500);
await shoot('2-sat-side');
const sat = await regain(5);
await look(Math.PI * 0.95, 3.6);
await page.waitForTimeout(400);
await shoot('3-sat-front');
console.log(`health back in 5 s: standing still ${stood.toFixed(1)}, resting ${sat.toFixed(1)}`);
if (!(sat >= stood * 2)) fail('resting does not heal at least twice as fast');
await look(Math.PI * 0.55);
await page.keyboard.press('KeyX');
if (await resting()) fail('the rest key again did not stand the hero up');
await page.waitForTimeout(500);
await shoot('4-standing-up');
await page.waitForTimeout(1200);
await shoot('5-stood');
// Walking off ends it.
await page.keyboard.press('KeyX');
await page.waitForTimeout(1500);
await page.keyboard.down('KeyW');
await page.waitForTimeout(400);
await page.keyboard.up('KeyW');
if (await resting()) fail('walking off did not end resting');
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
