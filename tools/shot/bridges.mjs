/**
 * Bridges where roads cross brooks (world/bridges.ts): `node tools/shot/bridges.mjs [out dir]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. Lays a cart track from a
 * place out on the land to the start town (as the VGM links a hamlet), then shows the first bridges on it:
 * from the brook below, and from the road. JPEGs into `<out dir>` (default `shots/bridges/<date>-<commit>/`).
 * BRIDGE_FROM=x,z picks the place the track starts at. A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const FROM = (process.env.BRIDGE_FROM ?? '-28000,35700').split(',').map(Number);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/bridges', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
const shoot = async (name) => { const file = join(dir, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT }); console.log(file); };

const road = await page.evaluate(([x, z]) => window.game.layRoad(x, z).then((d) => d && { id: d.id, n: d.pts.length / 3 }), FROM);
console.log('road', road);
// Walk the hero along the track until bridges are drawn round them.
const pts = await page.evaluate(() => Array.from(window.game.log.findLast((d) => d.kind === 'road').pts));
let shown = 0;
const seen = new Set();
for (let k = 0; k < pts.length / 3 && shown < 3; k += 40) {
  await page.evaluate(([x, z]) => window.game.player.teleport(x, undefined, z, 0), [pts[k * 3], pts[k * 3 + 2]]);
  await page.waitForTimeout(1500);
  const list = await page.evaluate(() => window.game.bridges.bridges.map((b) => {
    const w = b.walls.find((wl) => wl.w0 >= 0) ?? b.walls[0], m = (w.w0 >= 0 ? (w.w0 + w.w1) >> 1 : 0);
    const n = w.pts.length / 3, a = Math.max(0, m - 1), c = Math.min(n - 1, m + 1);
    return { id: b.id, x: w.pts[m * 3], z: w.pts[m * 3 + 1], ox: w.out[m * 2], oz: w.out[m * 2 + 1], dx: w.pts[c * 3] - w.pts[a * 3], dz: w.pts[c * 3 + 1] - w.pts[a * 3 + 1] };
  }));
  for (const b of list) {
    if (shown >= 3 || seen.has(b.id)) continue;
    seen.add(b.id);
    shown++;
    // From the brook, 9 m out, looking back at the arch.
    await page.evaluate(([b]) => { const x = b.x + b.ox * 9, z = b.z + b.oz * 9; window.game.player.teleport(x, undefined, z, Math.atan2(x - b.x, z - b.z)); }, [b]);
    await page.waitForTimeout(5000);
    await shoot(`${shown}a-${b.id.replace(/[^\w@-]/g, '_')}-brook`);
    // From the road, 14 m before it.
    await page.evaluate(([b]) => { const l = Math.hypot(b.dx, b.dz) || 1, x = b.x - b.ox * 1.5 - b.dx / l * 14, z = b.z - b.oz * 1.5 - b.dz / l * 14; window.game.player.teleport(x, undefined, z, Math.atan2(x - b.x, z - b.z)); }, [b]);
    await page.waitForTimeout(4000);
    await shoot(`${shown}b-${b.id.replace(/[^\w@-]/g, '_')}-road`);
  }
}
console.log(`${shown} bridges shown`);
if (errors.length) console.log('page errors:', errors);
await browser.close();
server.close();
process.exit(shown ? 0 : 1);
