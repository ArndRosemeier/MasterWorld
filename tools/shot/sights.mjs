/**
 * Sights by the way (implementation plan C9): `node tools/shot/sights.mjs [out dir]` after `npm run build`
 * (and `npm run packs`), SHOT_GPU=1 on the reference machine. The hero stands out on the land east of the
 * start town; the VGM answers Discovery there three times (the debug menu's "answer Discovery now"), each
 * sight a walk further on: the hero steps up to 16 m of each (inside its glade), the game must say what it
 * is, and it is shot. JPEGs into `<out dir>` (default `shots/sights/<date>-<commit>/`). A slow check (docs/CHECKS.md),
 * well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/sights', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=10&weather=fair${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
let failed = false;
const shoot = async (name) => { const file = join(dir, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT }); console.log(file); };

for (let i = 0; i < 3; i++) {
  // Out on the land east of the start town, each time a walk further on.
  await page.evaluate((i) => {
    const g = window.game, d = g.towns.every[0].town.decision;
    g.player.teleport(d.x + d.radius + 260 + i * 450, undefined, d.z + 40, -Math.PI / 2);
  }, i);
  await page.waitForTimeout(2500);
  const made = await page.evaluate(() => {
    const m = window.game.answerNow('discovery');
    if (!m || m.decision.kind !== 'sight') return null;
    const d = m.decision, def = window.game.setting.sights.find((s) => s.id === d.sight);
    return { id: d.id, sight: d.sight, x: d.x, z: d.z, seen: def.seen, reason: m.reason };
  });
  console.log(`answer ${i + 1}: ${made ? `${made.sight} ${made.id} (${made.reason})` : 'none'}`);
  if (!made) { failed = true; continue; }
  // From 16 m off, looking at it, inside its glade: the hero has come upon it, so the game says what it is.
  await page.evaluate(({ x, z }) => {
    const g = window.game, p = g.player.walker.pos, l = Math.max(1, Math.hypot(p.x - x, p.z - z));
    const hx = x + ((p.x - x) / l) * 16, hz = z + ((p.z - z) / l) * 16;
    g.player.teleport(hx, undefined, hz, Math.atan2(hx - x, hz - z));
  }, made);
  const said = await page.waitForFunction((seen) => document.body.innerText.includes(seen.slice(0, 30)), made.seen, { timeout: 8000 }).then(() => true, () => false);
  console.log(`came upon ${made.sight}: ${said ? 'said' : 'NOT SAID'}`);
  if (!said) failed = true;
  // The trees round it are gone once the workers have the glade.
  await page.waitForTimeout(3500);
  await shoot(`0${i + 1}-${made.sight}`);
  // Its words fade before the next one.
  await page.waitForTimeout(6000);
}
const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { failed = true; console.log(errors.join('\n')); }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
