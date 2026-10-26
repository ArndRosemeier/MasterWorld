/**
 * Fresh water for settlements (D49): every town, village and hamlet stands by a river or a lake, so its
 * people have water. One rule for all of them: the start town (vgm/builder.ts) and the places the VGM opens
 * on the frontier (vgm/frontier.ts) both ask here. The sea does not count: it is salt. Pure.
 */
import type { Terrain } from './terrain';

/** How far beyond a settlement's edge its fresh water may lie, metres. */
export const WATER_REACH = 120;
/** Gaps (metres) between a river's edge and a settlement's edge that bank spots are offered at. */
const BANK_GAPS = [25, 60];
/** Rings (metres apart) and directions a lake shore is looked for on. */
const LAKE_RING = 30;
const LAKE_DIRS = 12;

type Land = Pick<Terrain, 'hydro' | 'height' | 'clearOfWater'>;

const wet = { river: 0, lake: 0 };

/** Metres from (x, z) to the nearest fresh water (a river's edge, or a lake's surface), if any lies within `within`; else Infinity. */
export function freshWaterEdge(t: Land, x: number, z: number, within: number): number {
  let best = t.hydro.riverEdge(x, z, within);
  // Lakes: the nearest ring with ground under a lake's level.
  for (let d = 0; d <= Math.min(within, best); d += LAKE_RING) {
    const dirs = d === 0 ? 1 : LAKE_DIRS;
    for (let a = 0; a < dirs; a++) {
      const px = x + Math.cos((a / dirs) * Math.PI * 2) * d, pz = z + Math.sin((a / dirs) * Math.PI * 2) * d;
      if (t.clearOfWater(px, pz, t.height(px, pz), wet).lake < 0) return Math.min(best, d);
    }
  }
  return best;
}

/** Does a settlement of radius `r` round (x, z) have fresh water within reach of its edge? */
export function byFreshWater(t: Land, x: number, z: number, r: number): boolean {
  return freshWaterEdge(t, x, z, r + WATER_REACH) <= r + WATER_REACH;
}

/** A spot beside a river: where a settlement's middle could go, and the river's edge distance from it. */
export interface BankSpot {
  x: number;
  z: number;
  /** Metres from the spot to the river's edge. */
  edge: number;
}

/**
 * Spots for a settlement of radius `r` along the rivers within `within` metres of (x, z): on both banks,
 * its edge a little back from the water. Every `every`-th river point (they lie 80 m apart). Lakes offer
 * none: the caller's own grid finds their shores.
 */
export function bankSpots(t: Land, x: number, z: number, within: number, r: number, every = 1): BankSpot[] {
  const out: BankSpot[] = [];
  t.hydro.riverPoints(x, z, within, (rv, k) => {
    if (k % every) return;
    const n = rv.level.length;
    const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
    const dx = rv.xz[b * 2] - rv.xz[a * 2], dz = rv.xz[b * 2 + 1] - rv.xz[a * 2 + 1], l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l, nz = dx / l, half = rv.half[k];
    for (const gap of BANK_GAPS) for (const side of [-1, 1]) {
      const off = half + gap + r;
      out.push({ x: rv.xz[k * 2] + nx * off * side, z: rv.xz[k * 2 + 1] + nz * off * side, edge: gap + r });
    }
  });
  return out;
}
