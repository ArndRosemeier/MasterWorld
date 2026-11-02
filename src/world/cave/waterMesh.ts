/**
 * The water of a formed cave as a mesh (D63, K3; pure): the surface of each stream and pool, cut off where the floor rises to
 * it. A stream's surface lies at the height of its nearest point (streams run downhill), a pool's at its own; the mesh is a
 * grid of 0.3 m cells in which a corner has water where the surface stands over the floor within the bed's depth, and a cell
 * is cut along the line where the depth falls to nothing (marching squares), so the shore follows the carved floor and is no
 * straight edge. Every vertex carries the water's depth over the floor (0 on the shore), its speed (from how fast the surface
 * falls along the stream) and its direction, which the cave water shader reads (as the outside water reads them from its
 * masks).
 */
import { fieldAt, type BrickField } from '../dungeon/rockMesh';
import type { Dressing } from './dress';

export interface WaterMesh {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  /** Per vertex: the water's depth (m) and its speed (m/s). */
  readonly uv: Float32Array;
  /** Per vertex: the direction it runs (x, z; unit, or 0) and 0. */
  readonly flow: Float32Array;
  readonly index: Uint32Array;
}

/** The height of the rock's floor under (x, z) near height y, as carved (the water's depth is read off it). */
export type FloorOf = (x: number, y: number, z: number) => number;

/** The floor of a carved cave under (x, z) near height y: down from a little over y to the first rock (the sign change of the field, found to a few centimetres). */
export function floorUnder(f: BrickField): FloorOf {
  const UP = 0.9, DOWN = 2.2, STEP = 0.08;
  return (x, y, z) => {
    let above = fieldAt(f, x, y + UP, z, -1), h = y + UP;
    // Rock already at the top of the column: the floor is no lower than that.
    if (above <= 0) return h;
    for (; h > y - DOWN; h -= STEP) {
      const below = fieldAt(f, x, h - STEP, z, -1);
      // Air above, rock below: the surface lies where the field crosses zero between them.
      if (below <= 0) return h - (STEP * above) / (above - below);
      above = below;
    }
    return y - DOWN;
  };
}

/** The grid's cell (m), and how far past a stream's or pool's edge the water's grid reaches (m). */
const CELL = 0.3, BEYOND = 0.5;
/** The water ends where the floor has fallen this much below the surface past the depth of the bed (m): water does not hang over a drop. */
const SLACK = 0.35;

/** A point of water: where the surface stands, how it runs, and how deep the bed beneath it is cut. */
interface Source { readonly x: number; readonly z: number; readonly y: number; readonly speed: number; readonly fx: number; readonly fz: number; readonly cap: number; readonly reach: number }

/**
 * The water mesh of a dressing; `bed` is how deep the stream's bed is cut (the setting's `dress.water.bed`), `poolDepth` a
 * pool's. `floor` reads the carved floor under the surface. Without it the beds' own shape stands for the floor (a ribbon
 * and fans of pools, as the dresser cut them; for tests of the dressing alone).
 */
