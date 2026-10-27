/**
 * Bridges where a road crosses a brook (D50). A brook runs under the road through a culvert (the road's bed
 * is levelled over it, terrain.ts), so walking stays on the land. Here its sides are walled in stone from
 * the brook's bed to a low parapet, with the dark mouth of the arch over the water, and the land beside
 * the walls drops straight to the brook (RoadNet.level with `bridgeBank`). Rivers keep their fords. Pure.
 */
import { smoothstep } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { Hydrology, WaterHere } from './hydro';
import { emptyWater, inChannel } from './hydro';
import { WALLED, WAY_WIDTH, type RoadNet } from './roads';
import type { RoadDecision } from './decisions';
import { BuildingMat as M, MeshKit, type Tint } from './dungeon/meshKit';

/** Past a brook's edge the road's side is walled out to this, m. */
export const BRIDGE_REACH = 3;
/** Sampling step along the road, m. */
const STEP = 1;

/**
 * How much of a bridge's walled side a road point beside brook `w` is (0 none .. 1 walled). Roads often
 * follow a valley and cross its brook at a slant: a long bridge then, never a gap.
 */
export function bridgeBank(w: WaterHere): number {
  if (!w.brook || !w.river) return 0;
  return 1 - smoothstep(w.half + 1, w.half + BRIDGE_REACH, w.dist);
}

/** One walled side of a bridge, along the road's edge. */
export interface BridgeWall {
  /** Its points along the road's edge every STEP m: x, z and the road's height there. */
  readonly pts: readonly number[];
  /** Outward (away from the road) unit direction at each point: x, z. */
  readonly out: readonly number[];
  /** Its foot (below the brook's bed). */
  readonly foot: number;
  /** The brook's level, and the points over its water (first, last index). */
  readonly level: number;
  readonly w0: number;
  readonly w1: number;
}

export interface Bridge {
  /** The road's id and the metres along it where the bridge starts. */
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly walls: readonly BridgeWall[];
}

/** A road's centre line sampled every STEP m: x, y, z, and its unit direction dx, dz. */
function samples(d: RoadDecision): number[][] {
  const p = d.pts, n = p.length / 3, out: number[][] = [];
  let carry = 0;
  for (let k = 0; k + 1 < n; k++) {
    const ax = p[k * 3], ay = p[k * 3 + 1], az = p[k * 3 + 2], dx = p[k * 3 + 3] - ax, dy = p[k * 3 + 4] - ay, dz = p[k * 3 + 5] - az;
    const L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    for (let s = carry; s < L; s += STEP) out.push([ax + dx * s / L, ay + dy * s / L, az + dz * s / L, dx / L, dz / L]);
    carry = (carry - L) % STEP;
    if (carry < 0) carry += STEP;
  }
  return out;
}

/**
 * The bridges on road `d` where its points are within `reach` of (x, z) and `ready` there (the brooks are
 * known: the main thread asks only where its brook tiles have come). A crossing at the edge of that is left
 * for a later ask, so a bridge is always whole.
 */
export function bridgesOn(d: RoadDecision, hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean): Bridge[] {
  const s = samples(d), half = WAY_WIDTH[d.way] / 2, w = emptyWater();
  const near = s.map(([px, , pz]) => Math.hypot(px - x, pz - z) < reach && ready(px, pz));
  // Walled where a point beside the road (at its wall) is: out = +1 on the left, -1 on the right.
  const walled = (i: number, side: number, past: number): WaterHere | null => {
    const [px, , pz, dx, dz] = s[i];
    const o = half + 0.5;
    hydro.brookAt(px - dz * o * side, pz + dx * o * side, w);
    return bridgeBank(w) > 0 && inChannel(w, past) ? w : null;
  };
  const centre = (i: number): boolean => {
    hydro.brookAt(s[i][0], s[i][2], w);
    return bridgeBank(w) > 0;
  };
  const out: Bridge[] = [];
  for (let i = 0; i < s.length; i++) {
    if (!near[i] || !centre(i)) continue;
    let j = i;
    while (j + 1 < s.length && near[j + 1] && centre(j + 1)) j++;
    const a = i, b = j;
    i = j;
    // Cut off by the edge of what is known (or the road's ends): asked again later.
    const pad = Math.ceil((BRIDGE_REACH + 6) / STEP);
    if (a - pad < 0 || b + pad >= s.length || !near[a - pad] || !near[b + pad]) continue;
    const walls: BridgeWall[] = [];
    for (const side of [1, -1]) {
      let first = -1, last = -1, w0 = -1, w1 = -1, foot = Infinity, level = -Infinity;
      for (let k = a - pad; k <= b + pad; k++) {
        const h = walled(k, side, BRIDGE_REACH);
        if (!h) continue;
        if (first < 0) first = k;
        last = k;
        foot = Math.min(foot, h.level - h.depth - 0.4);
        if (inChannel(h, 0.3)) { if (w0 < 0) w0 = k; w1 = k; level = Math.max(level, h.level); }
      }
      if (first < 0) continue;
      const pts: number[] = [], dir: number[] = [];
      for (let k = first; k <= last + 1 && k < s.length; k++) {
        const [px, py, pz, dx, dz] = s[k];
        pts.push(px - dz * half * side, pz + dx * half * side, py);
        dir.push(-dz * side, dx * side);
      }
      walls.push({ pts, out: dir, foot, level: w0 < 0 ? foot : level, w0: w0 < 0 ? -1 : w0 - first, w1: w0 < 0 ? -1 : w1 - first });
    }
    if (!walls.length) continue;
    const m = (a + b) >> 1;
    out.push({ id: `${d.id}@${Math.round(a * STEP)}`, x: s[m][0], z: s[m][2], walls });
  }
  return out;
}

