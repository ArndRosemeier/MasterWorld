/**
 * Where people can walk in a town (plan 9.3): a graph along the centre lines of its streets, joined
 * where streets meet, with the market as one open hub. Paths run along streets from the street nearest
 * the start to the street nearest the goal; the last steps off the street are straight. Pure.
 */
import { MinHeap } from '@futuremagic/core';
import { polyCentroid, pointInPoly, distToPoly, type TownBuilding, type TownPlan } from '@futuremagic/settlement';

/** Street nodes at most this far apart (m). */
const STEP = 6;
/** Nodes nearer than this are one (where streets meet). */
const JOIN = 3.5;
/** Spatial grid cell for lookups (m). */
const GRID = 16;

export class NavGraph {
  readonly xs: number[] = [];
  readonly zs: number[] = [];
  readonly adj: number[][] = [];
  private readonly grid = new Map<string, number[]>();

  constructor(plan: TownPlan) {
    for (const s of plan.streets) {
      const pts = s.closed ? [...s.pts, s.pts[0], s.pts[1]] : s.pts;
      let prev = -1;
      for (let k = 0; k + 1 < pts.length; k += 2) {
        if (k > 0) {
          // Fill long segments so every stretch of street has a node near it.
          const ax = pts[k - 2], az = pts[k - 1], bx = pts[k], bz = pts[k + 1];
          const n = Math.ceil(Math.hypot(bx - ax, bz - az) / STEP);
          for (let i = 1; i < n; i++) prev = this.link(prev, this.node(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n));
        }
        prev = this.link(prev, this.node(pts[k], pts[k + 1]));
      }
    }
    // The market: one hub joined to every node on it or at its edge.
    const [mx, mz] = polyCentroid(plan.market);
    const hub = this.node(mx, mz, false);
    for (let i = 0; i < this.xs.length; i++) {
      if (i !== hub && (pointInPoly(plan.market, this.xs[i], this.zs[i]) || distToPoly(plan.market, this.xs[i], this.zs[i]) < JOIN)) this.link(i, hub);
    }
  }

  /** The node nearest a point (with `dir`: only nodes on that side of it, if there are any near). */
  nearest(x: number, z: number, dir?: [number, number]): number {
    if (dir) {
      const best = this.nearestWhere(x, z, (n) => (this.xs[n] - x) * dir[0] + (this.zs[n] - z) * dir[1] > 0);
      if (best >= 0) return best;
    }
    return this.nearestWhere(x, z, () => true);
  }

  private nearestWhere(x: number, z: number, ok: (n: number) => boolean): number {
    const gi = Math.floor(x / GRID), gj = Math.floor(z / GRID);
    let best = -1, bd = Infinity;
    for (let r = 0; r < 8 && (best < 0 || (r - 1) * GRID < Math.sqrt(bd)); r++) {
      for (let j = gj - r; j <= gj + r; j++) for (let i = gi - r; i <= gi + r; i++) {
        if (Math.max(Math.abs(i - gi), Math.abs(j - gj)) !== r) continue;
        for (const n of this.grid.get(`${i},${j}`) ?? []) {
          if (!ok(n)) continue;
          const d = (this.xs[n] - x) ** 2 + (this.zs[n] - z) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
      }
    }
    return best;
  }

  /**
   * A walk from (ax, az) to (bx, bz): x, z pairs, both ends included. `aDir`, `bDir`: the side an end
   * opens to (out of a door), so the walk joins the street in front of a house, not the one behind it.
   */
  path(ax: number, az: number, bx: number, bz: number, aDir?: [number, number], bDir?: [number, number]): number[] {
    const a = this.nearest(ax, az, aDir), b = this.nearest(bx, bz, bDir);
    const direct = Math.hypot(bx - ax, bz - az);
    // Close by and nearer than the street: straight there.
    if (a < 0 || b < 0 || a === b || direct < Math.hypot(this.xs[a] - ax, this.zs[a] - az) + Math.hypot(this.xs[b] - bx, this.zs[b] - bz)) return [ax, az, bx, bz];
    const out = [ax, az];
    for (const n of this.route(a, b)) out.push(this.xs[n], this.zs[n]);
    out.push(bx, bz);
    return out;
  }

  /** A* over the nodes. */
  private route(a: number, b: number): number[] {
    const n = this.xs.length, g = new Float64Array(n).fill(Infinity), from = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    const h = (i: number) => Math.hypot(this.xs[i] - this.xs[b], this.zs[i] - this.zs[b]);
    const open = new MinHeap();
    open.push(h(a), a);
    g[a] = 0;
    while (open.size) {
      const i = open.pop();
      if (done[i]) continue;
      done[i] = 1;
      if (i === b) break;
      for (const j of this.adj[i]) {
        const c = g[i] + Math.hypot(this.xs[j] - this.xs[i], this.zs[j] - this.zs[i]);
        if (c < g[j]) { g[j] = c; from[j] = i; open.push(c + h(j), j); }
      }
    }
    if (from[b] < 0) return [a, b];
    const out: number[] = [];
    for (let i = b; i >= 0; i = from[i]) out.push(i);
    return out.reverse();
  }

  private node(x: number, z: number, join = true): number {
    if (join) {
      const near = this.nearest(x, z);
      if (near >= 0 && Math.hypot(this.xs[near] - x, this.zs[near] - z) < JOIN) return near;
    }
    const i = this.xs.length;
    this.xs.push(x); this.zs.push(z); this.adj.push([]);
    const key = `${Math.floor(x / GRID)},${Math.floor(z / GRID)}`;
    const cell = this.grid.get(key);
    if (cell) cell.push(i); else this.grid.set(key, [i]);
    return i;
  }

  private link(a: number, b: number): number {
    if (a >= 0 && a !== b && !this.adj[a].includes(b)) { this.adj[a].push(b); this.adj[b].push(a); }
    return b;
  }
}

/**
 * Waypoints from just outside a building's door to a point behind or beside it, around the house
 * (not through it): along the front to a corner, down the side, then to the point.
 */
export function aroundHouse(b: TownBuilding, x: number, z: number): number[] {
  const ux = Math.cos(b.angle), uz = Math.sin(b.angle);
  const du = (x - b.cx) * ux + (z - b.cz) * uz, dv = (x - b.cx) * b.vx + (z - b.cz) * b.vz;
  // In front of the house: straight from the door.
  if (dv < -b.hv) return [];
  const s = du >= 0 ? 1 : -1, eu = (b.hu + 0.9) * s, ev = b.hv + 0.9;
  const at = (u: number, v: number) => [b.cx + ux * u + b.vx * v, b.cz + uz * u + b.vz * v];
  return dv > b.hv ? [...at(eu, -ev), ...at(eu, ev)] : at(eu, -ev);
}
