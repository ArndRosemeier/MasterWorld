/**
 * The aura round creatures in a fight (game/aura.ts, render/materials/aura.ts): `node tools/shot/auras.mjs [out dir]` after
 * `npm run packs` and `npm run build`. A cellar with a pack (goblins, rats), the hero a few metres from the nearest, facing it:
 * a picture with no target (faint auras), one with the nearest picked (strong), one with the target hurt to half and one
 * to a sliver (colours), then the target killed and the next fighter taken as target. JPEGs into `<out dir>`
 * (default `shots/auras/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { FIGHT, faceNearest } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/auras', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });
const SCENES = (process.env.AURAS_ONLY?.split(',') ?? ['goblins', 'rats']);
const HOUR = process.env.AURAS_HOUR ?? '12';

const { server, base, browser } = await launch({});
const errors = [];
let failed = false;
for (const id of SCENES) {
  const page = await browser.newPage({ viewport: { width: Number(process.env.SHOT_W ?? 1280), height: Number(process.env.SHOT_H ?? 720) } });
  page.on('pageerror', (e) => errors.push(`${id}: ${e.message}`));
  await page.goto(`${base}?title=0&day=0&weather=fair${gl ? '&gl' : ''}&hour=${HOUR}&cellar=2&dweller=${id}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  const ok = await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false);
  if (!ok) { console.log(`${id}: no fight found`); failed = true; await page.close(); continue; }
  await faceNearest(page, 4);
  // Wake them all: the fight is on.
  await page.evaluate(`(() => { const f = ${FIGHT}; for (const c of f.delve.den.alive) { c.state = 'fight'; c.aware = 1; } })()`);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(dir, `${id}-1-faint.jpg`), type: 'jpeg', quality: 88, timeout: 180000 });
  await page.evaluate(`(() => { const f = ${FIGHT}; f.delve.fight.pick(window.__hitWho); })()`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(dir, `${id}-2-target.jpg`), type: 'jpeg', quality: 88, timeout: 180000 });
  for (const [n, share] of [[3, 0.5], [4, 0.12]]) {
    await page.evaluate(`(() => { const c = window.__hitWho; c.health = c.def.health * ${share}; })()`);
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(dir, `${id}-${n}-health${share}.jpg`), type: 'jpeg', quality: 88, timeout: 180000 });
  }
  const next = await page.evaluate(`(() => { const f = ${FIGHT}, fi = f.delve.fight, c = window.__hitWho; c.health = 0; c.state = 'dead'; return new Promise((r) => setTimeout(() => r(fi.target && fi.target !== c ? fi.target.id : null), 600)); })()`);
  console.log(`${id}: after the kill the target is ${next === null ? 'none' : 'foe ' + next}`);
  if (next === null && (await page.evaluate(`${FIGHT}.delve.den.fighting.length`)) > 0) failed = true;
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(dir, `${id}-5-next.jpg`), type: 'jpeg', quality: 88, timeout: 180000 });
  await page.close();
}
await browser.close();
server.close();
if (errors.length) { console.log(errors.join('\n')); failed = true; }
console.log(failed ? 'FAILED' : `ok: ${dir}`);
process.exit(failed ? 1 : 0);
