/**
 * Lakes as the land holds them (phase W, W3). The rivers' coarse drainage (2 km cells) only says where a basin may
 * hold a lake; at that grain a rim's lowest gap is missed and the filled cells are squares, so a lake decided there
 * stood above the land round it. Here the lake is found on the land itself, on a fine grid: water poured in at the
 * basin's lowest point rises until it first runs out over the rim (an inside-out flood). That height is the lake's
 * level, that gap its outlet, and the cells below the level that the water reached are the lake.
 */
import { MinHeap, smoothstep } from '@futuremagic/core';

/** The grid a lake is found on, metres. */
export const LAKE_GRID = 100;
/** How far (metres) from the water its shore reaches: the land's small shapes give way to it there. */
export const LAKE_SHORE = 300;
/** A lake must be at least this deep (m) and this big (cells) to count; shallower or smaller hollows stay dry. */
const MIN_DEPTH = 4;
const MIN_CELLS = 10;
/** How high (m) a lake's lip stands above its water where the rim is raised. */
const LIP = 0.3;
/** How steeply (m a metre) a lake's raised rim falls away from it to the land beyond. */
const RIM_FALL = 0.15;
/** Cells a flood may look at before it gives up (a basin that never spills on the grid: no lake). */
const MAX_CELLS = 20_000;

/** A grid cell as one number (cells up to ±2 million either way, ±100 000 km). */
const OFF = 2 ** 21, ROW = 2 ** 22;
const gridKey = (i: number, j: number): number => (i + OFF) * ROW + (j + OFF);
const keyI = (k: number): number => Math.floor(k / ROW) - OFF;
const keyJ = (k: number): number => (k % ROW) - OFF;

export class Lake {
  /**
   * `level`: the water's surface. `i0`, `j0`, `w`, `h`: the box of grid cells the lake and its shore lie in. `shoreDist`:
   * metres from each cell's centre to the water's nearest cell (0 on the water, LAKE_SHORE and more far off). `crest`
   * and `spill`: the outlet's highest cell and the first cell beyond it, lower than the lake (world x, z).
   */
  constructor(
    readonly level: number,
    readonly depth: number,
    /** Grid cells of water. */
    readonly cells: number,
    private readonly i0: number,
    private readonly j0: number,
    private readonly w: number,
    private readonly h: number,
    private readonly shoreDist: Float32Array,
    readonly crest: readonly [number, number],
    readonly spill: readonly [number, number],
  ) {}

  /** Whether (x, z) may lie in this lake's box at all. */
  covers(x: number, z: number): boolean {
    const i = x / LAKE_GRID - 0.5 - this.i0, j = z / LAKE_GRID - 0.5 - this.j0;
    return i >= 0 && j >= 0 && i <= this.w - 1 && j <= this.h - 1;
  }

  /** Metres from (x, z) to the water (blended between cell centres; about 0 on it), Infinity outside the box. */
  shore(x: number, z: number): number {
    const fi = x / LAKE_GRID - 0.5 - this.i0, fj = z / LAKE_GRID - 0.5 - this.j0;
    if (!(fi >= 0 && fj >= 0 && fi <= this.w - 1 && fj <= this.h - 1)) return Infinity;
    const i = Math.min(this.w - 2, Math.floor(fi)), j = Math.min(this.h - 2, Math.floor(fj)), u = fi - i, v = fj - j, d = this.shoreDist, k = j * this.w + i;
    return (d[k] * (1 - u) + d[k + 1] * u) * (1 - v) + (d[k + this.w] * (1 - u) + d[k + this.w + 1] * u) * v;
  }

  /** How far the land's small shapes give way to the lake at (x, z): 1 at its shore, 0 away from it. */
  calm(x: number, z: number): number {
    return 1 - smoothstep(LAKE_GRID, LAKE_SHORE, this.shore(x, z));
  }

  /**
   * Ground `h` at (x, z) as the lake's rim holds it: just past the water's cells, where the grid saw land above the
   * level but the ground between its points dips below it, the rim is raised to a lip a little above the water (no
   * lake hangs over lower dry land there), its bank falling away outward. Away from the shore the land is its own.
   */
  rim(x: number, z: number, h: number): number {
    const lip = this.level + LIP;
    if (h >= lip) return h;
    // A bank that slopes away from the lip (RIM_FALL a metre), not a flat terrace at the water's height out to the
    // shore's edge: from the lake that read as a wide white strand along a straight line.
    const d = this.shore(x, z), t = smoothstep(LAKE_GRID * 0.6, LAKE_GRID * 0.9, d);
    const bank = lip - Math.max(0, d - LAKE_GRID * 1.3) * RIM_FALL;
    return t > 0 && bank > h ? h + (bank - h) * t : h;
  }

  /** Whether (x, z) lies in the lake (where the ground is below its level, the water shows). */
  holds(x: number, z: number): boolean {
    return this.shore(x, z) < LAKE_GRID;
  }

