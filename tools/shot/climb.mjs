/**
 * The hero climbing a mesa wall (D56, L4; render it, don't narrate it): `node tools/shot/climb.mjs [out dir]` after
 * `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference machine. The hero starts at the foot of a
 * stretch of wall with holds by the start valley, faces it and holds W: seen gripping the rock, going up it hand
 * over hand and pulling up over its top (or over a bench part way). Checks: the hero gets onto the face, climbs more
 * than 10 m, pulls up over a top, no page errors. JPEGs into `<out dir>` (default `shots/climb/<date>-<commit>/`).
 * A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0' && !process.env.SHOT_GPU;
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/climb', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });
/** A wall with holds south of the start town (seed masterworld): its foot, and the way into it. */
const FOOT = { x: -30826, z: 35266 }, IN = { x: 0.259, z: 0.966 };

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
await page.goto(`${base}?seed=masterworld&title=0&hour=15&weather=clear&pos=${FOOT.x},${FOOT.z}${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
// The late shader kinds build after play starts (MW #264): the ground shows untextured until they are in.
await page.waitForTimeout(12000);
await page.click('canvas', { position: { x: 640, y: 360 } }).catch(() => {});

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
  console.log(file);
};
const state = () => page.evaluate(() => {
  const p = window.game.player, w = p.walker, h = p.hero;
  // The body as drawn: posed by the climb (rigged), its clip, its yaw against the walker's, its right hand's
  // height over its feet, and how far that hand is from the hold it reaches for (the goal as the rig gets it).
  const o = h?.object, f = h?.front?.actor?.fittedSkeleton, bones = h?.front?.actor?.bones;
  const hand = f && bones ? bones[f.names.indexOf('hand_r')] : null;
  const V = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 100) / 100);
  let handUp = null, toGoal = null, handAt = null, goal = null, at = null;
  if (o && hand) {
    o.updateWorldMatrix(true, true);
    const hp = hand.getWorldPosition(hand.position.clone()), op = o.getWorldPosition(o.position.clone());
    handUp = hp.y - op.y; handAt = V(hp); at = V(op);
    const g = h.goals?.R;
    if (g) { goal = V(g.p); toGoal = hp.distanceTo(g.p); }
  }
  return { mode: w.mode, x: w.pos.x, y: w.pos.y, z: w.pos.z, rigged: !!h?.rigged, clip: h?.clip, yaw: o ? o.rotation.y - Math.PI : null, walkerYaw: w.yaw,
    handUp, toGoal, handAt, goal, at, goalW: h?.goals?.R?.w };
});
/** The camera from the side and a little below, so the face and the climber show. */
const side = (turn) => page.evaluate((turn) => { const p = window.game.player; p.heroCam.yaw = p.walker.yaw + turn; p.heroCam.pitch = -0.1; p.heroCam.zoom = 6; }, turn);

// Face the wall and walk at it.
await page.evaluate(([nx, nz]) => { const p = window.game.player; p.walker.yaw = Math.atan2(-nx, -nz); p.heroCam.yaw = p.walker.yaw; }, [IN.x, IN.z]);
const s0 = await state();
console.log('start', JSON.stringify(s0));
await shoot('0-at-the-foot');
await page.keyboard.down('KeyW');
let on = false, pulled = false, top = s0.y, k = 0;
for (let t = 0; t < 400 && !(pulled && k > 2); t++) {
  await page.waitForTimeout(500);
  const s = await state();
  top = Math.max(top, s.y);
  if (s.mode === 'climb' && !on) { on = true; await side(1.2); console.log('on the face', JSON.stringify(s)); }
  if (s.mode === 'climb' && t % 8 === 0) console.log(JSON.stringify(s));
  if (s.mode === 'pull') pulled = true;
  // A picture every 4 s on the face, and through the pull-up.
  if ((s.mode === 'climb' && t % 8 === 0) || s.mode === 'pull' || (pulled && s.mode === 'ground')) { await shoot(`1-${String(t).padStart(3, '0')}-${s.mode}`); if (pulled) k++; }
}
await page.keyboard.up('KeyW');
console.log('end', JSON.stringify(await state()), `climbed ${(top - s0.y).toFixed(1)} m`);
if (!on) fail('never got onto the face');
if (top - s0.y < 10) fail(`climbed only ${(top - s0.y).toFixed(1)} m`);
if (!pulled) fail('never pulled up over a top');
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'climb: FAILED' : 'climb: ok');
process.exit(failed ? 1 : 0);
