/**
 * Going into a place on the land and out again, and taking up remains (render it, don't narrate it):
 * `node tools/shot/mouths.mjs [out dir]` after `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference
 * machine. For a barrow, a cave and a tower (`?barrow`, `?cave`, `?tower`: the hero starts before it, facing
 * it) the hero walks up to its doorway and is seen walking on into it before the screen goes dark; inside, the
 * way out is taken and the hero is seen walking out of the doorway onto the forecourt. Then remains laid by the
 * start (`?remains=pack`): the hero steps up and kneels, and they are gone from the ground. A picture every
 * 0.25 s. Checks: the hero walked into each doorway on their own and went in, walked out on their own, knelt to
 * the remains and took them up, no note was said, no shader built in play, no page errors. JPEGs into
 * `<out dir>` (default `shots/mouths/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/mouths', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
  console.log(file);
};
/** Loads `query`, hides the loading screen and watches the notes. */
const open = async (query) => {
  await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&${query}${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  await page.evaluate(() => {
    const no = window.game.notes, was = no.say.bind(no), out = window.__said ?? [];
    no.say = (t, d) => { out.push(t); return was(t, d); };
    window.__said = out;
  });
  await page.waitForTimeout(2500);
  await page.click('canvas', { position: { x: 640, y: 360 } }).catch(() => {});
};
const said = async (what) => {
  const s = await page.evaluate(() => { const s = window.__said ?? []; window.__said = []; return s; });
  if (s.length) fail(`${what}: notes said ${JSON.stringify(s)}`);
};
/** The hero: where, whether a scene plays them, and whether they are down in a place. */
const HERO = `(() => { const g = window.game, w = g.player.walker.pos, pp = g.player.puppet; return { x: w.x, z: w.z, puppet: !!pp, walking: !!pp?.walking, clip: pp?.clip ?? null, inside: !!g.cellar?.inside }; })()`;

for (const kind of ['barrow', 'cave', 'tower']) {
  await open(kind);
  // Up to its doorway at walking pace; once a scene plays the hero, the keys are let go.
  await page.evaluate(() => { const c = window.game.player.heroCam; c.yaw = window.game.player.walker.yaw + 0.35; c.pitch = -0.2; c.zoom = 4; });
  await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('KeyW');
  let walkedIn = false, inside = false, held = true;
  for (let k = 0; k < 140 && !inside; k++) {
    await page.waitForTimeout(250);
    const h = await page.evaluate(HERO);
    if (h.puppet && held) { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); held = false; }
    walkedIn ||= h.puppet && h.walking;
    inside = h.inside;
    if (h.puppet || k % 4 === 0) await shoot(`${kind}-in-${String(k).padStart(2, '0')}`);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  console.log(`${kind}: walked into the doorway on their own ${walkedIn} · went in ${inside}`);
  if (!inside) { fail(`${kind}: the hero never went in`); continue; }
  if (!walkedIn) fail(`${kind}: the hero was not seen walking on into the doorway`);
  await page.waitForTimeout(1500);
  await shoot(`${kind}-inside`);
  await said(`${kind} going in`);
  // Out again: the way out taken (as walking to it does), then seen walking out of the doorway.
  await page.evaluate(() => { void window.game.cellar.leave(); });
  let at0 = null, out = null, walkedOut = false;
  for (let k = 0; k < 14; k++) {
    await page.waitForTimeout(250);
    const h = await page.evaluate(HERO);
    if (!h.inside && !at0) at0 = h;
    if (!h.inside) walkedOut ||= h.puppet && h.walking;
    out = h;
    await shoot(`${kind}-out-${String(k).padStart(2, '0')}`);
  }
  const moved = at0 ? Math.hypot(out.x - at0.x, out.z - at0.z) : 0;
  console.log(`${kind}: came out ${!out.inside} · walked out on their own ${walkedOut} · ${moved.toFixed(2)} m out of the doorway · still played ${out.puppet}`);
  if (out.inside) fail(`${kind}: the hero did not come out`);
  else if (!walkedOut || moved < 0.8) fail(`${kind}: the hero was not seen walking out (${moved.toFixed(2)} m)`);
  if (out.puppet) fail(`${kind}: the keys are not the player's again`);
  await said(`${kind} coming out`);
}

// Remains: 1.8 m off, facing them; the hero steps up, kneels and takes them up.
await open('remains=pack');
const r0 = await page.evaluate(() => {
  const g = window.game, r = g.remains[0], p = g.player;
  if (!r) return null;
  const dx = p.walker.pos.x - r.at.x, dz = p.walker.pos.z - r.at.z, l = Math.hypot(dx, dz) || 1, x = r.at.x + (dx / l) * 1.8, z = r.at.z + (dz / l) * 1.8;
  p.teleport(x, undefined, z, Math.atan2(dx, dz));
  p.heroCam.yaw = Math.atan2(dx, dz) + 1.1;
  p.heroCam.pitch = -0.35;
  p.heroCam.zoom = 3.4;
  return g.remains.length;
});
if (!r0) fail('no remains laid by the start');
else {
  let knelt = false, h = null;
  for (let k = 0; k < 14; k++) {
    await page.waitForTimeout(250);
    h = await page.evaluate(HERO);
    knelt ||= h.clip === 'crouch';
    await shoot(`remains-${String(k).padStart(2, '0')}`);
  }
  const left = await page.evaluate(() => window.game.remains.length);
  console.log(`remains: knelt ${knelt} · taken up ${left < r0} · still played ${h.puppet}`);
  if (!knelt) fail('the hero never knelt to the remains');
  if (left >= r0) fail('the remains were not taken up');
  if (h.puppet) fail('the hero is still kneeling');
  await said('remains');
}

const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'mouths: FAILED' : 'mouths: ok');
process.exit(failed ? 1 : 0);
