/**
 * Roads on the land (plan 7): the road decisions of the log, indexed so any point finds the road beside it
 * quickly. A road levels the ground it runs on (its profile, cut and filled, with sloped shoulders), keeps
 * trees and grass off, and the terrain shader draws it from a mask of these distances. Pure: runs in workers.
 */
import { smoothstep } from '@futuremagic/core';
import type { RoadDecision, RoadWay } from './decisions';
import type { MaskJob } from './water';

/** Width of each kind of road, m. */
export const WAY_WIDTH: Readonly<Record<RoadWay, number>> = { path: 1.8, track: 3.6, road: 5.5 };
/** The kinds in the order the shader knows them (the mask's way channel). */
export const WAYS: readonly RoadWay[] = ['path', 'track', 'road'];
/** Ground beside the road eases back to the land over this many metres. */
export const SHOULDER = 7;
/** How far from a road's edge anything asks about it, m (the shoulders, the trees' clearance). */
export const ROAD_REACH = 16;
/** Index cell, m. */
const CELL = 32;

/** The nearest road at a point. */
export interface RoadHere {
  /** Signed distance from the centre line, m (positive on the left, looking along the road). */
  across: number;
  /** Distance from the road's edge, m (negative on the road). */
  edge: number;
  /** Half the road's width, m. */
  half: number;
  /** The road's height here (its profile). */
  y: number;
  /** Index into WAYS. */
  way: number;
  /** Metres along the road from its start. */
  along: number;
  /** 1 on the road, easing to 0 over the first and last 20 m (where it meets the land or a town's road). */
  hold: number;
  /** Unit direction of the road here (x, z). */
  dx: number;
  dz: number;
}

export const emptyRoad = (): RoadHere => ({ across: 0, edge: Infinity, half: 0, y: 0, way: 0, along: 0, hold: 0, dx: 0, dz: 1 });

interface Road {
  readonly d: RoadDecision;
  readonly half: number;
  readonly way: number;
  /** Metres along at each point. */
  readonly s: Float64Array;
}

export class RoadNet {
  private readonly list: Road[] = [];
  /** Cell key → segment refs (road index × 65536 + point index). */
  private readonly cells = new Map<number, number[]>();

  get roads(): readonly RoadDecision[] { return this.list.map((r) => r.d); }

  get empty(): boolean { return !this.list.length; }

  /** Lay a road (again: a decision already laid is skipped). */
  insert(d: RoadDecision): void {
    if (this.list.some((r) => r.d.id === d.id)) return;
    const p = d.pts, n = p.length / 3, s = new Float64Array(n);
    for (let k = 1; k < n; k++) s[k] = s[k - 1] + Math.hypot(p[k * 3] - p[k * 3 - 3], p[k * 3 + 2] - p[k * 3 - 1]);
    const ri = this.list.length;
    const half = WAY_WIDTH[d.way] / 2;
    this.list.push({ d, half, way: WAYS.indexOf(d.way), s });
    const grow = half + ROAD_REACH;
    for (let k = 0; k + 1 < n; k++) {
      const ax = p[k * 3], az = p[k * 3 + 2], bx = p[k * 3 + 3], bz = p[k * 3 + 5];
      const i0 = Math.floor((Math.min(ax, bx) - grow) / CELL), i1 = Math.floor((Math.max(ax, bx) + grow) / CELL);
      const j0 = Math.floor((Math.min(az, bz) - grow) / CELL), j1 = Math.floor((Math.max(az, bz) + grow) / CELL);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const key = cellKey(i, j);
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(ri * 65536 + k);
      }
    }
  }

  /** The nearest road within ROAD_REACH of its edge, into `out`; null where there is none. */
  nearest(x: number, z: number, out: RoadHere): RoadHere | null {
    const list = this.cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (!list) return null;
    let best = Infinity, found = false;
    for (const ref of list) {
      const r = this.list[Math.floor(ref / 65536)], k = ref % 65536, p = r.d.pts;
      const ax = p[k * 3], az = p[k * 3 + 2], dx = p[k * 3 + 3] - ax, dz = p[k * 3 + 5] - az;
      const L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const ex = x - ax - dx * t, ez = z - az - dz * t;
      const dist = Math.hypot(ex, ez), edge = dist - r.half;
      if (edge >= best || edge > ROAD_REACH) continue;
      best = edge;
      found = true;
      const L = Math.sqrt(L2), along = r.s[k] + L * t, total = r.s[r.s.length - 1];
      out.across = (dx * ez - dz * ex) / L >= 0 ? dist : -dist;
      out.edge = edge;
      out.half = r.half;
      out.y = p[k * 3 + 1] + (p[k * 3 + 4] - p[k * 3 + 1]) * t;
      out.way = r.way;
      out.along = along;
      out.hold = smoothstep(0, 20, Math.min(along, total - along));
      out.dx = dx / L;
      out.dz = dz / L;
    }
    return found ? out : null;
  }

  private readonly here = emptyRoad();

  /** The ground `h` at a point, levelled to the road beside it (the road's profile, sloping back over the shoulders). */
  level(x: number, z: number, h: number): number {
    const r = this.nearest(x, z, this.here);
    if (!r) return h;
    const w = (1 - smoothstep(0.5, SHOULDER, r.edge)) * r.hold;
    return h + (r.y - h) * w;
  }

  /** Metres from the nearest road's edge (negative on it); Infinity beyond ROAD_REACH. */
  fromEdge(x: number, z: number): number {
    return this.nearest(x, z, this.here)?.edge ?? Infinity;
  }

  /** Does any road pass within ROAD_REACH of the square [x0, x1] × [z0, z1]? Only `ids` if given. */
  passesNear(x0: number, z0: number, x1: number, z1: number, ids?: ReadonlySet<string>): boolean {
    for (const r of this.list) {
      if (ids && !ids.has(r.d.id)) continue;
      const p = r.d.pts, g = r.half + ROAD_REACH;
      for (let k = 0; k < p.length; k += 3) if (p[k] > x0 - g && p[k] < x1 + g && p[k + 2] > z0 - g && p[k + 2] < z1 + g) return true;
    }
    return false;
  }
}

const cellKey = (i: number, j: number): number => (i + 1048576) * 2097152 + (j + 1048576);

/**
 * Float RGBA per sample, row-major from (x0, z0), at pixel centres: R = signed distance from the nearest
 * road's centre line, G = its kind (WAYS), B = distance from its edge, A = metres along it. Far from
 * every road R and B hold ROAD_REACH.
 */
export function roadMask(net: RoadNet, job: MaskJob): Float32Array {
  const { x0, z0, size, res } = job, step = size / res;
  const out = new Float32Array(res * res * 4), here = emptyRoad();
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const o = (j * res + i) * 4;
    const r = net.nearest(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step, here);
    if (!r) { out[o] = ROAD_REACH; out[o + 2] = ROAD_REACH; continue; }
    out[o] = r.across;
    out[o + 1] = r.way;
    out[o + 2] = r.edge;
    out[o + 3] = r.along;
  }
  return out;
}
