/**
 * What households ask, seen being done (D62, phase Q; rule 11): `node tools/shot/asks.mjs [out dir]` after
 * `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference machine; ASKS=seal,parley (default; more as phase Q
 * adds them). parley: the cellar of smugglers whose household asks to talk (`?ask=parley`); the hero walks up to their
 * leader, speaks (G) and hears the terms in a bubble over the leader's head, speaks again and strikes them. Checks: the
 * prompt says "Speak with", the dwellers never fight, a bubble shows each time, the terms are struck. seal: the town's cellar with a breach in the wall of its last room (`?ask=breach`), its dwellers fallen; the
 * hero stands before the breach and walls it up (G): a picture every 0.7 s while the courses of stones go in. Checks:
 * the prompt says "Wall up", the breach ends walled up (every course shown), the promise's ask is met, no shader built
 * in play, no page errors. JPEGs into `<out dir>` (default `shots/asks/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/asks', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
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
const FIGHT = `window.game.cellars?.fightBelow`;

/** A seal: wall up the breach in the cellar's last room. */
async function seal() {
  await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&ask=breach&cellar${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  if (!(await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false))) return fail('seal: not down in the cellar');
  const at = await page.evaluate(`(() => {
    const f = ${FIGHT}, g = window.game, v = g.cellar, p = g.player, O = v.origin, b = f.delve.breach;
    if (!b) return null;
    for (const c of f.delve.den.creatures) { c.health = 0; c.state = 'dead'; c.act = 'dead'; }
    v.restore({ open: v.cellar.layout.links.map((pl) => pl.link.id), keys: [], read: [] });
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), x = O.x + b.x + fx * 1.5, z = O.z + b.z + fz * 1.5;
    p.teleport(x, O.y + b.y, z, Math.atan2(fx, fz));
    // From the side and a little behind, so the hero and the hole are both in the picture.
    p.heroCam.yaw = Math.atan2(fx, fz) + 0.9;
    p.heroCam.pitch = -0.12;
    p.heroCam.zoom = 3.2;
    return { sealed: f.delve.sealed, ask: f.delve.ask?.verb };
  })()`);
  if (!at) return fail('seal: the cellar has no breach');
  if (at.ask !== 'seal') fail(`seal: the place asks ${at.ask}`);
  await page.waitForTimeout(1500);
  const prompt = await page.evaluate(() => document.body.innerText.includes('Wall up'));
  if (!prompt) fail('seal: no "Wall up" prompt before the breach');
  await shoot('seal-00-open');
  await page.keyboard.press('KeyG');
  for (let i = 1; i <= 14; i++) {
    await page.waitForTimeout(700);
    await shoot(`seal-${String(i).padStart(2, '0')}`);
  }
  const end = await page.evaluate(`(() => { const f = ${FIGHT}; return { sealed: f.delve.sealed, met: f.delve.met }; })()`);
  console.log(`seal: ${JSON.stringify(end)}`);
  if (!end.sealed || !end.met) fail('seal: the breach is not walled up');
}

/** A parley: up to the dwellers' leader, hear the terms and strike them. */
async function parley() {
  await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&ask=parley&cellar${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  if (!(await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false))) return fail('parley: not down in the cellar');
  const at = await page.evaluate(`(() => {
    const f = ${FIGHT}, g = window.game, v = g.cellar, p = g.player, O = v.origin, k = f.delve.chief;
    if (!k || f.delve.ask?.verb !== 'parley') return { ask: f.delve.ask?.verb ?? null };
    window.game.character.coins = Math.max(window.game.character.coins, 100);
    v.restore({ open: v.cellar.layout.links.map((pl) => pl.link.id), keys: [], read: [] });
    p.teleport(O.x + k.x + 2, O.y + k.y, O.z + k.z, Math.atan2(2, 0));
    p.heroCam.yaw = Math.atan2(2, 0) + 0.8;
    p.heroCam.pitch = -0.1;
    p.heroCam.zoom = 3.5;
    return { ask: 'parley', who: k.def.name };
  })()`);
  if (at.ask !== 'parley') return fail(`parley: the place asks ${at.ask} (its dwellers cannot be talked with?)`);
  await page.waitForTimeout(1500);
  if (!(await page.evaluate(() => document.body.innerText.includes('Speak with')))) fail('parley: no "Speak with" prompt by the leader');
  await shoot('parley-00-near');
  for (const step of ['terms', 'struck']) {
    await page.keyboard.press('KeyG');
    await page.waitForTimeout(600);
    const said = await page.evaluate(() => { const b = document.querySelector('.speech'); return b && b.style.display !== 'none' ? b.textContent : null; });
    console.log(`parley ${step}: "${said}"`);
    if (!said) fail(`parley: no bubble for the ${step}`);
    await shoot(`parley-01-${step}`);
    await page.waitForTimeout(2500);
  }
  const end = await page.evaluate(`(() => { const f = ${FIGHT}; return { parley: f.delve.parley, met: f.delve.met, fighting: f.delve.den.fighting.length }; })()`);
  console.log(`parley: ${JSON.stringify(end)}`);
  if (end.parley !== 'struck' || !end.met) fail('parley: no terms struck');
  if (end.fighting) fail('parley: the dwellers fight');
}

for (const kind of (process.env.ASKS ?? 'seal,parley').split(',')) {
  if (kind === 'seal') await seal();
  else if (kind === 'parley') await parley();
  else fail(`no shot for ${kind}`);
}
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'asks: FAILED' : 'asks: ok');
process.exit(failed ? 1 : 0);
