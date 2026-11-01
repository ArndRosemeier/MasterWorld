/**
 * The ground the hero stands on against the ground drawn (`npm run ground:scan`), in five worlds: round the start and
 * round the nearest stretch of sea cliff, each finest chunk is built as the terrain worker builds it (finer by a
 * brook) and read at points all over it, mesh against world/drawnGround.ts (what the hero, creatures and birds stand
 * on). Fails if any point is off by more than 1 cm: then the hero sinks into or floats over what is drawn.
 *
 * Trees, rocks and grass stand on the drawn ground too: it fails if a tree's foot is off the mesh by more than 1 cm, or a
 * rock's middle floats over it, or a grass mask's ground is off it. It also reports where the land's own height is off the drawn ground by more than
 * 0.5 m: relief finer than the mesh shows (a gorge's sheer wall, a sea cliff's gully, a pass's side), the worst as
 * links; only what is still set on the land's own height (a few props) sees it, so that does not fail it. A slow check, on demand: `node --import tsx tools/ground/scan.ts [seed ...]`.
 */
import { parseSeed } from '@futuremagic/core';
import { classic } from '../../src/setting/classic/index';
import { startPlace } from '../../src/vgm/builder';
import { nearestCoast } from '../../src/world/coast';
import { CHUNK0, SEGS, buildChunk, chunkIndex } from '../../src/world/chunkMesh';
import { DrawnGround, drawnSource } from '../../src/world/drawnGround';
import { FLORA_STRIDE, NEAR_SPACING, floraPlacement } from '../../src/world/flora';
import { grassMask } from '../../src/world/grass';
import { ROCK_STRIDE, rockPlacement } from '../../src/world/rocks';
import { Terrain } from '../../src/world/terrain';

/** Off the mesh by more than this (m), the hero is not on what is drawn: the check fails. */
const LIMIT = 0.01;
/** Chunks scanned each way from a square's middle (3 x 3 chunks, 384 m across). */
const REACH = 1;

/** The mesh's height at (x, z): the triangle of the chunk built at (x0, z0) the point falls in. */
function meshAt(m: ReturnType<typeof buildChunk>, x0: number, z0: number, x: number, z: number): number {
  const step = CHUNK0 / m.segs, idx = m.index ?? chunkIndex(m.segs), p = m.position;
  const i = Math.min(m.segs - 1, Math.floor((x - x0) / step)), j = Math.min(m.segs - 1, Math.floor((z - z0) / step));
  const q = (j * m.segs + i) * 6;
  for (const t of [q, q + 3]) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]].map((v) => [p[v * 3] + x0, p[v * 3 + 1], p[v * 3 + 2] + z0]);
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det, wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det, wc = 1 - wa - wb;
    if (wa >= -1e-9 && wb >= -1e-9 && wc >= -1e-9) return wa * a[1] + wb * b[1] + wc * c[1];
  }
  return NaN;
}