export function waterMesh(d: Dressing, bed: number, poolDepth: number, floor?: FloorOf): WaterMesh {
  const sources: Source[] = [];
  for (const s of d.streams) {
    // Downhill: from the higher end to the lower.
    const pts = s.pts[0][1] < s.pts[s.pts.length - 1][1] ? [...s.pts].reverse() : s.pts;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
      const far = pts[Math.max(0, i - 3)], near = pts[Math.min(pts.length - 1, i + 3)], run = Math.hypot(near[0] - far[0], near[2] - far[2]) || 1;
      const speed = Math.max(0.3, Math.min(3.4, 0.35 + 7 * Math.max(0, (far[1] - near[1]) / run)));
      sources.push({ x: p[0], z: p[2], y: p[1], speed, fx: dx / l, fz: dz / l, cap: bed + SLACK, reach: p[3] * 1.15 + BEYOND });
    });
  }
  for (const p of d.pools) sources.push({ x: p.x, z: p.z, y: p.y, speed: 0, fx: 0, fz: 0, cap: poolDepth + SLACK, reach: p.r * 1.15 + BEYOND });
  if (!sources.length) return { position: new Float32Array(0), normal: new Float32Array(0), uv: new Float32Array(0), flow: new Float32Array(0), index: new Uint32Array(0) };

  // Each grid corner within reach of a source belongs to the nearest one (its level, speed and direction).
  const owner = new Map<number, { src: Source; d2: number }>();
  const KEY = 1 << 15;
  const cornerKey = (i: number, k: number): number => (i + KEY) * 65536 + (k + KEY);
  for (const s of sources) {
    const i0 = Math.floor((s.x - s.reach) / CELL), i1 = Math.ceil((s.x + s.reach) / CELL), k0 = Math.floor((s.z - s.reach) / CELL), k1 = Math.ceil((s.z + s.reach) / CELL);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      const d2 = (i * CELL - s.x) ** 2 + (k * CELL - s.z) ** 2;
      if (d2 > s.reach * s.reach) continue;
      const key = cornerKey(i, k), was = owner.get(key);
      if (!was || d2 < was.d2) owner.set(key, { src: s, d2 });
    }
  }
  // The depth of the water at each corner: the surface over the floor, down to the cap as it is, then falling away to nothing (negative: no water).
  const depthOf = new Map<number, number>();
  const corner = (i: number, k: number): number => {
    const key = cornerKey(i, k), have = depthOf.get(key);
    if (have !== undefined) return have;
    const o = owner.get(key);
    let v = -1;
    if (o) {
      const s = o.src, x = i * CELL, z = k * CELL;
      if (floor) {
        const dd = s.y - floor(x, s.y, z);
        v = dd <= s.cap ? dd : s.cap - (dd - s.cap) * 2;
        // And no water past the source's own reach, whatever the floor: it thins out towards it, so the shore is a curve and no straight cut.
        v = Math.min(v, 2 * s.cap * (1 - Math.sqrt(o.d2) / s.reach));
      } else {
        // The bed's own shape: deepest at the source, none at its reach.
        v = (s.cap - SLACK) * (1 - Math.hypot(x - s.x, z - s.z) / s.reach);
      }
    }
    depthOf.set(key, v);
    return v;
  };

  const pos: number[] = [], uv: number[] = [], flow: number[] = [], idx: number[] = [];
  const made = new Map<number | string, number>();
  const addVertex = (key: number | string, x: number, z: number, depth: number, s: Source): number => {
    const have = made.get(key);
    if (have !== undefined) return have;
    pos.push(x, s.y, z); uv.push(depth, s.speed); flow.push(s.fx, s.fz, 0);
    const n = pos.length / 3 - 1;
    made.set(key, n);
    return n;
  };
  // The cells touching an owned corner, cut along the shore.
  const cells = new Set<number>();
  for (const key of owner.keys()) {
    const i = Math.floor(key / 65536) - KEY, k = (key % 65536) - KEY;
    for (const [a, b] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) cells.add(cornerKey(i + a, k + b));
  }
  for (const ck of cells) {
    const i = Math.floor(ck / 65536) - KEY, k = (ck % 65536) - KEY;
    // Corners in an order that faces up: (i, k), (i, k + 1), (i + 1, k + 1), (i + 1, k).
    const cs: [number, number][] = [[i, k], [i, k + 1], [i + 1, k + 1], [i + 1, k]];
    const ds = cs.map(([a, b]) => corner(a, b));
    if (ds.every((v) => v <= 0)) continue;
    const poly: number[] = [], any = cs.map(([a, b]) => owner.get(cornerKey(a, b))?.src).find((x) => x)!;
    for (let n = 0; n < 4; n++) {
      const m = (n + 1) % 4, [a, b] = cs[n], [c, e] = cs[m], d0 = ds[n], d1 = ds[m];
      const sA = owner.get(cornerKey(a, b))?.src ?? any, sB = owner.get(cornerKey(c, e))?.src ?? any;
      if (d0 > 0) poly.push(addVertex(cornerKey(a, b), a * CELL, b * CELL, d0, sA));
      if ((d0 > 0) !== (d1 > 0)) {
        // The shore on this edge: where the depth falls to nothing.
        const t = d0 / (d0 - d1), x = (a + (c - a) * t) * CELL, z = (b + (e - b) * t) * CELL;
        const src = d0 > 0 ? sA : sB, ka = cornerKey(a, b), kb = cornerKey(c, e);
        poly.push(addVertex(ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`, x, z, 0, src));
      }
    }
    for (let n = 1; n + 1 < poly.length; n++) idx.push(poly[0], poly[n], poly[n + 1]);
  }
  const normal = new Float32Array(pos.length);
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
  return { position: Float32Array.from(pos), normal, uv: Float32Array.from(uv), flow: Float32Array.from(flow), index: Uint32Array.from(idx) };
}
