/**
 * Things set on the ground, seen round about (Arnd: the tower had floating rocks round it): `node
 * tools/shot/grounded.mjs [out dir]` after `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference
 * machine. A tower dungeon (`?tower`) and the warden's keep by the start town, each from four sides 20 m out
 * and low, so the fallen stones round their feet and the feet of their walls show against the land. Checks: no
 * page errors. JPEGs into `<out dir>` (default `shots/grounded/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/grounded', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));

for (const [name, query, pick] of [['tower', 'tower', 'dungeon'], ['keep', '', 'retreat']]) {
  await page.goto(`${base}?title=0&day=0&hour=10&weather=fair&${query}${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  // The keep's middle on the land (its doorway at the site, the keep behind it along −z of its frame).
  const mid = await page.evaluate((pick) => {
    const g = window.game, d = pick === 'dungeon' ? g.log.find((x) => x.kind === 'dungeon' && x.template === 'tower' && x.site)?.site : g.log.find((x) => x.kind === 'retreat');
    if (!d) return null;
    const back = pick === 'dungeon' ? 8 : 5, c = Math.cos(d.yaw), n = Math.sin(d.yaw);
    return { x: d.x - back * n, z: d.z - back * c, yaw: d.yaw };
  }, pick);
  if (!mid) { console.log(`FAIL ${name}: none in the log`); continue; }
  for (let i = 0; i < 4; i++) {
    const a = mid.yaw + (i * Math.PI) / 2, px = mid.x + Math.sin(a) * 20, pz = mid.z + Math.cos(a) * 20;
    await page.evaluate(({ px, pz, mid }) => {
      const p = window.game.player, yaw = Math.atan2(px - mid.x, pz - mid.z);
      p.teleport(px, undefined, pz, yaw);
      p.heroCam.yaw = yaw; p.heroCam.pitch = -0.05; p.heroCam.zoom = 5;
    }, { px, pz, mid });
    await page.waitForTimeout(i ? 1500 : 4000);
    const file = join(dir, `${name}-${i}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
    console.log(file);
  }
}
console.log(errors.length ? `FAIL page errors:\n${errors.join('\n')}` : 'no page errors');
await browser.close();
await server.close();
process.exit(errors.length ? 1 : 0);
