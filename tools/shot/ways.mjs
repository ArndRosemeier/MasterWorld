/**
 * A cellar's ways seen opening (render it, don't narrate it): `node tools/shot/ways.mjs [out dir]` after
 * `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference machine. Down in the town's cellar (other
 * seeds tried until it has a locked, barred or hidden way; its dwellers at peace), for each such way the hero
 * stands 2.4 m before it, the camera behind and to the side, and the hero walks up to it: a key in the pack, a
 * barred door touched from its far side, a hidden one lingered by, as the cellar asks. A picture every 0.25 s:
 * a door or grate swings away from the hero, a bar is lifted off first, stacked stones topple through.
 * Checks: every way opened, its piece moved, no note was said, no shader built in play, no page errors. JPEGs
 * into `<out dir>` (default `shots/ways/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/ways', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
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

/** The ways of the cellar the hero is down in that open (its door pieces), as plain data. */
const WAYS = `(() => {
  const v = window.game.cellar?.view;
  return v ? [...v.doors.values()].filter((d) => d.piece.opens !== 'gone').map((d) => ({ link: d.piece.link, kind: d.piece.kind, at: d.piece.at, through: d.piece.through })) : [];
})()`;
/** Where a way's moving piece (the leaf, the stones) is now, and the bar's, in the cellar frame (their drawn middles). */
const PLACE = `((link) => {
  const v = window.game.cellar.view, d = v.doors.get(link), O = v.origin;
  const mid = (g) => { g.updateMatrixWorld(true); const m = g.children[0]; m.geometry.computeBoundingSphere(); const c = m.geometry.boundingSphere.center.clone().applyMatrix4(m.matrixWorld); return [c.x - O.x, c.y - O.y, c.z - O.z]; };
  const q = d.pivot.quaternion;
  return { turn: 2 * Math.acos(Math.min(1, Math.abs(q.w))), piece: mid(d.pivot), bar: d.bar ? mid(d.bar) : null };
})`;
const seen = new Map();
let tried = 0, n = 0;
for (const seed of [undefined, 'ways1', 'ways2', 'ways3', 'ways4', 'ways5', 'ways6', 'ways7']) {
  await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&cellar${seed ? `&seed=${seed}` : ''}${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.waitForFunction(`(window.game.cellar?.view?.doors?.size ?? -1) >= 0 && !!window.game.cellars?.fightBelow`, null, { timeout: 30000 }).catch(() => {});
  const all = await page.evaluate(WAYS);
  // Each kind (a cave's and a built cellar's apart) at most twice in all.
  const ways = all.filter((w) => { const k = (seen.get(w.kind) ?? 0); if (k >= 2) return false; seen.set(w.kind, k + 1); return true; });
  console.log(`seed ${seed ?? '(default)'}: ${all.map((w) => w.kind).join(', ') || 'no ways that open'}${ways.length < all.length ? ` (trying ${ways.length})` : ''}`);
  if (!ways.length) continue;
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  await page.evaluate(() => {
    const no = window.game.notes, was = no.say.bind(no), out = window.__said ?? [];
    no.say = (t, d) => { out.push(t); return was(t, d); };
    window.__said = out;
    const f = window.game.cellars?.fightBelow;
    if (f) { f.delve.den.peace = true; for (const c of f.delve.den.alive) { c.aware = 0; c.state = 'idle'; } }
  });
  for (const w of ways) {
    tried++;
    const i = n++;
    // From either side in turn (a bar opens only from its far side): 2.4 m before it, facing it; a key for a lock.
    let opened = false, from = 0, before = null, after = null;
    for (const side of [1, -1]) {
      const placed = await page.evaluate(({ w, side }) => {
        const g = window.game, v = g.cellar, O = v.view.origin, sp = v.space, p = g.player;
        const link = sp.layout.links.find((pl) => pl.link.id === w.link).link;
        if (link.key !== undefined) sp.keys.add(link.key);
        const x = w.at[0] + w.through[0] * side * 2.4, z = w.at[2] + w.through[1] * side * 2.4;
        if (sp.floorAt(x, z, w.at[1] + 0.5) === null) return false;
        p.teleport(O.x + x, O.y + w.at[1], O.z + z, Math.atan2(w.through[0] * side, w.through[1] * side));
        p.heroCam.yaw = p.walker.yaw + 0.5;
        p.heroCam.pitch = -0.25;
        p.heroCam.zoom = 3.6;
        return true;
      }, { w, side });
      if (!placed) continue;
      await page.waitForTimeout(1200);
      await page.click('canvas', { position: { x: 640, y: 360 } }).catch(() => {});
      before = await page.evaluate(`${PLACE}(${w.link})`);
      const tag = `${i}-${w.kind}-${side > 0 ? 'a' : 'b'}`;
      await shoot(`${tag}-00`);
      // Up to it at walking pace, then lingering (a hidden way is found by looking closely).
      await page.keyboard.down('ShiftLeft');
      await page.keyboard.down('KeyW');
      for (let k = 1; k <= 16; k++) {
        await page.waitForTimeout(250);
        if (k === 7) { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); }
        opened ||= await page.evaluate((link) => window.game.cellar.space.open.has(link), w.link);
        await shoot(`${tag}-${String(k).padStart(2, '0')}`);
      }
      await page.keyboard.up('KeyW');
      await page.keyboard.up('ShiftLeft');
      after = await page.evaluate(`${PLACE}(${w.link})`);
      from = side;
      if (opened) break;
    }
    if (!before) { fail(`way ${w.link} (${w.kind}): no floor before it`); continue; }
    // Which side of the doorway (along the way through) the piece ended on, against the side the hero opened it from.
    const along = (q) => (q[0] - w.at[0]) * w.through[0] + (q[2] - w.at[2]) * w.through[1];
    const barMoved = before.bar && after.bar ? Math.hypot(after.bar[0] - before.bar[0], after.bar[1] - before.bar[1], after.bar[2] - before.bar[2]) : 0;
    console.log(`way ${w.link} (${w.kind}) from side ${from}: opened ${opened} · turned ${after.turn.toFixed(2)} rad · piece ${along(before.piece).toFixed(2)} -> ${along(after.piece).toFixed(2)} m along the way${before.bar ? ` · bar moved ${barMoved.toFixed(2)} m, ends ${after.bar[1].toFixed(2)} m up, ${along(after.bar).toFixed(2)} along` : ''}`);
    if (!opened) { fail(`way ${w.link} (${w.kind}) did not open from either side`); continue; }
    if (after.turn < 1) fail(`way ${w.link} (${w.kind}) opened but was not seen to (${after.turn.toFixed(2)} rad)`);
    if (Math.sign(along(after.piece)) === from) fail(`way ${w.link} (${w.kind}) opened towards the hero (side ${from})`);
    if (before.bar && (barMoved < 0.5 || after.bar[1] > 0.3)) fail(`way ${w.link}: its bar was not set down (moved ${barMoved.toFixed(2)} m, ${after.bar[1].toFixed(2)} m up)`);
  }
  if (tried >= 8) break;
}
if (!tried) fail('no cellar with a locked, barred or hidden way');
console.log(`kinds tried: ${[...seen].map(([k, c]) => `${k} ×${c}`).join(', ')}`);
const said = await page.evaluate(() => window.__said ?? []);
if (said.length) fail(`notes said: ${JSON.stringify(said)}`);
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'ways: FAILED' : 'ways: ok');
process.exit(failed ? 1 : 0);
