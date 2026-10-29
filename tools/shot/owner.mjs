/**
 * A place's household comes to the hero when it has gone quiet (show, don't tell): `node tools/shot/owner.mjs [out dir]`
 * after `npm run build` and `npm run packs`, SHOT_GPU=1 on the reference machine; OWNER_KIND=cellar,barrow (default;
 * or cave, tower). Down in the town's cellar in a room away from the ladder (or walked into a place out on the land and
 * put in its farthest room), every dweller falls at once; the camera looks towards the way in, and a picture every
 * half second: the household's one climbs down the ladder (or comes in from outside, where they waited), walks over and
 * thanks the hero (a speech bubble), and goes back. Checks: they came (down and up the ladder in a cellar), came within
 * a few steps of the hero, said their thanks in a bubble that wraps, the hero was paid and the promise kept, no "quiet"
 * line was queued, no shader built in play, no page errors. JPEGs into
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
/** The hero: whether a scene plays them, and whether they are down in a place. */
const HERO = `(() => { const g = window.game, pp = g.player.puppet; return { puppet: !!pp, inside: !!g.cellar?.inside }; })()`;

/** Down in a place of `kind` (a cellar under a house, or a place on the land walked into), the hero in a room away from its way in. */
async function goDown(kind) {
  const land = kind !== 'cellar';
  await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&${land ? kind : `cellar=${process.env.OWNER_ROOM ?? 2}`}${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  if (land) {
    // Up to its doorway and in (as tools/shot/mouths.mjs).
    await page.evaluate((kind) => {
      const g = window.game, d = g.log.find((x) => x.kind === 'dungeon' && x.template === kind && x.site), s = d?.site;
      if (!s) return;
      const off = { barrow: 2.2, cave: 3, tower: 2.4 }[kind] + 5;
      g.player.teleport(s.x + Math.sin(s.yaw) * off, undefined, s.z + Math.cos(s.yaw) * off, s.yaw);
    }, kind);
    await page.waitForTimeout(800);
    await page.keyboard.down('KeyW');
    let inside = false, held = true;
    for (let k = 0; k < 140 && !inside; k++) {
      await page.waitForTimeout(250);
      const h = await page.evaluate(HERO);
      if (h.puppet && held) { await page.keyboard.up('KeyW'); held = false; }
      inside = h.inside;
    }
    await page.keyboard.up('KeyW');
    if (!inside) return false;
    // Into the room farthest from the way in.
    await page.evaluate(() => {
      const g = window.game, v = g.cellar, c = v.cellar, O = v.origin, h = c.hatch, cell = c.layout.scale.cell, storey = c.layout.scale.storey;
      const far = (r) => Math.hypot((r.x + r.w / 2) * cell - h.x, (r.z + r.d / 2) * cell - h.z);
      const r = [...c.layout.rooms].filter((q) => Math.abs(q.level * storey - h.y) < 0.5).sort((a, b) => far(b) - far(a))[0] ?? c.layout.rooms[0];
      g.player.teleport(O.x + (r.x + r.w / 2) * cell, O.y + r.level * storey, O.z + (r.z + r.d / 2) * cell, 0);
    });
  }
  return page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false);
}

for (const kind of (process.env.OWNER_KIND ?? 'cellar,barrow').split(',')) {
  if (!(await goDown(kind))) { fail(`${kind}: not down in it`); continue; }
  await page.waitForTimeout(1500);
  const before = await page.evaluate(() => {
    const g = window.game, said = [];
    const q = g.director?.queue?.bind(g.director);
    if (q) g.director.queue = (t, p) => { said.push(t); return q(t, p); };
    window.__said = said;
    return { coins: g.character.coins, kept: g.log.filter((d) => d.kind === 'kept').length };
  });
  // Every dweller falls at once; the camera looks from behind the hero towards the way in (the ladder, the doorway).
  const setup = await page.evaluate(`(() => {
    const f = ${FIGHT}, g = window.game, v = g.cellar, p = g.player, O = v.origin, h = v.cellar.hatch;
    for (const c of f.delve.den.creatures) { c.health = 0; c.state = 'dead'; c.act = 'dead'; }
    const w = p.walker.pos, x = O.x + h.x, z = O.z + h.z;
    p.heroCam.yaw = Math.atan2(-(x - w.x), -(z - w.z));
    p.heroCam.pitch = -0.15;
    p.heroCam.zoom = 4;
    return { d: Math.hypot(x - w.x, z - w.z) };
  })()`);
  console.log(`${kind}: hero ${setup.d.toFixed(1)} m from the way in`);
  let phases = new Set(), nearest = Infinity, line = null, gone = false, bubble = null;
  for (let i = 0; i < 160 && !gone; i++) {
    await page.waitForTimeout(500);
    const s = await page.evaluate(() => {
      const g = window.game, o = g.owner, w = g.player.walker.pos, at = o?.placed();
      const b = document.querySelector('.speech'), r = b && b.style.display !== 'none' ? b.getBoundingClientRect() : null;
      return { phase: o?.phase ?? null, d: at ? Math.hypot(at.x - w.x, at.z - w.z) : null, line: g.speech.line, bubble: r ? { w: r.width, h: r.height, over: b.scrollWidth > b.clientWidth + 1 } : null };
    });
    if (s.phase) phases.add(s.phase);
    if (s.d !== null && s.phase === 'walk') nearest = Math.min(nearest, s.d);
    line ??= s.line;
    // A long line wraps: the bubble grows taller, never past its width, and no text runs out of it.
    if (s.bubble) { bubble = s.bubble; if (s.bubble.over || s.bubble.w > 302) fail(`${kind}: the speech bubble overflows (${JSON.stringify(s.bubble)})`); }
    gone = phases.size > 0 && (s.phase === null || s.phase === 'gone');
    if (i % 2 === 0 || s.line) await shoot(`${kind}-${String(i).padStart(3, '0')}-${s.phase ?? 'none'}`);
  }
  const after = await page.evaluate(() => ({ coins: window.game.character.coins, kept: window.game.log.filter((d) => d.kind === 'kept').length, said: window.__said ?? [] }));
  console.log(`${kind}: phases ${[...phases].join(' > ')} · nearest ${nearest.toFixed(2)} m · said "${line}" · coins ${before.coins} > ${after.coins} · kept ${before.kept} > ${after.kept} · queued ${JSON.stringify(after.said)} · bubble ${JSON.stringify(bubble)}`);
  for (const p of kind === 'cellar' ? ['down', 'walk', 'up'] : ['walk']) if (!phases.has(p)) fail(`${kind}: never ${p}`);
  if (nearest > 3.5) fail(`${kind}: never came near the hero (${nearest.toFixed(2)} m)`);
  if (!line) fail(`${kind}: no thanks said`);
  if (after.coins <= before.coins) fail(`${kind}: not paid`);
  if (after.kept <= before.kept) fail(`${kind}: the promise was not kept`);
  if (after.said.some((t) => /quiet|still|Nothing/.test(t))) fail(`${kind}: a line said it is quiet`);
}
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'owner: FAILED' : 'owner: ok');
process.exit(failed ? 1 : 0);