const seeds = process.argv.slice(2).length ? process.argv.slice(2) : ['masterworld', 'alpha', 'x4', 'poev7x', 'brazok'];
let failed = false;
for (const name of seeds) {
  const t0 = performance.now(), terrain = new Terrain(parseSeed(name), classic), src = drawnSource(terrain), g = new DrawnGround(src);
  const s = startPlace(terrain), squares: [string, number, number][] = [['start', s.x, s.z]];
  const cliff = nearestCoast(terrain, 'cliff', s.x, s.z);
  if (cliff) squares.push(['cliff', cliff.x, cliff.z]);
  for (const [what, cx, cz] of squares) {
    let stood = 0, points = 0, fine = 0, finer = 0, trees = 0, treeOff = 0, rocks = 0, rockOver = 0, blades = 0, bladeOff = 0;
    const worst: { d: number; x: number; z: number }[] = [];
    const ci = Math.floor(cx / CHUNK0), cj = Math.floor(cz / CHUNK0);
    for (let dj = -REACH; dj <= REACH; dj++) for (let di = -REACH; di <= REACH; di++) {
      const x0 = (ci + di) * CHUNK0, z0 = (cj + dj) * CHUNK0, segs = src.segs(x0, z0);
      if (segs > SEGS) finer++;
      const m = buildChunk(terrain, { x0, z0, size: CHUNK0, segs });
      // Trees and bushes: the foot (sunk 0.15 of its scale) on the mesh.
      const fl = floraPlacement(terrain, { seed: terrain.seed, setting: classic.id, x0, z0, size: CHUNK0, spacing: NEAR_SPACING });
      for (let k = 0; k < fl.length; k += FLORA_STRIDE, trees++) {
        const off = Math.abs(fl[k + 1] + 0.15 * fl[k + 3] - meshAt(m, x0, z0, fl[k], fl[k + 2]));
        if (!(off <= LIMIT)) { treeOff = Math.max(treeOff, Number.isNaN(off) ? Infinity : off); failed = true; }
      }
      // Rocks: seated on the lowest drawn ground under the foot, so the middle never floats over it (a landform's
      // rocks can lie past the chunk's edge: read off the drawn ground, which is the mesh, as checked above).
      const rk = rockPlacement(terrain, x0, z0, CHUNK0);
      for (let k = 0; k < rk.length; k += ROCK_STRIDE, rocks++) {
        const over = rk[k + 1] - g.footing(rk[k], rk[k + 2]);
        if (!(over <= LIMIT)) { rockOver = Math.max(rockOver, Number.isNaN(over) ? Infinity : over); failed = true; }
      }
      // Grass: the mask's ground (what the blades are rooted on) on the mesh, a pixel a metre.
      const gm = grassMask(terrain, { seed: terrain.seed, setting: classic.id, x0, z0, size: CHUNK0, res: CHUNK0 });
      for (let k = 0; k < CHUNK0 * CHUNK0; k++, blades++) {
        const off = Math.abs(gm[k * 4] - meshAt(m, x0, z0, x0 + (k % CHUNK0) + 0.5, z0 + Math.floor(k / CHUNK0) + 0.5));
        if (!(off <= LIMIT)) { bladeOff = Math.max(bladeOff, Number.isNaN(off) ? Infinity : off); failed = true; }
      }
      // Points over the whole chunk, off the grid: every 2 m cell's middle, and a point in each cell's other triangle.
      for (let z = z0 + 1; z < z0 + CHUNK0; z += 2) for (let x = x0 + 1; x < x0 + CHUNK0; x += 2) {
        for (const [px, pz] of [[x, z], [x + 0.4, z + 0.7]]) {
          const d = g.footing(px, pz), off = Math.abs(d - meshAt(m, x0, z0, px, pz));
          points++;
          if (!(off <= LIMIT)) { stood = Math.max(stood, Number.isNaN(off) ? Infinity : off); failed = true; }
        }
        const r = terrain.height(x, z) - g.footing(x, z);
        if (Math.abs(r) > 0.5) { fine++; worst.push({ d: r, x, z }); }
      }
    }
    worst.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    const cells = points / 2;
    console.log(`${name} ${what} (${cx.toFixed(0)}, ${cz.toFixed(0)}), ${(2 * REACH + 1) ** 2} chunks (${finer} finer by a brook):`);
    console.log(`  stood on: ${points} points, worst ${stood.toFixed(4)} m off the mesh${stood > LIMIT ? ' FAIL' : ''}`);
    console.log(`  trees: ${trees}, worst foot ${treeOff.toFixed(4)} m off the mesh${treeOff > LIMIT ? ' FAIL' : ''}; rocks: ${rocks}, worst middle ${rockOver.toFixed(4)} m over it${rockOver > LIMIT ? ' FAIL' : ''}`);
    console.log(`  grass: ${blades} mask pixels, worst root ${bladeOff.toFixed(4)} m off the mesh${bladeOff > LIMIT ? ' FAIL' : ''}`);
    console.log(`  the land under the mesh: ${fine} of ${cells} cells off by > 0.5 m${worst[0] ? `, worst ${worst[0].d.toFixed(2)} m` : ''}`);
    for (const w of worst.slice(0, 3)) console.log(`    ${w.d > 0 ? '+' : ''}${w.d.toFixed(2)} m  ?seed=${name}&pos=${w.x},${w.z}`);
  }
  console.log(`  (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}
process.exit(failed ? 1 : 0);
