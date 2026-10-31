/**
 * What stops the hero (an "invisible wall" report): `node tools/shot/wallprobe.mjs "<?query with pos and look>" out.png`
 * after a build (SHOT_GPU=1 on a GPU). Loads the spot, waits WALL_SETTLE ms (default 15000) for the places round the
 * hero to open, then along the view and 10 and 20 degrees to either side finds the first point the walker's wall test
 * blocks and which part says so (a hull, a town's solids, a fixture, a bridge's side, a trunk, a rock, a cellar, a
 * place, a hold, townsfolk; "(other)" for the rest), walks that way for 6 s, prints it all and takes a shot.
 */
import { launch } from './launch.mjs';
const query = process.argv[2], out = process.argv[3];
const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + query);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 900000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(Number(process.env.WALL_SETTLE ?? 15000));
const yawDeg = Number(new URL('http://x/' + query).searchParams.get('look').split(',')[0]);
const res = await page.evaluate(({ yawDeg }) => {
  const g = window.game, w = g.player.walker, world = w.world, p = w.pos;
  const parts = {
    hull: (x, z, r, y) => g.decks.hull(x, z, r, y), townSolid: (x, z, r) => !!g.towns?.solid(x, z, r, null), fixture: (x, z, r) => !!g.towns?.fixtureAt(x, z, r),
    bridge: (x, z, r, y) => g.bridges.side(x, z, r, y), trunk: (x, z, r) => g.trunks.blocks(x, z, r), rock: (x, z, r, y) => g.rocks.blocks(x, z, r, y),
    cellar: (x, z, r) => !!g.cellars?.solid(x, z, r), site: (x, z, r) => !!g.regionSites?.standsIn(x, z, r), hold: (x, z, r) => !!g.hold?.solid(x, z, r),
    folk: (x, z, r) => !!g.towns?.touches(x, z, r, p.x, p.z),
  };
  const rows = [];
  const yaw = yawDeg * Math.PI / 180;
  for (const da of [-20, -10, 0, 10, 20]) {
    const a = yaw + da * Math.PI / 180, dx = Math.sin(a), dz = -Math.cos(a);
    for (let s = 0; s <= 30; s += 0.25) {
      const x = p.x + dx * s, z = p.z + dz * s, y = world.height(x, z), f = world.floor?.(x, z, y);
      const hits = Object.entries(parts).filter(([, fn]) => { try { return fn(x, z, 0.35, y); } catch { return false; } }).map(([k]) => k);
      const wl = world.wall(x, z, 0.35, y);
      if (wl || hits.length) { rows.push(`${da}° ${s} m (${x.toFixed(1)},${z.toFixed(1)}) h${y.toFixed(2)} floor${f?.toFixed?.(2)} wall=${wl} ${hits.join(',') || '(other)'}`); break; }
    }
  }
  const x0 = p.x, z0 = p.z, y0 = p.y, trace = [];
  for (let i = 0; i < 60; i++) { w.step({ forward: 1, strafe: 0, heading: yaw, walk: false, up: false, down: false }, 0.1); if (i % 5 === 4) trace.push(`${(i / 10 + 0.1).toFixed(1)}s ${Math.hypot(p.x - x0, p.z - z0).toFixed(1)}m (${p.x.toFixed(1)},${p.z.toFixed(1)}) y${p.y.toFixed(2)} ${w.mode}`); }
  return { at: [x0, z0, y0], heading: w.heading ?? null, rows, trace };
}, { yawDeg });
console.log(JSON.stringify(res, null, 1));
await page.screenshot({ path: out });
await browser.close(); await server.close();
