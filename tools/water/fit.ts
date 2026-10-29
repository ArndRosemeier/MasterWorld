/**
 * Water fit (phase W, step W1): how well the water follows the finished land. For each world it looks at two
 * 16 km squares, round the start town and round the lake nearest to it, on a 40 m grid, and compares the water
 * with the land the water folds into: skeleton, valleys, landforms and detail, before the water shapes its channels
 * and banks (the landforms give way to the banks, as they were built to; `Terrain.landBeforeBanks`):
 *
 * - cut: at the middle of a river's or brook's channel, how far that land lies above the water's level. Water that
 *   follows the land sits about a metre below it; a big number is a trench dug to make the land fit the water.
 * - raised: the share of channel points where the water stands 2 m or more above that land (on a bank of its own).
 * - leaks: lake water beside dry ground lower than the lake (the lake hangs in the air there).
 *
 * `node --import tsx tools/water/fit.ts [seed …]` (`npm run water:fit`): four worlds by default, about a minute.
 * It reports; the later W steps set the limits it keeps.
 */
import { parseSeed } from '@futuremagic/core';
import { classic } from '../../src/setting/classic/index';
import { startPlace } from '../../src/vgm/builder';
import { Terrain } from '../../src/world/terrain';
import { emptyWater } from '../../src/world/hydro';

const SIDE = 16_000, STEP = 40;
const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['masterworld', 'vj4985', 'vc1bkb', 'alpha'];

/** The middle of the lake cell nearest to (x, z), or null where the river tile has none. */
function nearestLake(t: Terrain, x: number, z: number): { x: number; z: number } | null {
  const tile = t.hydro.tileAt(x, z), { n } = tile, cell = tile.o.cell;
  let best: { x: number; z: number } | null = null, bd = Infinity;
  for (let c = 0; c < n * n; c++) {
    if (Number.isNaN(tile.lake[c])) continue;
    const i = c % n, lx = tile.x0 + (i + 0.5) * cell, lz = tile.z0 + ((c - i) / n + 0.5) * cell, d = Math.hypot(lx - x, lz - z);
    if (d < bd) { bd = d; best = { x: lx, z: lz }; }
  }
  return best;
}

const pct = (a: number[], p: number): number => { const s = [...a].sort((u, v) => u - v); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
const f1 = (v: number): string => (Number.isNaN(v) ? '-' : v.toFixed(1));
const share = (a: number[], ok: (v: number) => boolean): string => (a.length ? `${Math.round((100 * a.filter(ok).length) / a.length)} %` : '-');

interface Fit { cuts: { brook: number[]; river: number[] }; lake: number; leaks: number }

function measure(t: Terrain, cx: number, cz: number): Fit {
  const w = emptyWater(), v = emptyWater();
  const fit: Fit = { cuts: { brook: [], river: [] }, lake: 0, leaks: 0 };
  for (let z = cz - SIDE / 2; z < cz + SIDE / 2; z += STEP) for (let x = cx - SIDE / 2; x < cx + SIDE / 2; x += STEP) {
    t.hydro.query(x, z, w);
    if (w.river && w.dist < w.half * 0.3) fit.cuts[w.brook ? 'brook' : 'river'].push(t.landBeforeBanks(x, z) - w.level);
    if (Number.isNaN(w.lake)) continue;
    const h = t.height(x, z);
    if (h >= w.lake) continue;
    fit.lake++;
    // Beside it (one step out): ground lower than the lake that holds neither this lake nor a river as high.
    for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const nx = x + dx, nz = z + dz, nh = t.height(nx, nz);
      if (nh >= w.lake - 1) continue;
      t.hydro.query(nx, nz, v);
      if (v.lake === w.lake || (v.river && v.dist < v.half && v.level >= w.lake - 1)) continue;
      fit.leaks++;
      break;
    }
  }
  return fit;
}

const rows: string[] = ['| World | Square | Water | Points | Median cut m | p95 cut m | Cut over 10 m | Raised 2 m+ |', '| --- | --- | --- | --- | --- | --- | --- | --- |'];
const lakes: string[] = ['| World | Square | Lake water samples | Leaking samples |', '| --- | --- | --- | --- |'];
const started = performance.now();
for (const name of seeds) {
  const t = new Terrain(parseSeed(name), classic);
  const home = startPlace(t), lake = nearestLake(t, home.x, home.z);
  const squares: [string, number, number][] = [['start', home.x, home.z]];
  if (lake) squares.push([`lake ${Math.round(lake.x)},${Math.round(lake.z)}`, lake.x, lake.z]);
  for (const [label, x, z] of squares) {
    const fit = measure(t, x, z);
    for (const kind of ['river', 'brook'] as const) {
      const a = fit.cuts[kind];
      rows.push(`| ${name} | ${label} | ${kind} | ${a.length} | ${f1(pct(a, 0.5))} | ${f1(pct(a, 0.95))} | ${share(a, (c) => c > 10)} | ${share(a, (c) => c < -2)} |`);
    }
    lakes.push(`| ${name} | ${label} | ${fit.lake} | ${fit.leaks} |`);
  }
}
console.log(rows.join('\n'));
console.log();
console.log(lakes.join('\n'));
console.log(`\n${((performance.now() - started) / 1000).toFixed(0)} s`);