  /** The centre of the lake's cell nearest to (x, z). */
  nearestWater(x: number, z: number): [number, number] {
    let best = Infinity, bx = x, bz = z;
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      if (this.shoreDist[j * this.w + i] > 0) continue;
      const cx = (this.i0 + i + 0.5) * LAKE_GRID, cz = (this.j0 + j + 0.5) * LAKE_GRID, d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < best) { best = d; bx = cx; bz = cz; }
    }
    return [bx, bz];
  }

  /** The world box (x0, z0, x1, z1) of the lake and its shore. */
  get box(): [number, number, number, number] {
    return [this.i0 * LAKE_GRID, this.j0 * LAKE_GRID, (this.i0 + this.w) * LAKE_GRID, (this.j0 + this.h) * LAKE_GRID];
  }
}

/**
 * The lake water poured in at (x, z) makes on the land `ground`: the water rises from there, filling the lowest cell
 * next to it each time, until the next lowest is lower than the water (it runs out there). Null where it runs out
 * before it is MIN_DEPTH deep or MIN_CELLS big, or never runs out within MAX_CELLS.
 */
export function floodLake(ground: (x: number, z: number) => number, x: number, z: number): Lake | null {
  const G = LAKE_GRID, hs = new Map<number, number>(), heap = new MinHeap();
  const look = (i: number, j: number) => {
    const k = gridKey(i, j);
    if (hs.has(k)) return;
    const e = ground((i + 0.5) * G, (j + 0.5) * G);
    hs.set(k, e);
    heap.push(e, k);
  };
  // Down to the bottom of the hollow it was poured into, first.
  let si = Math.floor(x / G), sj = Math.floor(z / G), se = ground((si + 0.5) * G, (sj + 0.5) * G);
  for (let moved = true; moved;) {
    moved = false;
    let bi = si, bj = sj;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const e = ground((si + di + 0.5) * G, (sj + dj + 0.5) * G);
      if (e < se) { se = e; bi = si + di; bj = sj + dj; moved = true; }
    }
    si = bi; sj = bj;
  }
  look(si, sj);
  const floor = se;
  const filled: number[] = [];
  let level = -Infinity, crest = -1, spill = -1;
  while (heap.size) {
    const k = heap.pop(), e = hs.get(k)!;
    if (e < level) { spill = k; break; }
    if (e > level) { level = e; crest = k; }
    filled.push(k);
    if (filled.length > MAX_CELLS) return null;
    const i = keyI(k), j = keyJ(k);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (di || dj) look(i + di, j + dj);
  }
  if (spill < 0) return null;
  const water = filled.filter((k) => hs.get(k)! < level);
  if (level - floor < MIN_DEPTH || water.length < MIN_CELLS) return null;
  // The box: the water and its shore round it.
  const ring = Math.ceil(LAKE_SHORE / G) + 1;
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const k of water) { const i = keyI(k), j = keyJ(k); a = Math.min(a, i); b = Math.max(b, i); c = Math.min(c, j); d = Math.max(d, j); }
  const i0 = a - ring, j0 = c - ring, w = b - a + 1 + 2 * ring, h = d - c + 1 + 2 * ring;
  const dist = new Float32Array(w * h).fill(LAKE_SHORE * 4);
  for (const k of water) dist[(keyJ(k) - j0) * w + keyI(k) - i0] = 0;
  // Distances from the water.
  chamfer(dist, w, h, G, G * Math.SQRT2);
  const centre = (k: number): [number, number] => [(keyI(k) + 0.5) * G, (keyJ(k) + 0.5) * G];
  return new Lake(level, level - floor, water.length, i0, j0, w, h, dist, centre(crest), centre(spill));
}

/**
 * A chamfer distance pass over a w×h grid, in place: each cell becomes the least of itself and its neighbours plus
 * `along` (sideways) or `diag` (corner to corner), one sweep each way; with `scale`, those steps into a cell cost that
 * many times more.
 */
export function chamfer(g: Float32Array, w: number, h: number, along: number, diag: number, scale?: Float32Array): void {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const p = j * w + i, a = scale ? along * scale[p] : along, d = scale ? diag * scale[p] : diag;
    let v = g[p];
    if (i > 0) v = Math.min(v, g[p - 1] + a);
    if (j > 0) { v = Math.min(v, g[p - w] + a); if (i > 0) v = Math.min(v, g[p - w - 1] + d); if (i < w - 1) v = Math.min(v, g[p - w + 1] + d); }
    g[p] = v;
  }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) {
    const p = j * w + i, a = scale ? along * scale[p] : along, d = scale ? diag * scale[p] : diag;
    let v = g[p];
    if (i < w - 1) v = Math.min(v, g[p + 1] + a);
    if (j < h - 1) { v = Math.min(v, g[p + w] + a); if (i < w - 1) v = Math.min(v, g[p + w + 1] + d); if (i > 0) v = Math.min(v, g[p + w - 1] + d); }
    g[p] = v;
  }
}
