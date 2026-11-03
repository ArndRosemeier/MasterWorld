/**
 * The water of a formed cave as a question the walker can ask (D63, K6; pure): at a point of the cave, in the column of water the
 * body's feet are in, where is its surface? The dresser (dress.ts) cuts the streams' beds and the pools' basins into the floor and
 * keeps each point's surface; this indexes them. A cave stacks its water (a stream on a ledge over a pool below), so the answer
 * depends on the height asked at, not on (x, z) alone as it does overland: a body is in the water whose bed is under its feet and
 * whose surface is not far under them, and the lowest such surface is the one it floats in or wades.
 */
import type { Dressing } from './dress';

/** The surface (cave metres) of the water a body with its feet at (x, y, z) is in or standing over (null: none). */
export type CaveWaterAt = (x: number, y: number, z: number) => number | null;

/** Cell of the index (m). */
const CELL = 2;
/** A body's feet may stand this far under a bed (a lump under it) and this far over the surface (standing on the bank) and still be asked about the water. */
const UNDER = 0.3, OVER = 2.5;

interface Disc { readonly x: number; readonly z: number; readonly r: number; readonly surface: number; readonly bed: number }

/** The water of a dressed cave: streams (a disc of the half-width at each point of their course) and pools (a disc of their radius). `bed`, `poolDepth`: how deep each is cut under its surface (setting `caves.dress.water`). */
export function caveWater(d: Pick<Dressing, 'streams' | 'pools'>, bed: number, poolDepth: number): CaveWaterAt | null {
  const discs: Disc[] = [];
  for (const s of d.streams) for (const [x, y, z, w] of s.pts) discs.push({ x, z, r: w, surface: y, bed: y - bed });
  for (const p of d.pools) discs.push({ x: p.x, z: p.z, r: p.r, surface: p.y, bed: p.y - (p.depth ?? poolDepth) });
  if (!discs.length) return null;
  const cells = new Map<number, Disc[]>(), cellKey = (i: number, k: number): number => i * 65_537 + k;
  for (const c of discs) {
    for (let i = Math.floor((c.x - c.r) / CELL); i <= Math.floor((c.x + c.r) / CELL); i++) {
      for (let k = Math.floor((c.z - c.r) / CELL); k <= Math.floor((c.z + c.r) / CELL); k++) {
        const at = cellKey(i, k), list = cells.get(at);
        if (list) list.push(c); else cells.set(at, [c]);
      }
    }
  }
  return (x, y, z) => {
    let best: number | null = null;
    for (const c of cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []) {
      if (Math.hypot(x - c.x, z - c.z) > c.r || y < c.bed - UNDER || y > c.surface + OVER) continue;
      if (best === null || c.surface < best) best = c.surface;
    }
    return best;
  };
}
