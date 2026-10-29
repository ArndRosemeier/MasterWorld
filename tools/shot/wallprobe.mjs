/**
 * What stops the hero (an "invisible wall" report): loads a link (a `?query` on the local build, or a full URL
 * such as the live game's), waits WALL_SETTLE ms (default 20000, the places round the hero open), then asks each
 * thing the walker treats as a wall along the view's way (WALL_M metres, default 40), walks that way for 8 s, and
 * saves a screenshot after the walk. `node tools/shot/wallprobe.mjs "<link>" [shot.png]` (SHOT_GPU=1 on a GPU).
 */
import { launch } from './launch.mjs';
const query = process.argv[2], out = process.argv[3] ?? 'shots/wallprobe.png';
const SETTLE = Number(process.env.WALL_SETTLE ?? 20000), M = Number(process.env.WALL_M ?? 40);
const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(query.startsWith('http') ? query : base + query);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 900000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(SETTLE);
const yawDeg = Number(new URL(query.startsWith('http') ? query : 'http://x/' + query).searchParams.get('look')?.split(',')[0] ?? 0);
const res = await page.evaluate(({ yawDeg, M }) => {
  const g = window.game, w = g.player.walker, world = w.world, p = w.pos;
  const parts = {
    townSolid: (x, z, r) => !!g.towns?.solid(x, z, r, null), fixture: (x, z, r) => !!g.towns?.fixtureAt(x, z, r),
    bridge: (x, z, r, y) => g.bridges.side(x, z, r, y), trunk: (x, z, r) => g.trunks.blocks(x, z, r), rock: (x, z, r, y) => g.rocks.blocks(x, z, r, y),
    cellar: (x, z, r) => !!g.cellars?.solid(x, z, r), site: (x, z, r) => !!g.regionSites?.standsIn(x, z, r), hold: (x, z, r) => !!g.hold?.solid(x, z, r),
    folk: (x, z, r) => !!g.towns?.touches(x, z, r, p.x, p.z),
  };
  const rows = [];
  const yaw = -yawDeg * Math.PI / 180;
  for (const da of [-20, -10, 0, 10, 20]) {
    const a = yaw + da * Math.PI / 180, dx = -Math.sin(a), dz = -Math.cos(a);
    for (let s = 0; s <= M; s += 0.5) {
      const x = p.x + dx * s, z = p.z + dz * s, y = world.height(x, z);
      const hits = Object.entries(parts).filter(([, f]) => { try { return f(x, z, 0.35, y); } catch { return false; } }).map(([k]) => k);
      if (world.wall(x, z, 0.35, y) || hits.length) { rows.push(`${da}° ${s} m (${x.toFixed(1)},${z.toFixed(1)}) wall=${world.wall(x, z, 0.35, y)} ${hits.join(',') || '(other)'}`); break; }
    }
  }
  const x0 = p.x, z0 = p.z, trace = [];
  for (let i = 0; i < 80; i++) { w.step({ forward: 1, strafe: 0, heading: yaw, walk: false, up: false, down: false }, 0.1); if (i % 5 === 4) trace.push(`${(i / 10 + 0.1).toFixed(1)}s ${Math.hypot(p.x - x0, p.z - z0).toFixed(1)}m (${p.x.toFixed(1)},${p.z.toFixed(1)}) y${p.y.toFixed(1)} ${w.mode}`); }
  return { at: [x0, z0], rows, trace, sites: g.regionSites?.status, version: document.title };
}, { yawDeg, M });
console.log(JSON.stringify(res, null, 1));
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
await browser.close(); await server.close();
