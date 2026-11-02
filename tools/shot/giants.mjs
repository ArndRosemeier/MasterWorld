/**
 * The giants (phase M, D67): `node tools/shot/giants.mjs [out dir]` after `npm run packs` and `npm run build`, SHOT_GPU=1 on the
 * reference machine (WebGPU; the library animals need PrivateAssets, else the Actors fallbacks are drawn). For each giant group of the
 * start's wild (the giant elk, the giant turtle, the giant boar, the giant wolves) the hero steps up to the first of them, nine metres
 * off, the camera low and to the side so the hero stands beside it for scale; one picture each, and the size each is drawn at.
 * JPEGs into `<out dir>` (default `shots/giants/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { meet } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/giants', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const SCENES = ['giant-elk', 'giant-turtle', 'giant-boar', 'giant-wolves'];
const only = process.env.GIANTS_ONLY?.split(',');

const { server, base, browser } = await launch({});
const errors = [];
let failed = false;
for (const kind of SCENES.filter((x) => !only || only.includes(x))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`${kind}: ${e.message}`));
  await page.goto(`${base}?title=0&day=0&weather=fair&hour=11${gl ? '&gl' : ''}&wild=${kind}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  const found = await page.evaluate((k) => !!window.game.wild?.territories.find((t) => t.kind === k), kind);
  if (!found) { console.log(`${kind}: this world places none`); failed = true; await page.close(); continue; }
  await meet(kind, 9)(page);
  await page.evaluate(() => {
    // Nothing may attack while the picture is taken; the camera sits low, a little to the side.
    const g = window.game;
    g.character.health = g.character.maxHealth * 5;
    const cam = g.player.heroCam;
    cam.pitch = -0.05;
    cam.zoom = 3.5;
    cam.yaw += 0.7;
  });
  await page.waitForTimeout(2500);
  // How big it is drawn: the longest side of its group's first body, from the page's scene.
  const size = await page.evaluate((k) => {
    const g = window.game, t = g.wild.territories.find((x) => x.kind === k), c = g.wild.sight?.(k);
    return { kind: k, members: t?.members ?? [], at: c ? { x: Math.round(c.x), z: Math.round(c.z) } : null };
  }, kind);
  console.log(`${kind}: ${JSON.stringify(size)}`);
  await page.screenshot({ path: join(dir, `${kind}.jpg`), type: 'jpeg', quality: 88 });
  await page.close();
}
for (const e of errors) console.log(`page error: ${e}`);
await browser.close();
await server.close();
console.log(`pictures in ${dir}`);
if (failed || errors.length) process.exit(1);
