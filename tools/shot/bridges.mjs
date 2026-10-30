/**
 * Bridges where roads cross brooks (world/bridges.ts): `node tools/shot/bridges.mjs [out dir]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. Lays a cart track from a
 * place out on the land to the start town (as the VGM links a hamlet), then shows the first bridges on it:
 * from the brook below, from far up and down it, and from the road. JPEGs into `<out dir>` (default `shots/bridges/<date>-<commit>/`).
 * BRIDGE_FROM=x,z picks the place the track starts at. BRIDGE_GO=<go-to label> (e.g. "Capital gate") lays no track:
 * it runs that debug go-to and shows the bridges on the town's own streets round where it lands (BRIDGE_NEAR=x,z: the
 * one nearest that first, e.g. the capital's west gate road). A slow check (docs/CHECKS.md), well under 5 min.
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

const GO = process.env.BRIDGE_GO, NEAR = process.env.BRIDGE_NEAR?.split(',').map(Number);
let pts;
if (GO) {
  console.log('go', GO, await page.evaluate((l) => Promise.resolve(window.game.go(l)).then(String), GO));
  // Stand where the bridges are wanted (the go-to's spot, or BRIDGE_NEAR) and wait for its brooks.
  const at = NEAR ?? await page.evaluate(() => [window.game.player.walker.pos.x, window.game.player.walker.pos.z]);
  pts = [at[0], 0, at[1]];
  await page.waitForTimeout(6000);
} else {
  const road = await page.evaluate(([x, z]) => window.game.layRoad(x, z).then((d) => d && { id: d.id, n: d.pts.length / 3 }), FROM);
  console.log('road', road);
  // Walk the hero along the track until bridges are drawn round them.
  pts = await page.evaluate(() => Array.from(window.game.log.findLast((d) => d.kind === 'road').pts));
}
let shown = 0;
const seen = new Set();
for (let k = 0; k < pts.length / 3 && shown < 3; k += 40) {
  await page.evaluate(([x, z]) => window.game.player.teleport(x, undefined, z, 0), [pts[k * 3], pts[k * 3 + 2]]);
  await page.waitForTimeout(1500);
  const list = await page.evaluate(([x, z]) => window.game.bridges.bridges.map((b) => {
    const dx = b.x1 - b.x0, dz = b.z1 - b.z0, l = Math.hypot(dx, dz);
    return { id: b.id, x: b.x, z: b.z, ax: dx / l, az: dz / l, len: l };
  }).sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)), [pts[k * 3], pts[k * 3 + 2]]);
  for (const b of list) {
    if (shown >= 3 || seen.has(b.id)) continue;
    seen.add(b.id);
    shown++;
    // From the brook on either side, 11 m out, looking back at the arches; then from the road before it.
    for (const [tag, ox, oz, back] of [['brook', -b.az, b.ax, 11], ['brook2', b.az, -b.ax, 11], ['road', -b.ax, -b.az, b.len / 2 + 12]]) {
      await page.evaluate(([b, ox, oz, back]) => {
        const x = b.x + ox * back, z = b.z + oz * back;
        window.game.player.teleport(x, undefined, z, Math.atan2(x - b.x, z - b.z));
      }, [b, ox, oz, back]);
      await page.waitForTimeout(4000);
      await shoot(`${shown}-${tag}-${b.id.replace(/[^\w@-]/g, '_')}`);
    }
    // Down the brook (following its flow) 30 and 90 m, on its bank, looking back up it: how its water and
    // channel read further along, in the near and the farther view.
    for (const [tag, run] of [['along30', 30], ['along90', 90]]) {
      await page.evaluate(([b, run]) => {
        const h = window.game.terrain.hydro;
        let x = b.x, z = b.z, w = h.brookAt(x, z);
        for (let s = 0; s < run && w.brook; s += 2) { x += w.fx * 2; z += w.fz * 2; w = h.brookAt(x, z); }
        // Onto the bank (off the flow's left), facing up the brook.
        const off = (w.half ?? 2) + 2.5;
        x += -w.fz * off; z += w.fx * off;
        window.game.player.teleport(x, undefined, z, Math.atan2(w.fx, w.fz));
      }, [b, run]);
      await page.waitForTimeout(4000);
      await shoot(`${shown}-${tag}-${b.id.replace(/[^\w@-]/g, '_')}`);
    }
    // Standing on its middle: on the deck, not down in the brook.
    const stand = await page.evaluate(([b]) => {
      const g = window.game;
      g.player.teleport(b.x, undefined, b.z, 0);
      return { y: g.player.walker.pos.y, deck: g.bridges.deck(b.x, b.z), ground: g.terrain.height(b.x, b.z) };
    }, [b]);
    console.log(b.id, 'stand', stand);
  }
}
console.log(`${shown} bridges shown`);
if (errors.length) console.log('page errors:', errors);
await browser.close();
server.close();
process.exit(shown ? 0 : 1);