/** Every bridge on the roads of `net` near (x, z). */
export function bridgesNear(net: RoadNet, hydro: Hydrology, x: number, z: number, reach: number, ready: (x: number, z: number) => boolean): Bridge[] {
  return net.roads.flatMap((d) => bridgesOn(d, hydro, x, z, reach, ready));
}

const STONE: Tint = [132, 126, 116];
const DARK: Tint = [14, 14, 16];
/** Wall thickness (to the road's walled bed), parapet height and thickness, m. */
const WALL = WALLED.bed + 0.1, PARAPET = 0.8, PARAPET_T = 0.4;

/** A bridge's walls as a building mesh (the town's one building shader), around (x, 0, z) = (b.x, 0, b.z). */
export function bridgeMesh(b: Bridge): BuildingMesh {
  const k = new MeshKit();
  for (const wl of b.walls) {
    const p = wl.pts, o = wl.out, n = p.length / 3;
    for (let i = 0; i + 1 < n; i++) {
      const ax = p[i * 3] - b.x, az = p[i * 3 + 1] - b.z, bx = p[i * 3 + 3] - b.x, bz = p[i * 3 + 4] - b.z;
      const y = Math.max(p[i * 3 + 2], p[i * 3 + 5]);
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) + 0.06, yaw = Math.atan2(dx, dz);
      const ox = o[i * 2], oz = o[i * 2 + 1], mx = (ax + bx) / 2, mz = (az + bz) / 2;
      // The side (from its foot to the road's height, under the bed's edge) and the parapet on it.
      const c = WALL / 2 - 0.05, q = PARAPET_T / 2 + 0.05;
      k.box(mx + ox * c, wl.foot, mz + oz * c, WALL, y + 0.12 - wl.foot, L, yaw, M.Rubble, STONE);
      k.box(mx + ox * q, y, mz + oz * q, PARAPET_T, PARAPET, L, yaw, M.Ashlar, STONE);
      // The arch's dark mouth over the water, just proud of the side.
      if (wl.w0 < 0 || i < wl.w0 || i >= wl.w1 + 1) continue;
      const span = wl.w1 + 1 - wl.w0, rise = Math.max(0.25, Math.min(y - 0.35 - wl.level, span / 2));
      const top = (t: number) => wl.level + rise * Math.sqrt(Math.max(0, 1 - (2 * t / span - 1) ** 2));
      const f = WALL - 0.04, t0 = top(i - wl.w0), t1 = top(i + 1 - wl.w0);
      const A = [ax + ox * f, wl.foot, az + oz * f], B = [bx + ox * f, wl.foot, bz + oz * f];
      // Seen from outside: counter-clockwise from that side.
      const quad = [A, B, [B[0], t1, B[2]], [A[0], t0, A[2]]];
      const facing = (B[0] - A[0]) * oz - (B[2] - A[2]) * ox > 0;
      const [q0, q1, q2, q3] = facing ? quad : [quad[1], quad[0], quad[3], quad[2]];
      k.quad(q0, q1, q2, q3, [[0, 0], [1, 0], [1, 1], [0, 1]], M.Rubble, DARK);
    }
  }
  return k.mesh();
}
