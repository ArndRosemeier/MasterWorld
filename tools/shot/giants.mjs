/**
 * The giants (phase M, D67): `node tools/shot/giants.mjs [out dir]` after `npm run packs` and `npm run build`, SHOT_GPU=1 on the
 * reference machine (WebGPU; the library animals need PrivateAssets, else the Actors fallbacks are drawn). For each giant group of the
 * start's wild (the giant elk, the giant turtle, the giant boar, the giant wolves) the hero stands first far off (the whole beast in the
 * frame, 60 m) and then at its foot (a few metres past its body's room, the camera low and looking up) beside it for scale; two pictures
 * each, and the size each is drawn at.
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
// How far from the middle of each the hero stands at its foot (m): a few past the room its body keeps.
const FOOT = { 'giant-elk': 8, 'giant-turtle': 10, 'giant-boar': 6, 'giant-wolves': 6 };

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
  for (const [tag, d, zoom, pitch] of [['far', 60, 9, -0.02], ['foot', FOOT[kind], 4, 0.12]]) {
    await meet(kind, d)(page);
    await page.evaluate(([zoom, pitch]) => {
      // Nothing may attack while the picture is taken; the camera sits low, a little to the side.
      const g = window.game;
      g.character.health = g.character.maxHealth * 5;
      const cam = g.player.heroCam;
      cam.pitch = pitch;
      cam.zoom = zoom;
      cam.yaw += 0.7;
    }, [zoom, pitch]);
    await page.waitForTimeout(2500);
    // Where it stands and who is in the group.
    const size = await page.evaluate((k) => {
      const g = window.game, t = g.wild.territories.find((x) => x.kind === k), c = g.wild.sight?.(k);
      return { kind: k, members: t?.members ?? [], at: c ? { x: Math.round(c.x), z: Math.round(c.z) } : null };
    }, kind);
    console.log(`${kind} ${tag}: ${JSON.stringify(size)}`);
    await page.screenshot({ path: join(dir, `${kind}-${tag}.jpg`), type: 'jpeg', quality: 88 });
  }
  await page.close();
}
for (const e of errors) console.log(`page error: ${e}`);
await browser.close();
await server.close();
console.log(`pictures in ${dir}`);
if (failed || errors.length) process.exit(1);
