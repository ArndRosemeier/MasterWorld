/**
 * A cellar's household comes down when it has gone quiet (show, don't tell): `node tools/shot/owner.mjs [out dir]`
 * after `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference machine. Down in the town's cellar in a room
 * away from the ladder, every dweller falls at once; the camera looks back the way to the ladder, and a picture every
 * half second: the household's one climbs down the ladder, walks over and thanks the hero (a speech bubble), and goes
 * back. Checks: they came down and up the ladder, came within a few steps of the hero, said their thanks, the hero
 * was paid and the promise kept, no "quiet" line was queued, no shader built in play, no page errors. JPEGs into
 * `<out dir>` (default `shots/owner/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/owner', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
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
await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&cellar=${process.env.OWNER_ROOM ?? 2}${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
if (!(await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false))) fail('not down in a cellar');
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => {
  const g = window.game, said = [];
  const q = g.director?.queue?.bind(g.director);
  if (q) g.director.queue = (t, p) => { said.push(t); return q(t, p); };
  window.__said = said;
  return { coins: g.character.coins, kept: g.log.filter((d) => d.kind === 'kept').length };
});
// Every dweller falls at once; the camera looks from beside the hero back towards the ladder.
const setup = await page.evaluate(`(() => {
  const f = ${FIGHT}, g = window.game, v = g.cellar, p = g.player;
  for (const c of f.delve.den.creatures) { c.health = 0; c.state = 'dead'; c.act = 'dead'; }
  const L = v.ladder, w = p.walker.pos;
  p.heroCam.yaw = Math.atan2(-(L.x - w.x), -(L.z - w.z)) + Math.PI;
  p.heroCam.pitch = -0.15;
  p.heroCam.zoom = 4;
  return { ladder: [L.x, L.floor, L.z], hero: [w.x, w.y, w.z], d: Math.hypot(L.x - w.x, L.z - w.z) };
})()`);
console.log(`hero ${setup.d.toFixed(1)} m from the ladder`);
let phases = new Set(), nearest = Infinity, line = null, gone = false;
for (let i = 0; i < 160 && !gone; i++) {
  await page.waitForTimeout(500);
  const s = await page.evaluate(() => {
    const g = window.game, o = g.owner, w = g.player.walker.pos, at = o?.placed();
    return { phase: o?.phase ?? null, d: at ? Math.hypot(at.x - w.x, at.z - w.z) : null, line: g.speech.line };
  });
  if (s.phase) phases.add(s.phase);
  if (s.d !== null && s.phase === 'walk') nearest = Math.min(nearest, s.d);
  line ??= s.line;
  gone = phases.size > 0 && (s.phase === null || s.phase === 'gone');
  if (i % 2 === 0 || s.line) await shoot(`${String(i).padStart(3, '0')}-${s.phase ?? 'none'}`);
}
const after = await page.evaluate(() => ({ coins: window.game.character.coins, kept: window.game.log.filter((d) => d.kind === 'kept').length, said: window.__said ?? [] }));
console.log(`phases ${[...phases].join(' > ')} · nearest ${nearest.toFixed(2)} m · said "${line}" · coins ${before.coins} > ${after.coins} · kept ${before.kept} > ${after.kept} · queued ${JSON.stringify(after.said)}`);
for (const p of ['down', 'walk', 'up']) if (!phases.has(p)) fail(`never ${p}`);
if (nearest > 3.5) fail(`never came near the hero (${nearest.toFixed(2)} m)`);
if (!line) fail('no thanks said');
if (after.coins <= before.coins) fail('not paid');
if (after.kept <= before.kept) fail('the promise was not kept');
if (after.said.some((t) => /quiet|still|Nothing/.test(t))) fail('a line said it is quiet');
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'owner: FAILED' : 'owner: ok');
process.exit(failed ? 1 : 0);
