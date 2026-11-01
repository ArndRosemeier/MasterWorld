/**
 * The reader of a formed cave (D63, phase K4; docs/design/caves.md 3.5; pure, runs in a worker): where can the hero stand and
 * go, read from the carved field itself, with no rooms assumed.
 *  - **cells**: the standable ground, one for each column of the field (about 0.6 m) and each span of air in it that has the
 *    standing hero's head room and body width;
 *  - **links** between neighbouring cells: walk (a step of at most `way.step`), climb (a face up to `way.climb`, cave rock is
 *    climbable, D56; two ways) and drop (down a face up to `way.drop`; one way). No squeezing: a link needs the standing
 *    hero's head room over both cells. (Swimming needs deep water, which formed caves get with their sumps in K6.)
 *  - the **network**: Dijkstra from the ways in gives each cell its depth (metres of way), what is reached and what can
 *    walk back out (a pit that can only be dropped into is a trap);
 *  - **places**: voids, alcoves, dead ends, junctions, ledges, the stream's bank and the ways in themselves, which the
 *    game puts lairs, treasure and set pieces in (K6).
 * `concede.ts` opens what the network cuts off.
 */
import { MinHeap } from '@futuremagic/core';
import type { CavesDef } from '../../setting/contract';
import { brickColumns, fieldAt, type BrickField } from '../dungeon/rockMesh';
import { columnSpans, type Dressing } from './dress';
import type { Skeleton } from './skeleton';

export type LinkKind = 'walk' | 'climb' | 'drop';
const KIND: readonly LinkKind[] = ['walk', 'climb', 'drop'];

export type PlaceKind = 'entry' | 'skylight' | 'void' | 'deadEnd' | 'alcove' | 'junction' | 'ledge' | 'bank';

/** A place the game puts content in: its cell, where that is, how far along the way from the way in, and (voids) how big. */
export interface Place {
  readonly kind: PlaceKind;
  readonly cell: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly depth: number;
  readonly radius: number;
}

/** The network of standable ground and what it shows. */
export interface Reading {
  readonly count: number;
  /** Per cell: where its floor is, and the height of the air over it. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly room: Float32Array;
  /** Per cell: metres of way from the nearest way in (Infinity: not reached), whether it can walk back to a way in, and its part (cells joined by links, any kind, either way). */
  readonly depth: Float32Array;
  readonly back: Uint8Array;
  /** Per cell: the cell it was reached from on the way in (-1 at a way in or where not reached). */
  readonly from: Int32Array;
  readonly part: Int32Array;
  /** Links as arrays: the edges of cell c are edgeStart[c] .. edgeStart[c + 1]. */
  readonly edgeStart: Int32Array;
  readonly edgeTo: Int32Array;
  readonly edgeKind: Uint8Array;
  readonly entries: readonly number[];
  readonly places: readonly Place[];
  readonly stats: ReadingStats;
}

export interface ReadingStats {
  readonly cells: number;
  readonly links: { readonly walk: number; readonly climb: number; readonly drop: number };
  readonly parts: number;
  readonly reached: number;
  /** Cells that can be reached but not left (drops into a pit). */
  readonly trapped: number;
  /** Cells in parts of at least `PART_MIN` cells that no way in reaches. */
  readonly cutOff: number;
  readonly ms: number;
}

/** Parts of fewer cells than this are pockets, not parts (about 22 m2 of floor). */
export const PART_MIN = 60;

const DIRS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [1, 1], [1, -1]];

