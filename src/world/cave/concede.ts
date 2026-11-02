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
import { stampRamp, stampSlab } from './carve';
import { fieldAt } from '../dungeon/rockMesh';
import type { Dressing } from './dress';
import { PART_MIN, readField, reachFree, type Reading } from './reader';
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

/** How far down a line from `top` along `dir` a ramp can run (head room all the way, out over air, ending where the old floor meets the line or at `run`), or null. */
function rampFoot(f: BrickField, top: readonly [number, number, number], dir: readonly [number, number], run: number, slope: number, way: CavesDef['way']): number | null {
  let over = false;
  for (let t = 0; t <= run + 1e-6; t += 0.5) {
    const x = top[0] + dir[0] * t, z = top[2] + dir[1] * t, y = top[1] - slope * t;
    if (!bodyAt(f, x, y, z, way)) return null;
    if (fieldAt(f, x, y - 0.5, z) > 0.3) over = true;
    else if (over && fieldAt(f, x, y - 0.3, z) < 0) return t;
  }
  return over ? run : null;
}

/** Does the hero's body fit standing at floor height y (the reader's test: its radius clear of rock at the knee, the waist and the head)? */
const bodyAt = (f: BrickField, x: number, y: number, z: number, way: CavesDef['way']): boolean => [0.75, 1.3, way.stand - way.radius].every((h) => fieldAt(f, x, y + h, z) >= way.radius);

/** How far along `dir` from a ledge's floor point `top` the ledge goes on (standing room all the way) until air opens under it, or null (a wall first, or none within 10 m). */
function ledgeEdge(f: BrickField, top: readonly [number, number, number], dir: readonly [number, number], way: CavesDef['way']): number | null {
  for (let t = 0; t <= 10; t += 0.5) {
    const x = top[0] + dir[0] * t, z = top[2] + dir[1] * t;
    if (!bodyAt(f, x, top[1], z, way)) return null;
    if (fieldAt(f, x, top[1] - 0.5, z) > 0.3) return t;
  }
  return null;
}

/** Rounds of ramp-building at the most. */
const RAMP_ROUNDS = 16;

/**
 * The tall faces the only way on climbs (K5): the ground that a hero can walk in and out of using no face higher than `way.ramp.above`
 * is found; where a tall face is the way from it to ground it cannot walk (not reached, or not left), the cheapest such face of each lump
 * gets a rubble ramp at its foot, if the ramp has room (headroom all along and a foot on the ground). Returns the ramps built.
 */
function ramps(f: BrickField, r: Reading, caves: CavesDef): Opened[] {
  const way = caves.way, { above, slope, steep, half } = way.ramp, out: Opened[] = [];
  const tall = (a: number, e: number): boolean => r.edgeKind[e] === 1 && Math.abs(r.y[r.edgeTo[e]] - r.y[a]) > above;
  // Reached from a way in, and able to walk back to one, over no tall face.
  const fwd = reachFree(r, above, r.entries).reached, bck = new Uint8Array(r.count), rev: number[][] = Array.from({ length: r.count }, () => []);
  for (let a = 0; a < r.count; a++) for (let e = r.edgeStart[a]; e < r.edgeStart[a + 1]; e++) if (!tall(a, e)) rev[r.edgeTo[e]].push(a);
  const queue: number[] = [];
  for (const c of r.entries) { bck[c] = 1; queue.push(c); }
  for (let n = 0; n < queue.length; n++) { const b = queue[n]; for (const a of rev[b]) if (!bck[a]) { bck[a] = 1; queue.push(a); } }
  const good = (c: number): boolean => fwd[c] === 1 && bck[c] === 1;
  // The lumps of the rest (cells joined by any link), each with its cheapest tall face to good ground.
  const lump = new Int32Array(r.count).fill(-1), faces: { rise: number; lo: number; up: number }[] = [];
  let lumps = 0;
  for (let c0 = 0; c0 < r.count; c0++) {
    if (good(c0) || lump[c0] >= 0) continue;
    const id = lumps++, members = [c0]; lump[c0] = id;
    let best: { rise: number; lo: number; up: number } | undefined;
    for (let n = 0; n < members.length; n++) {
      const a = members[n];
      for (let e = r.edgeStart[a]; e < r.edgeStart[a + 1]; e++) {
        const b = r.edgeTo[e];
        if (!good(b) && lump[b] < 0) { lump[b] = id; members.push(b); }
        if (good(b) && tall(a, e)) { const rise = Math.abs(r.y[b] - r.y[a]), lo = r.y[a] < r.y[b] ? a : b; if (!best || rise < best.rise) best = { rise, lo, up: lo === a ? b : a }; }
      }
      // (Faces from good ground into the lump are the lump's too: the edge b -> a is stored with b.)
      for (const b of rev[a]) if (good(b)) for (let e = r.edgeStart[b]; e < r.edgeStart[b + 1]; e++) if (r.edgeTo[e] === a && tall(b, e)) { const rise = Math.abs(r.y[b] - r.y[a]), lo = r.y[a] < r.y[b] ? a : b; if (!best || rise < best.rise) best = { rise, lo, up: lo === a ? b : a }; }
    }
    if (best && members.length >= PIT_MIN) faces.push(best);
  }
  for (const { rise, lo, up } of faces) {
    // The ramp starts at the ledge's floor and runs away from the face over the lower ground: along the way from the ledge to the lower cell if
    // that has room, else the nearest heading that has (the ledge and the canyon seldom run the same way).
    const base = Math.atan2(r.z[lo] - r.z[up], r.x[lo] - r.x[up]), top: [number, number, number] = [r.x[up], r.y[up], r.z[up]];
    // (A steeper slope, up to the walker's own limit, where the room for the gentle one is not there.)
    let done = false;
    for (const sl of [slope, (slope + steep) / 2, steep]) {
      const run = rise / sl;
      for (let turn = 0; turn <= 12 && !done; turn++) {
        for (const sg of turn === 0 ? [1] : [1, -1]) {
          const dir: [number, number] = [Math.cos(base + sg * turn * Math.PI / 12), Math.sin(base + sg * turn * Math.PI / 12)], edge = ledgeEdge(f, top, dir, way);
          if (edge === null) continue;
          const from: [number, number, number] = [top[0] + dir[0] * edge, top[1], top[2] + dir[1] * edge], foot = rampFoot(f, from, dir, run, sl, way);
          if (foot === null) continue;
          stampRamp(f, from, dir, foot, sl, half);
          out.push({ a: from, b: [from[0] + dir[0] * foot, from[1] - sl * foot, from[2] + dir[1] * foot] });
          done = true;
          break;
        }
      }
      if (done) break;
    }
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
  // Tall faces the only way on climbs get a rubble ramp (read again after each round: a ramp joins what lay behind it). A ramp must never cost
  // ground: if the cave reads smaller than before the ramps (one filled a way), the field and the reading are put back as they were.
  const before = { reading, count: opened.length, bricks: f.bricks.map((b) => (b ? b.slice() : null)) };
  for (let round = 0; round < RAMP_ROUNDS && reading.entries.length; round++) {
    const built = ramps(f, reading, caves);
    if (!built.length) break;
    opened.push(...built);
    reading = readField(f, sk, caves, dressing, stopwatch);
  }
  if (reading.stats.reached < before.reading.stats.reached) {
    f.bricks.splice(0, f.bricks.length, ...before.bricks);
    opened.length = before.count;
    reading = before.reading;
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
    fittings: d.fittings.filter((k) => !cutsThrough(k.x, k.y, k.z)),
  };
}
