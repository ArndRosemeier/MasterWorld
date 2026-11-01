/**
 * The concession (D63, phase K4; docs/design/caves.md 3.6; pure, runs in a worker): from the ways in, the network is read and
 * what it cuts off gets the smallest change that opens it. A part that cannot be reached, and a pit that can be dropped into
 * but not left, is joined to the ground that can walk out by a hero-sized way (2.2 m wide, 3 m high, the setting's
 * `way` sizes) from the nearest of its cells to the nearest cell of that ground, if that is within `maxCut` metres; a
 * stretch that is still out of reach stays as it is, seen and not reached (a sump that goes on, a crack with a breeze).
 * The rounds read the field again after each change; the loose things the new way cuts through are taken away.
 */
import type { CavesDef } from '../../setting/contract';
import type { BrickField } from '../dungeon/rockMesh';
import { stampSlab } from './carve';
import type { Dressing } from './dress';
import { PART_MIN, readField, type Reading } from './reader';
import type { Skeleton } from './skeleton';

/** A way cut by the concession: from one floor point to another. */
export interface Opened {
  readonly a: readonly [number, number, number];
  readonly b: readonly [number, number, number];
}

/** Pits of fewer cells than this are not worth a way out. */
const PIT_MIN = 4;
/** Rounds of read and open at the most. */
const ROUNDS = 5;

/** The cells that cannot be reached or left, in lumps of cells joined by links. */
function lumps(r: Reading): number[][] {
  const bad = (c: number): boolean => r.depth[c] === Infinity || !r.back[c];
  const seen = new Uint8Array(r.count), out: number[][] = [];
  for (let c0 = 0; c0 < r.count; c0++) {
    if (seen[c0] || !bad(c0)) continue;
    const lump = [c0]; seen[c0] = 1;
    for (let n = 0; n < lump.length; n++) {
      const a = lump[n];
      for (let e = r.edgeStart[a]; e < r.edgeStart[a + 1]; e++) { const b = r.edgeTo[e]; if (!seen[b] && bad(b)) { seen[b] = 1; lump.push(b); } }
      // Links into the lump from outside (one-way drops) count too: cells that only drop into it are not in it.
    }
    const unreached = r.depth[c0] === Infinity;
    if (lump.length >= (unreached ? PART_MIN : PIT_MIN)) out.push(lump);
  }
  return out;
}

/** Read the cave and open what is cut off; the field is changed. Returns the last reading and the ways cut. */
export function concede(f: BrickField, sk: Skeleton, caves: CavesDef, dressing?: Dressing, stopwatch: () => number = Date.now): { reading: Reading; opened: Opened[]; ms: number } {
  const t0 = stopwatch(), way = caves.way, opened: Opened[] = [];
  const half = way.minWidth / 2 + 0.3, height = way.minHeight + 0.4, reach = way.maxCut;
  let reading = readField(f, sk, caves, dressing, stopwatch), prev = Infinity;
  for (let round = 0; round < ROUNDS && reading.entries.length; round++) {
    const r = reading, groups = lumps(r);
    if (!groups.length) break;
    // Each cell's group: 0 the ground that walks out, 1.. the lumps that cannot be reached or left (smaller bits are left alone).
    const label = new Int32Array(r.count).fill(-1);
    for (let c = 0; c < r.count; c++) if (r.depth[c] < Infinity && r.back[c]) label[c] = 0;
    groups.forEach((g, i) => { for (const c of g) label[c] = i + 1; });
    // The closest pair of cells for each two groups within reach, from a hash of 7 m cells.
    const grid = new Map<number, number[]>(), G = 7, span = Math.ceil(reach / G);
    const key = (x: number, y: number, z: number): number => Math.floor(x / G) + 4096 * (Math.floor(z / G) + 4096 * Math.floor(y / G));
    for (let c = 0; c < r.count; c++) if (label[c] >= 0) { const k = key(r.x[c], r.y[c], r.z[c]), l = grid.get(k); if (l) l.push(c); else grid.set(k, [c]); }
    const best = new Map<number, { d: number; a: number; b: number }>();
    const n = groups.length + 1;
    for (let b = 0; b < r.count; b++) {
      const lb = label[b];
      if (lb <= 0) continue;
      const bx = r.x[b], by = r.y[b], bz = r.z[b];
      for (let dz = -span; dz <= span; dz++) for (let dy = -span; dy <= span; dy++) for (let dx = -span; dx <= span; dx++) {
        const l = grid.get(key(bx + dx * G, by + dy * G, bz + dz * G));
        if (!l) continue;
        for (const a of l) {
          const la = label[a];
          if (la === lb || la > lb) continue;
          const h = Math.hypot(r.x[a] - bx, r.z[a] - bz), dy = Math.abs(r.y[a] - by), d = Math.hypot(h, dy) + 3 * Math.max(0, dy - 1.2 * h);
          if (d > reach) continue;
          const k = la * n + lb, cur = best.get(k);
          if (!cur || d < cur.d) best.set(k, { d, a, b });
        }
      }
    }
    // The shortest ways first, each joining two groups not joined yet.
    const up = new Int32Array(n).map((_, i) => i);
    const find = (i: number): number => { while (up[i] !== i) { up[i] = up[up[i]]; i = up[i]; } return i; };
    let cut = 0;
    for (const [k, v] of [...best.entries()].sort((p, q) => p[1].d - q[1].d)) {
      const la = Math.floor(k / n), lb = k % n, ra = find(la), rb = find(lb);
      if (ra === rb) continue;
      up[Math.max(ra, rb)] = Math.min(ra, rb);
      const pa: [number, number, number] = [r.x[v.a], r.y[v.a], r.z[v.a]], pb: [number, number, number] = [r.x[v.b], r.y[v.b], r.z[v.b]];
      stampSlab(f, pa, pb, half, height);
      opened.push({ a: pa, b: pb });
      cut++;
    }
    if (!cut) break;
    const left = r.count - r.stats.reached + r.stats.trapped;
    if (round > 0 && left >= prev) break;
    prev = left;
    reading = readField(f, sk, caves, dressing, stopwatch);
  }
  return { reading, opened, ms: stopwatch() - t0 };
}

/** A dressing without what the opened ways cut through (loose things within 1.8 m of a way's line). */
export function clearOpened(d: Dressing, opened: readonly Opened[]): Dressing {
  if (!opened.length) return d;
  const R = 1.8;
  const cutsThrough = (x: number, y: number, z: number): boolean => opened.some(({ a, b }) => {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2], t = Math.max(0, Math.min(1, ((x - a[0]) * abx + (y - a[1]) * aby + (z - a[2]) * abz) / (abx * abx + aby * aby + abz * abz || 1)));
    return Math.hypot(x - (a[0] + abx * t), y - (a[1] + 1.2 + aby * t), z - (a[2] + abz * t)) < R + 1.2;
  });
  return {
    ...d,
    speleos: d.speleos.filter((s) => !(cutsThrough(s.x, s.y0, s.z) || cutsThrough(s.x, s.y1, s.z))),
    stones: d.stones.filter((s) => s.ore >= 0 || !cutsThrough(s.x, s.y, s.z)),
    crystals: d.crystals.filter((c) => !cutsThrough(c.x, c.y, c.z)),
    rocks: d.rocks.filter((k) => !cutsThrough(k.x, k.y, k.z)),
    drips: d.drips.filter((p) => !cutsThrough(p.x, p.y, p.z)),
  };
}
