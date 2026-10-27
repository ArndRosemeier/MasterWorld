/**
 * A search played out (render it, don't narrate it): `node tools/shot/search.mjs [out dir]` after `npm run build`
 * and `npm run packs`, SHOT_GPU=1 on the reference machine. Down in the town's cellar (its dwellers at peace, so
 * nothing fights), the hero is put 2 m before a chest, facing it, the camera to the side; G, and a picture every
 * 0.25 s: the hero steps up, kneels, the lid lifts, the finds' cards come, the hero gets up. Checks: the hero
 * moved up to the chest and knelt, the chest is opened (once), the lid's pivot turned, no note was said, no
 * shader built in play, no page errors. JPEGs into `<out dir>` (default `shots/search/<date>-<commit>/`). A slow
 * check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/search', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
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

/** The cellar's fight, and the first chest not yet opened in it. */
const FIGHT = `window.game.cellars?.fightBelow`;
for (const room of [undefined, 1, 2, 3, 4, 5]) {
  await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&cellar${room !== undefined ? `=${room}` : ''}${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  const ok = await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false);
  if (ok && (await page.evaluate(`${FIGHT}.delve.hoards.some((h) => h.prop)`))) break;
}
await page.addStyleTag({ content: '#loading{display:none!important}' });
const chest = await page.evaluate(`(() => {
  const f = ${FIGHT};
  if (!f) return null;
  f.delve.den.peace = true;
  const h = f.delve.hoards.find((x) => x.prop && !f.delve.hasOpened(x));
  if (!h) return null;
  // Before it, 2 m out from the wall it stands at (towards the room's middle), facing it.
  const O = f.spellFrame().offset, g = window.game, p = g.player;
  const r = g.cellar.cellar.layout.rooms.find((q) => q.id === h.room) ?? null, CELL = 2;
  const mx = r ? (r.x + r.w / 2) * CELL : h.x, mz = r ? (r.z + r.d / 2) * CELL : h.z + 2;
  let dx = mx - h.x, dz = mz - h.z;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  const x = O.x + h.x + dx * 2, z = O.z + h.z + dz * 2;
  p.teleport(x, O.y + h.y, z, Math.atan2(dx, dz));
  p.heroCam.yaw = Math.atan2(dx, dz) + 1.1;
  p.heroCam.pitch = -0.35;
  p.heroCam.zoom = 3.2;
  return { id: h.id };
})()`);
if (!chest) {
  fail('no unopened chest in the cellar');
} else {
  await page.waitForTimeout(2500);
  await page.click('canvas', { position: { x: 640, y: 360 } }).catch(() => {});
  const said = await page.evaluate(() => { const n = window.game.notes; const was = n?.say?.bind(n); const out = []; if (was) n.say = (t, d) => { out.push(t); return was(t, d); }; window.__said = out; return !!was; });
  const at0 = await page.evaluate(() => { const w = window.game.player.walker.pos; return [w.x, w.z]; });
  await shoot('0-before');
  await page.keyboard.press('KeyG');
  let knelt = false, lidTurn = 0;
  for (let i = 0; i < 14; i++) {
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => {
      const p = window.game.player, pp = p.puppet;
      const lids = window.game.cellar?.view?.lids ?? [];
      return { clip: pp?.clip ?? null, lid: Math.max(0, ...lids.map((l) => 2 * Math.acos(Math.min(1, Math.abs(l.pivot.quaternion.w))))) };
    });
    knelt ||= s.clip === 'crouch';
    lidTurn = Math.max(lidTurn, s.lid);
    await shoot(`1-search-${String(i).padStart(2, '0')}`);
  }
  const end = await page.evaluate(`(() => { const f = ${FIGHT}, w = window.game.player.walker.pos; return { opened: f.delve.hasOpened(f.delve.hoards.find((x) => x.id === ${chest.id})), puppet: !!window.game.player.puppet, at: [w.x, w.z] }; })()`);
  const moved = Math.hypot(end.at[0] - at0[0], end.at[1] - at0[1]);
  console.log(`moved ${moved.toFixed(2)} m · knelt ${knelt} · lid turned ${lidTurn.toFixed(2)} rad · opened ${end.opened} · notes ${JSON.stringify(await page.evaluate(() => window.__said ?? []))}${said ? '' : ' (notes not watched)'}`);
  if (moved < 0.8) fail(`the hero did not step up to the chest (${moved.toFixed(2)} m)`);
  if (!knelt) fail('the hero never knelt');
  if (lidTurn < 1.4) fail(`the lid did not lift (${lidTurn.toFixed(2)} rad)`);
  if (!end.opened) fail('the chest was not opened');
  if (end.puppet) fail('the hero is still kneeling');
  if ((await page.evaluate(() => window.__said?.length ?? 0)) > 0) fail('a note was said');
  await page.evaluate(() => { const p = window.game.player; p.heroCam.yaw += 0.6; });
  await page.waitForTimeout(600);
  await shoot('2-after');
}
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'search: FAILED' : 'search: ok');
process.exit(failed ? 1 : 0);