/** Read a carved (and dressed) cave: its standable ground, links, network and places. `dressing` adds the stream's bank. */
export function readField(f: BrickField, sk: Skeleton, caves: CavesDef, dressing?: Dressing, ticker: () => number = Date.now): Reading {
  const t0 = ticker(), way = caves.way, stand = way.stand + 0.05, { nx, nz, step } = f;

  // Which columns of the field hold any brick (the rest is solid).
  const inBricks = brickColumns(f);

  // The body's width where the walker tests it: the knee, the waist and the head (its radius clear of rock at each).
  const bodyFits = (x: number, fl: number, z: number): boolean => [0.75, 1.3, way.stand - way.radius].every((h) => fieldAt(f, x, fl + h, z) >= way.radius);

  // Cells: each column's spans with room to stand and body width at the waist.
  const first = new Int32Array(nx * nz + 1);
  const cx: number[] = [], cy: number[] = [], cz: number[] = [], cr: number[] = [], cc: number[] = [];
  const sp: number[] = [];
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    first[i + nx * k] = cx.length;
    if (!inBricks(i, k)) continue;
    columnSpans(f, i, k, sp);
    const x = f.ox + i * step, z = f.oz + k * step;
    for (let n = 0; n < sp.length; n += 2) {
      const fl = sp[n], ce = sp[n + 1];
      if (ce - fl < stand || !bodyFits(x, fl, z)) continue;
      cx.push(x); cy.push(fl); cz.push(z); cr.push(ce - fl); cc.push(ce);
    }
  }
  first[nx * nz] = cx.length;
  const count = cx.length;

  // Links: each cell with its neighbours to the east and south (and the diagonals), both ways at once.
  const eFrom: number[] = [], eTo: number[] = [], eKind: number[] = [];
  const link = (a: number, b: number, kind: number, two: boolean): void => { eFrom.push(a); eTo.push(b); eKind.push(kind); if (two) { eFrom.push(b); eTo.push(a); eKind.push(kind); } };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const c0 = first[i + nx * k], c1 = first[i + nx * k + 1];
    if (c0 === c1) continue;
    for (const [di, dk] of DIRS) {
      const i2 = i + di, k2 = k + dk;
      if (i2 < 0 || i2 >= nx || k2 < 0 || k2 >= nz) continue;
      const d0 = first[i2 + nx * k2], d1 = first[i2 + nx * k2 + 1];
      for (let a = c0; a < c1; a++) for (let b = d0; b < d1; b++) {
        const dy = cy[b] - cy[a], hi = Math.max(cy[a], cy[b]);
        // No squeezing: the standing hero's head room over both cells' floors.
        if (Math.min(cc[a], cc[b]) - hi < stand) continue;
        if (Math.abs(dy) <= way.step) { link(a, b, 0, true); continue; }
        // A face: the lower cell's air must reach over the upper floor, so the hero can stand up it onto the ledge (or step off it).
        const lo = dy > 0 ? a : b, up = dy > 0 ? b : a, rise = Math.abs(dy);
        if (cc[lo] < cy[up] + 1) continue;
        if (rise <= way.climb) link(a, b, 1, true);
        else if (rise <= way.drop) link(up, lo, 2, false);
      }
    }
  }

  // The graph as arrays (edges grouped by their cell).
  const edgeStart = new Int32Array(count + 1), edgeTo = new Int32Array(eFrom.length), edgeKind = new Uint8Array(eFrom.length);
  for (const a of eFrom) edgeStart[a + 1]++;
  for (let c = 0; c < count; c++) edgeStart[c + 1] += edgeStart[c];
  const fill = edgeStart.slice(0, count);
  const counts = { walk: 0, climb: 0, drop: 0 };
  for (let e = 0; e < eFrom.length; e++) { const at = fill[eFrom[e]]++; edgeTo[at] = eTo[e]; edgeKind[at] = eKind[e]; counts[KIND[eKind[e]]]++; }

  const x = Float32Array.from(cx), y = Float32Array.from(cy), z = Float32Array.from(cz), room = Float32Array.from(cr);
  const linkCost = (a: number, b: number, kind: number): number => {
    const h = Math.hypot(x[a] - x[b], z[a] - z[b]), dy = Math.abs(y[a] - y[b]);
    return kind === 1 ? h + dy * 2.5 : kind === 2 ? h + dy * 0.5 : Math.hypot(h, dy);
  };

  // Parts: cells joined by links (union-find).
  const parent = new Int32Array(count).map((_, i) => i);
  const root = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let a = 0; a < count; a++) for (let e = edgeStart[a]; e < edgeStart[a + 1]; e++) { const r1 = root(a), r2 = root(edgeTo[e]); if (r1 !== r2) parent[r1] = r2; }
  const partOf = new Int32Array(count), partId = new Map<number, number>();
  for (let a = 0; a < count; a++) { const r = root(a); let id = partId.get(r); if (id === undefined) partId.set(r, id = partId.size); partOf[a] = id; }

  // The ways in: where a spring's mouth reaches the valley side, and under each skylight (the hero drops in onto the heap).
  const R = Math.ceil(6 / step);
  const cellNear = (px: number, py: number, pz: number): number => {
    const ci = Math.round((px - f.ox) / step), ck = Math.round((pz - f.oz) / step);
    let best = -1, bd = 36;
    for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) {
      const i = ci + di, kk = ck + dk;
      if (i < 0 || i >= nx || kk < 0 || kk >= nz) continue;
      for (let c = first[i + nx * kk]; c < first[i + nx * kk + 1]; c++) {
        const d = (x[c] - px) ** 2 + (z[c] - pz) ** 2 + (y[c] - py) ** 2;
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  };
  const entries: number[] = [], places: Place[] = [];
  const addEntry = (kind: PlaceKind, c: number): void => { if (c >= 0 && !entries.includes(c)) { entries.push(c); places.push({ kind, cell: c, x: x[c], y: y[c], z: z[c], depth: 0, radius: 0 }); } };
  for (const c of sk.conduits) if (c.kind === 'mouth') { const p = c.points[c.points.length - 1]; addEntry('entry', cellNear(p.x, p.y - p.B - p.D, p.z)); }
  for (const v of sk.voids) if (v.skylight) addEntry('skylight', cellNear(v.x, v.floor + v.heapH, v.z));

  // Dijkstra from the ways in; then the same over the reversed links for what can walk back out.
  const dist = new Float64Array(count).fill(Infinity);
  const heap = new MinHeap();
  for (const e of entries) { dist[e] = 0; heap.push(0, e); }
  const tree = new Int32Array(count).fill(-1);
  while (heap.size) {
    const a = heap.pop(), d = heap.lastPriority;
    if (d > dist[a]) continue;
    for (let e = edgeStart[a]; e < edgeStart[a + 1]; e++) {
      const b = edgeTo[e], nd = d + linkCost(a, b, edgeKind[e]);
      if (nd < dist[b]) { dist[b] = nd; tree[b] = a; heap.push(nd, b); }
    }
  }
  const depth = Float32Array.from(dist);
  const back = new Uint8Array(count);
  {
    // Reversed edges as arrays.
    const rStart = new Int32Array(count + 1), rFrom = new Int32Array(edgeTo.length);
    for (let e = 0; e < edgeTo.length; e++) rStart[edgeTo[e] + 1]++;
    for (let c = 0; c < count; c++) rStart[c + 1] += rStart[c];
    const rf = rStart.slice(0, count);
    for (let a = 0; a < count; a++) for (let e = edgeStart[a]; e < edgeStart[a + 1]; e++) rFrom[rf[edgeTo[e]]++] = a;
    const stack: number[] = [];
    for (const e of entries) { back[e] = 1; stack.push(e); }
    while (stack.length) { const b = stack.pop()!; for (let e = rStart[b]; e < rStart[b + 1]; e++) { const a = rFrom[e]; if (!back[a]) { back[a] = 1; stack.push(a); } } }
  }

  // Sizes of the parts: reached, trapped, cut off.
  const size = new Int32Array(partId.size);
  for (let a = 0; a < count; a++) size[partOf[a]]++;
  const reachedPart = new Uint8Array(partId.size);
  let reached = 0, trapped = 0;
  for (let a = 0; a < count; a++) if (depth[a] < Infinity) { reached++; reachedPart[partOf[a]] = 1; if (!back[a]) trapped++; }
  let cutOff = 0;
  for (let a = 0; a < count; a++) if (!reachedPart[partOf[a]] && size[partOf[a]] >= PART_MIN) cutOff++;

  // Places. Voids: where a ball of 3.5 m fits at head height, one place for each lump of such cells.
  const open = new Uint8Array(count);
  for (let a = 0; a < count; a++) if (depth[a] < Infinity && fieldAt(f, x[a], y[a] + Math.min(room[a] * 0.5, 1.8), z[a]) >= 3.5) open[a] = 1;
  const seen = new Uint8Array(count);
  for (let a0 = 0; a0 < count; a0++) {
    if (!open[a0] || seen[a0]) continue;
    const lump = [a0]; seen[a0] = 1;
    for (let n = 0; n < lump.length; n++) { const a = lump[n]; for (let e = edgeStart[a]; e < edgeStart[a + 1]; e++) { const b = edgeTo[e]; if (open[b] && !seen[b] && edgeKind[e] === 0) { seen[b] = 1; lump.push(b); } } }
    if (lump.length < 12) continue;
    let mx = 0, my = 0, mz = 0;
    for (const a of lump) { mx += x[a]; my += y[a]; mz += z[a]; }
    mx /= lump.length; my /= lump.length; mz /= lump.length;
    let mid = lump[0], bd = Infinity;
    for (const a of lump) { const d = (x[a] - mx) ** 2 + (z[a] - mz) ** 2; if (d < bd) { bd = d; mid = a; } }
    places.push({ kind: 'void', cell: mid, x: x[mid], y: y[mid], z: z[mid], depth: depth[mid], radius: Math.sqrt(lump.length * step * step / Math.PI) });
  }
  // Dead ends and alcoves: far ends of the way (a local peak of depth), each its own 12 m; a short side branch is an alcove.
  const children = new Int32Array(count);
  for (let a = 0; a < count; a++) if (tree[a] >= 0) children[tree[a]]++;
  const order: number[] = [];
  for (let a = 0; a < count; a++) if (depth[a] < Infinity && children[a] === 0 && depth[a] > 8) order.push(a);
  order.sort((p, q) => depth[q] - depth[p]);
  const ends: number[] = [];
  for (const a of order) {
    if (ends.length >= 40) break;
    if (ends.some((b) => (x[a] - x[b]) ** 2 + (z[a] - z[b]) ** 2 + (y[a] - y[b]) ** 2 < 144)) continue;
    ends.push(a);
    // Back along the branch to where it leaves another: its length tells an alcove from a dead end.
    let c = a;
    while (tree[c] >= 0 && children[tree[c]] === 1) c = tree[c];
    const branch = depth[a] - (tree[c] >= 0 ? depth[tree[c]] : 0);
    places.push({ kind: branch < 10 ? 'alcove' : 'deadEnd', cell: a, x: x[a], y: y[a], z: z[a], depth: depth[a], radius: branch });
  }
  // Junctions: where three or more conduits meet.
  const quant = new Map<string, { n: number; x: number; y: number; z: number }>();
  for (const c of sk.conduits) if (c.kind === 'passage') for (const p of [c.points[0], c.points[c.points.length - 1]]) {
    const key = `${Math.round(p.x / 2)},${Math.round(p.y / 2)},${Math.round(p.z / 2)}`, q = quant.get(key);
    if (q) q.n++; else quant.set(key, { n: 1, x: p.x, y: p.y - p.B, z: p.z });
  }
  for (const q of quant.values()) {
    if (q.n < 3) continue;
    const c = cellNear(q.x, q.y, q.z);
    if (c >= 0 && depth[c] < Infinity) places.push({ kind: 'junction', cell: c, x: x[c], y: y[c], z: z[c], depth: depth[c], radius: 0 });
  }
  // Ledges: cells beside a face of 3 m or more (a link down by climb or drop), one for each 8 m.
  const ledges: number[] = [];
  for (let a = 0; a < count; a++) {
    if (depth[a] === Infinity) continue;
    let face = 0;
    for (let e = edgeStart[a]; e < edgeStart[a + 1]; e++) { const b = edgeTo[e]; if (edgeKind[e] !== 0 && y[a] - y[b] > face) face = y[a] - y[b]; }
    if (face >= 3 && !ledges.some((b) => (x[a] - x[b]) ** 2 + (z[a] - z[b]) ** 2 + (y[a] - y[b]) ** 2 < 64)) ledges.push(a);
  }
  for (const a of ledges.slice(0, 40)) places.push({ kind: 'ledge', cell: a, x: x[a], y: y[a], z: z[a], depth: depth[a], radius: 0 });
  // The stream's bank: a cell near a stream point, one for each 20 m of it.
  if (dressing) for (const s of dressing.streams) {
    for (let i = 0; i < s.pts.length; i += 18) {
      const p = s.pts[i], c = cellNear(p[0] + p[3] + 0.6, p[1], p[2]);
      if (c >= 0 && depth[c] < Infinity) places.push({ kind: 'bank', cell: c, x: x[c], y: y[c], z: z[c], depth: depth[c], radius: 0 });
    }
  }

  return {
    count, x, y, z, room, depth, back, from: tree, part: partOf, edgeStart, edgeTo, edgeKind, entries, places,
    stats: { cells: count, links: { walk: counts.walk, climb: counts.climb, drop: counts.drop }, parts: partId.size, reached, trapped, cutOff, ms: ticker() - t0 },
  };
}

/** The cells from a way in to `cell`, along the network (empty where `cell` is not reached). */
export function pathTo(r: Reading, cell: number): number[] {
  if (r.depth[cell] === Infinity) return [];
  const out: number[] = [];
  for (let c = cell; c >= 0; c = r.from[c]) out.push(c);
  return out.reverse();
}
