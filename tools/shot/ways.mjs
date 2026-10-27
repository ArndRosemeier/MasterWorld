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
let ways = [];
for (const seed of [undefined, 'ways1', 'ways2', 'ways3', 'ways4', 'ways5', 'ways6']) {
  await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&cellar${seed ? `&seed=${seed}` : ''}${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.waitForFunction(`(window.game.cellar?.view?.doors?.size ?? -1) >= 0 && !!window.game.cellars?.fightBelow`, null, { timeout: 30000 }).catch(() => {});
  ways = await page.evaluate(WAYS);
  console.log(`seed ${seed ?? '(default)'}: ${ways.map((w) => w.kind).join(', ') || 'no ways that open'}`);
  if (ways.length) break;
}
await page.addStyleTag({ content: '#loading{display:none!important}' });
if (!ways.length) fail('no cellar with a locked, barred or hidden way');
await page.evaluate(() => {
  const n = window.game.notes, was = n.say.bind(n), out = [];
  n.say = (t, d) => { out.push(t); return was(t, d); };
  window.__said = out;
  const f = window.game.cellars?.fightBelow;
  if (f) { f.delve.den.peace = true; for (const c of f.delve.den.alive) { c.aware = 0; c.state = 'idle'; } }
});
for (const [i, w] of ways.entries()) {
  // From either side in turn (a bar opens only from its far side): 2.4 m before it, facing it; a key for a lock.
  let opened = false, from = 0, before = null, after = null;
  const pose = () => page.evaluate((link) => { const d = window.game.cellar.view.doors.get(link), q = d.pivot.quaternion, b = d.bar?.position; return { turn: 2 * Math.acos(Math.min(1, Math.abs(q.w))), bar: b ? [b.x, b.y, b.z] : null }; }, w.link);
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
    before = await pose();
    const tag = `${i}-${w.kind}-${side > 0 ? 'a' : 'b'}`;
    await shoot(`${tag}-00`);
    // Up to it at walking pace, then lingering (a hidden way is found by looking closely).
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    for (let n = 1; n <= 16; n++) {
      await page.waitForTimeout(250);
      if (n === 7) { await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft'); }
      opened ||= await page.evaluate((link) => window.game.cellar.space.open.has(link), w.link);
      await shoot(`${tag}-${String(n).padStart(2, '0')}`);
    }
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    after = await pose();
    from = side;
    if (opened) break;
  }
  if (!before) { fail(`way ${w.link} (${w.kind}): no floor before it`); continue; }
  const barMoved = before.bar && after.bar ? Math.hypot(after.bar[0] - before.bar[0], after.bar[1] - before.bar[1], after.bar[2] - before.bar[2]) : 0;
  console.log(`way ${w.link} (${w.kind}) from side ${from}: opened ${opened} · turned ${after.turn.toFixed(2)} rad${before.bar ? ` · bar moved ${barMoved.toFixed(2)} m` : ''}`);
  if (!opened) fail(`way ${w.link} (${w.kind}) did not open`);
  else if (after.turn < 1) fail(`way ${w.link} (${w.kind}) opened but was not seen to (${after.turn.toFixed(2)} rad)`);
  if (opened && before.bar && barMoved < 0.5) fail(`way ${w.link}: its bar stayed (${barMoved.toFixed(2)} m)`);
}
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
