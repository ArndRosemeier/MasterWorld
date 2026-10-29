/**
 * Rivers and lakes (plan 5.2 and D25): real drainage over the skeleton, so rivers run downhill to the sea
 * and lakes fill basins. Pure and deterministic; computed per hydro tile, lazily, in every thread that
 * needs heights (workers and the main thread compute the same tiles from the seed).
 *
 * A tile covers CORE × CORE coarse cells plus a MARGIN all round, sampled from the skeleton's elevation.
 * Priority-flood (Barnes et al. 2014, with epsilon) fills the basins and gives every land cell a downstream
 * neighbour; flow accumulation over that tree gives catchment areas; cells with enough catchment are rivers,
 * filled basins are lakes. Rivers become smooth polylines whose meanders depend on world position only, so
 * neighbouring tiles agree where they overlap.
 */
import { MinHeap, Noise, clamp, deriveSeed, hash2f, lerp, smoothstep } from '@futuremagic/core';
import type { Skeleton } from './skeleton';
import { floodLake, type Lake } from './lakes';

export interface HydroOptions {
  /** Coarse cell side, metres. */
  cell: number;
  /** Cells per tile side that the tile owns. */
  core: number;
  /** Extra cells around the core that feed its drainage. */
  margin: number;
  /** Catchment (km²) from which a river is drawn. */
  minArea: number;
  /** Brooks (D50): a finer network that runs into the rivers, lakes and sea; shallow, narrow, fordable. */
  brook?: boolean;
}

export const HYDRO: HydroOptions = { cell: 2000, core: 512, margin: 128, minArea: 120 };
/**
 * The brooks' grid (D50): fine enough that most land has running water within a few hundred metres, so every
 * settlement can stand by fresh water. A tile is 32 km with 8 km round it: a brook's catchment is small, so
 * neighbouring tiles trace the same brooks.
 */
export const BROOKS: HydroOptions = { cell: 250, core: 128, margin: 32, minArea: 1, brook: true };

/** Fill above the ground (metres) from which a cell is part of a lake. */
const LAKE_MIN = 2;
/**
 * A filled basin is a lake only if it is this deep somewhere; shallower ones are breached (the river cuts
 * through their rim, as erosion would have done).
 */
const LAKE_DEEPEST = 30;
/** Basins bigger than this (cells) are carved through rather than flooded: no inland seas from untouched terrain. */
const LAKE_MAX_CELLS = 100;
/** Single-cell pits are noise; of the rest, this share are lakes (the skeleton is far more pitted than eroded land). */
const LAKE_MIN_CELLS = 2;
const LAKE_SHARE = 0.35;
/** A basin's lowest cells the lake is poured into (W3), and the spacing (m) its lowest point is looked for at in each. */
const LAKE_STARTS = 2;
const LAKE_LOOK = 250;
/** Cells past a tile's core whose lakes it still finds. */
const LAKE_FAR = 16;
/**
 * A hollow that holds no lake is resolved the way erosion would (phase W, W2): partly filled with sediment to a flat
 * floor, partly breached by its outflow, at the level where the two together move the least earth. Below this depth
 * (m) a hollow is left to its outflow alone.
 */
const HOLLOW_MIN = 0.5;
/** Cross-section of a breach per metre of cut squared: its sides slope about one in three. */
const BREACH_SIDES = 3;
/**
 * How much dearer filling is than breaching, per cubic metre: running water cuts its way out far sooner than a
 * hollow silts up, and a filled hollow takes the height from the walls round it (a mesa's valley would lose its
 * cliffs).
 */
const FILL_COST = 4;
/** Levels tried between a hollow's floor and its spill, for the cheapest mix of fill and breach. */
const HOLLOW_TRIES = 12;
/** Spacing of river polyline points after resampling, metres. */
const STEP = 80;
/** Brooks: resample spacing, meander scale (metres), and the half widths they keep to. */
const BROOK_STEP = 20;
const BROOK_MEANDER = 450;
/**
 * Brooks: how far (metres) a course may leave its cells' centres to run straight. The cells only step in eight
 * directions, so a brook traced through them runs in right angles and 45° zigzags; straightened first, it runs
 * any way, and is then rounded.
 */
const BROOK_STRAIGHTEN = 70;
/** Brooks: the spacing (metres) a course is rounded and meandered at, before it keeps every BROOK_STEP. */
const BROOK_FINE = 10;
/** Brooks: passes of a 1-2-1 blur over the meandered course (at BROOK_FINE): no kinks left where it bends. */
const BROOK_BLUR = 10;
const BROOK_HALF: readonly [number, number] = [1, 3.5];
/**
 * Waterfalls: where a river drops at least FALL_MIN metres within FALL_RUN metres, the drop may gather into
 * one fall (a seeded FALL_SHARE of such places, at least FALL_SPACING metres apart), and the reach below it
 * lies flat at the lower level (the gorge a retreating fall leaves). Elsewhere rivers keep their even slope.
 */
const FALL_MIN = 12;
const FALL_RUN = 800;
const FALL_SPACING = 1500;
const FALL_SHARE = 0.5;
/** Horizontal width of the lip, metres: the drop happens within it. */
export const FALL_LIP = 1.6;

export interface River {
  /** World xz of the points, interleaved. */
  xz: Float64Array;
  /** Water surface level at each point (never rises downstream). */
  level: Float32Array;
  /** Half width at each point, metres. */
  half: Float32Array;
  /** Height of the waterfall in each segment (at its middle), 0 where there is none. */
  fall: Float32Array;
  /**
   * Brooks: how far either side each point shapes the land (wider where it runs deep below the land round it,
   * so its sides stay walkable slopes, not walls). Rivers: none (`valleyOf`).
   */
  reach?: Float32Array;
}

/** A course's points: x, z, water level and half width. */
type Course = [number[], number[], number[], number[]];

/** Chaikin corner cutting of a course (its ends kept), `times` over. */
function chaikin(c: Course, times: number): Course {
  for (let it = 0; it < times; it++) {
    const n = c[0].length, out: Course = [[], [], [], []];
    for (let q = 0; q < 4; q++) {
      const a = c[q], o = out[q];
      o.push(a[0]);
      for (let k = 0; k < n - 1; k++) o.push(a[k] * 0.75 + a[k + 1] * 0.25, a[k] * 0.25 + a[k + 1] * 0.75);
      o.push(a[n - 1]);
    }
    c = out;
  }
  return c;
}

/** A course resampled every `step` metres along it (its ends kept). */
function resampleCourse(c: Course, step: number): Course {
  const [X, Z] = c, out: Course = [[], [], [], []];
  const along = [0];
  for (let k = 1; k < X.length; k++) along.push(along[k - 1] + Math.hypot(X[k] - X[k - 1], Z[k] - Z[k - 1]));
  const total = along[along.length - 1], count = Math.max(1, Math.round(total / step));
  for (let i = 0, k = 0; i <= count; i++) {
    const d = (i / count) * total;
    while (k < X.length - 2 && along[k + 1] < d) k++;
    const t = along[k + 1] > along[k] ? clamp((d - along[k]) / (along[k + 1] - along[k]), 0, 1) : 0;
    for (let q = 0; q < 4; q++) out[q].push(lerp(c[q][k], c[q][k + 1], t));
  }
  return out;
}

/** Which points of a path to keep so it runs straight wherever it strays no more than `tol` metres (Douglas-Peucker). */
function straighten(x: readonly number[], z: readonly number[], tol: number): number[] {
  const keep = new Uint8Array(x.length);
  keep[0] = keep[x.length - 1] = 1;
  const spans: [number, number][] = [[0, x.length - 1]];
  while (spans.length) {
    const [a, b] = spans.pop()!;
    const dx = x[b] - x[a], dz = z[b] - z[a], len = Math.hypot(dx, dz) || 1;
    let worst = -1, far = tol;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((x[k] - x[a]) * dz - (z[k] - z[a]) * dx) / len;
      if (d > far) { far = d; worst = k; }
    }
    if (worst >= 0) { keep[worst] = 1; spans.push([a, worst], [worst, b]); }
  }
  const out: number[] = [];
  keep.forEach((v, k) => { if (v) out.push(k); });
  return out;
}

/** 1-2-1 blur of a line of values, `passes` times; its ends stay. */
function blur(a: number[], passes: number): void {
  for (let p = 0; p < passes; p++) {
    let prev = a[0];
    for (let k = 1; k < a.length - 1; k++) { const cur = a[k]; a[k] = (prev + 2 * cur + a[k + 1]) / 4; prev = cur; }
  }
}

/** Height (m) below which the land's relief may dip under a brook's drained ground (terrain.ts: up to ~2.5 m down, never below 0.5 m). */
const LOW_LAND = 2.7;
/** Metres either way along a river its slope is taken over (its levels come in steps, flat between). */
const SLOPE_REACH = 200;
const slopeCache = new WeakMap<River, Float32Array>();
/** A river's slope at each point (`WaterHere.slope`), computed once. */
function slopesOf(r: River): Float32Array {
  let out = slopeCache.get(r);
  if (out) return out;
  const n = r.level.length, run = new Float64Array(n), fell = new Float64Array(n);
  for (let k = 1; k < n; k++) {
    run[k] = run[k - 1] + Math.hypot(r.xz[k * 2] - r.xz[k * 2 - 2], r.xz[k * 2 + 1] - r.xz[k * 2 - 1]);
    fell[k] = fell[k - 1] + r.fall[k - 1];
  }
  out = new Float32Array(n);
  for (let k = 0, a = 0, b = 0; k < n; k++) {
    while (run[k] - run[a] > SLOPE_REACH) a++;
    while (b < n - 1 && run[b] - run[k] < SLOPE_REACH) b++;
    const d = run[b] - run[a];
    out[k] = d > 0 ? Math.max(0, r.level[a] - r.level[b] - (fell[b] - fell[a])) / d : 0;
  }
  slopeCache.set(r, out);
  return out;
}

/** What the water does at one point (filled by `HydroTile.query`). */
export interface WaterHere {
  /** Nearest river within its valley: distance to its centre line, its half width, level and depth there. */
  river: boolean;
  /** That water is a brook (D50), not a river. */
  brook: boolean;
  dist: number;
  half: number;
  level: number;
  depth: number;
  /** Unit flow direction of that river. */
  fx: number;
  fz: number;
  /** The nearest point of its centre line. */
  cx: number;
  cz: number;
  /** Valley radius the river shapes the land within. */
  valley: number;
  /** Lake level here (the cell is a lake), else NaN. */
  lake: number;
  /** Distance downstream from the nearest waterfall's lip (negative above it), Infinity when none is near; its height and the level at its foot. */
  fallAt: number;
  fallDrop: number;
  fallBase: number;
  /** How steeply the water runs here: its fall per metre over a stretch of ~400 m, waterfalls left out (for its speed). */
  slope: number;
}

export const emptyWater = (): WaterHere => ({ river: false, brook: false, dist: Infinity, half: 0, level: 0, depth: 0, fx: 0, fz: 0, cx: 0, cz: 0, valley: 0, lake: NaN, fallAt: Infinity, fallDrop: 0, fallBase: 0, slope: 0 });

/** Half width (m) of a river draining `areaKm2`. */
export const riverHalf = (areaKm2: number): number => 0.6 * Math.sqrt(areaKm2);
/** Depth (m) of a river of half width `half`. */
export const riverDepth = (half: number): number => 1.2 + half * 0.15;
/** How far either side the river shapes its valley. */
export const valleyOf = (half: number): number => half + Math.max(120, half * 4);
/** Whether (x, z) of a query lies in the river or brook it found, or within `past` metres of its edge. */
export const inChannel = (w: WaterHere, past = 0): boolean => w.river && w.dist < w.half + past;
/** A brook's depth (m): never deeper than a road can ford (0.7 m). */
export const brookDepth = (half: number): number => 0.3 + half * 0.1;
/** How far either side a brook shapes the land. */
export const brookValley = (half: number): number => half * 5 + 10;

/**
 * What a brook tile drains over (D50): the ground as the rivers have shaped it, and where a brook ends in a
 * river or lake (the point it runs to and the water's level there), else null.
 */
export interface BrookFeed {
  ground(x: number, z: number): number;
  join(x: number, z: number): { x: number; z: number; level: number } | null;
  /** Whether a river's channel may lie within `within` metres of (x, z) (a quick test before asking `join` often). */
  riverNear(x: number, z: number, within: number): boolean;
}

export class HydroTile {
  readonly n: number;
  /** World position of the tile's first cell corner (margin included). */
  readonly x0: number;
  readonly z0: number;
  readonly elev: Float32Array;
  readonly fill: Float32Array;
  /** Downstream cell, -1 into the sea or out of the tile. */
  readonly recv: Int32Array;
  /** Catchment in cells. */
  readonly acc: Float32Array;
  /** Lake level per cell the rivers' drainage filled (NaN: no lake). */
  readonly lake: Float32Array;
  /** The lakes as the land holds them (W3), and per cell the one whose water or shore may lie in it (-1: none). */
  readonly lakes: Lake[] = [];
  private lakeOf: Int32Array = new Int32Array(0);
  /** The level a hollow's sediment floor fills this cell to (NaN: none; W2). */
  readonly plain: Float32Array;
  readonly rivers: River[] = [];
  /** Segment index: bucket (BUCKET-m squares) → [river, point] pairs. */
  private readonly buckets = new Map<number, number[]>();
  private readonly bucket: number;

  /** `given`: the tile as another thread traced it (`packTile`); the drainage is not kept then. */
  constructor(readonly skeleton: Skeleton, readonly tx: number, readonly tz: number, readonly o: HydroOptions = HYDRO, private readonly feed: BrookFeed | null = null, given: PackedTile | null = null) {
    const { cell, core, margin } = o;
    const n = (this.n = core + 2 * margin);
    this.x0 = (tx * core - margin) * cell;
    this.z0 = (tz * core - margin) * cell;
    this.bucket = cell;
    const N = n * n;
    if (given) {
      this.elev = this.fill = this.acc = new Float32Array(0);
      this.recv = new Int32Array(0);
      this.lake = new Float32Array(N).fill(NaN);
      this.plain = given.plain;
      this.rivers.push(...given.rivers);
      this.rivers.forEach((r, ri) => this.index(r, ri));
      return;
    }
    const E = (this.elev = new Float32Array(N));
    const ground = feed ? (x: number, z: number) => feed.ground(x, z) : (x: number, z: number) => skeleton.elevation(x, z);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) E[j * n + i] = ground(this.x0 + (i + 0.5) * cell, this.z0 + (j + 0.5) * cell);
    const F = (this.fill = new Float32Array(N).fill(NaN));
    const recv = (this.recv = new Int32Array(N).fill(-1));
    const order = new Int32Array(N);
    let popped = 0;

    // Priority-flood from the sea and the tile's edge.
    const heap = new MinHeap();
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = j * n + i;
      if (E[c] <= 0 || i === 0 || j === 0 || i === n - 1 || j === n - 1) { F[c] = E[c]; heap.push(E[c], c); }
    }
    const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1];
    while (heap.size) {
      const c = heap.pop();
      order[popped++] = c;
      const ci = c % n, cj = (c - ci) / n, fc = F[c];
      for (let k = 0; k < 8; k++) {
        const i = ci + DI[k], j = cj + DJ[k];
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const nb = j * n + i;
        if (!Number.isNaN(F[nb])) continue;
        F[nb] = Math.max(E[nb], fc + (k < 4 ? 0.01 : 0.014));
        recv[nb] = c;
        heap.push(F[nb], nb);
      }
    }

    // Flow accumulation, downstream last.
    const acc = (this.acc = new Float32Array(N));
    for (let c = 0; c < N; c++) acc[c] = E[c] > 0 ? 1 : 0;
    for (let k = popped - 1; k >= 0; k--) {
      const c = order[k], r = recv[c];
      if (r >= 0 && E[c] > 0) acc[r] += acc[c];
    }

    // Lakes: land cells the flood filled; each lake lies flat at its spill level. (Brooks keep none of their
    // own: they run through their small hollows; the lakes are the rivers' tiles'.)
    const lake = (this.lake = new Float32Array(N).fill(NaN));
    if (!feed) {
      for (let c = 0; c < N; c++) if (E[c] > 0 && F[c] - E[c] > LAKE_MIN) lake[c] = F[c];
      this.flattenLakes(DI, DJ);
      this.findLakes(DI, DJ);
    }
    this.plain = new Float32Array(N).fill(NaN);
    this.resolveHollows(DI, DJ);

    this.traceRivers(DI, DJ);
  }

  /**
   * Every hollow that holds no lake (W2): the drainage filled it to its spill level, which no water could reach; erosion
   * would have filled it with sediment or cut its outflow down. Of the levels between its floor and its spill, the one
   * where filling below it and breaching the outflow above it together move the least earth: cells below it get a
   * flat floor at that level (`plain`, raised in the land too: `onFloors`), and the courses cut down to it (they never
   * rise downstream), so a brook no longer saws a deep gorge through a ridge to leave a shallow dip.
   */
  private resolveHollows(DI: number[], DJ: number[]): void {
    const { n, elev: E, fill: F, recv, lake, plain } = this, cell = this.o.cell, N = n * n;
    const seen = new Uint8Array(N), stack: number[] = [], members: number[] = [];
    const deep = (c: number) => E[c] > 0 && F[c] - E[c] > HOLLOW_MIN && Number.isNaN(lake[c]);
    for (let s = 0; s < N; s++) {
      if (seen[s] || !deep(s)) continue;
      stack.push(s); seen[s] = 1; members.length = 0;
      let floor = s, spill = -Infinity;
      while (stack.length) {
        const c = stack.pop()!;
        members.push(c);
        if (E[c] < E[floor]) floor = c;
        spill = Math.max(spill, F[c]);
        const ci = c % n, cj = (c - ci) / n;
        for (let k = 0; k < 8; k++) {
          const i = ci + DI[k], j = cj + DJ[k];
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const nb = j * n + i;
          if (!seen[nb] && deep(nb)) { seen[nb] = 1; stack.push(nb); }
        }
      }
      // The outflow: from the floor down the drainage until the land is lower than the floor again.
      const path: number[] = [];
      for (let c = recv[floor], guard = 0; c >= 0 && guard < 4 * n; c = recv[c], guard++) {
        if (E[c] <= E[floor]) break;
        path.push(c);
      }
      let best = spill, cost = Infinity;
      for (let t = 0; t <= HOLLOW_TRIES; t++) {
        const level = lerp(E[floor], spill, t / HOLLOW_TRIES);
        let fill = 0, cut = 0;
        for (const c of members) fill += Math.max(0, level - E[c]);
        for (const c of path) { const d = Math.max(0, E[c] - level); cut += d * d; }
        const total = FILL_COST * fill * cell * cell + BREACH_SIDES * cut * cell;
        if (total < cost) { cost = total; best = level; }
      }
      for (const c of members) if (E[c] < best) { plain[c] = best; E[c] = best; }
    }
  }

  /**
   * Ground `h` at (x, z) as the hollows' sediment floors raise it (W2): blended from the cells round it, so a floor
   * runs out smoothly where the land rises above it.
   */
  onFloors(x: number, z: number, h: number): number {
    const { n, plain } = this, c = this.o.cell;
    const u = (x - this.x0) / c - 0.5, v = (z - this.z0) / c - 0.5;
    const i = Math.floor(u), j = Math.floor(v);
    if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return h;
    const fu = u - i, fv = v - j, k = j * n + i;
    let w = 0, sum = 0;
    const take = (cell: number, wt: number) => { const p = plain[cell]; if (!Number.isNaN(p)) { w += wt; sum += p * wt; } };
    take(k, (1 - fu) * (1 - fv)); take(k + 1, fu * (1 - fv)); take(k + n, (1 - fu) * fv); take(k + n + 1, fu * fv);
    if (w <= 0) return h;
    return h + w * Math.max(0, sum / w - h);
  }

  /**
   * Each basin the drainage filled (W3) only says where a lake may lie: on 2 km cells its rim's gaps are missed and its
   * water is squares. The lake itself is found on the land: water poured in at the basin's lowest points rises until it
   * runs out over the rim (`floodLake`); the biggest of those is the lake, at that level. A basin whose water runs out
   * before it is a lake holds none (its hollow is then resolved like any other).
   */
  private findLakes(DI: number[], DJ: number[]): void {
    const { n, lake, elev } = this, cell = this.o.cell, sk = this.skeleton;
    const lakeOf = (this.lakeOf = new Int32Array(n * n).fill(-1));
    const seen = new Uint8Array(n * n), bigLand = (x: number, z: number) => sk.elevation(x, z);
    for (let s = 0; s < n * n; s++) {
      if (seen[s] || Number.isNaN(lake[s])) continue;
      const members = [s];
      seen[s] = 1;
      for (let q = 0; q < members.length; q++) {
        const c = members[q], ci = c % n, cj = (c - ci) / n;
        for (let k = 0; k < 8; k++) {
          const i = ci + DI[k], j = cj + DJ[k], nb = j * n + i;
          if (i >= 0 && j >= 0 && i < n && j < n && !seen[nb] && !Number.isNaN(lake[nb])) { seen[nb] = 1; members.push(nb); }
        }
      }
      // Lakes far out in the margin are their own tiles' (a river from one into the core starts tens of km off).
      const { core, margin } = this.o, inCore = (c: number) => { const i = c % n, j = (c - i) / n; return i >= margin - LAKE_FAR && j >= margin - LAKE_FAR && i < margin + core + LAKE_FAR && j < margin + core + LAKE_FAR; };
      if (!members.some(inCore)) { for (const c of members) lake[c] = NaN; continue; }
      // Poured in at the lowest point of each of its lowest cells.
      let best: Lake | null = null;
      for (const c of [...members].sort((a, b) => elev[a] - elev[b] || a - b).slice(0, LAKE_STARTS)) {
        const ci = c % n, x0 = this.x0 + (c % n) * cell, z0 = this.z0 + ((c - ci) / n) * cell;
        let lx = x0, lz = z0, low = Infinity;
        for (let z = z0 + LAKE_LOOK / 2; z < z0 + cell; z += LAKE_LOOK) for (let x = x0 + LAKE_LOOK / 2; x < x0 + cell; x += LAKE_LOOK) {
          const e = bigLand(x, z);
          if (e < low) { low = e; lx = x; lz = z; }
        }
        if (best?.holds(lx, lz)) continue;
        const l = floodLake(bigLand, lx, lz);
        if (l && (!best || l.cells > best.cells)) best = l;
      }
      for (const c of members) lake[c] = best ? best.level : NaN;
      if (!best) continue;
      const id = this.lakes.push(best) - 1;
      for (const c of members) lakeOf[c] = id;
      const [ax, az, bx, bz] = best.box;
      for (let j = Math.max(0, Math.floor((az - this.z0) / cell)); j < n && this.z0 + j * cell < bz; j++) {
        for (let i = Math.max(0, Math.floor((ax - this.x0) / cell)); i < n && this.x0 + i * cell < bx; i++) if (lakeOf[j * n + i] < 0) lakeOf[j * n + i] = id;
      }
    }
  }

  private flattenLakes(DI: number[], DJ: number[]): void {
    const { n, lake } = this;
    const seen = new Uint8Array(n * n);
    const stack: number[] = [], members: number[] = [];
    for (let s = 0; s < n * n; s++) {
      if (seen[s] || Number.isNaN(lake[s])) continue;
      stack.push(s); seen[s] = 1; members.length = 0;
      let top = -Infinity;
      while (stack.length) {
        const c = stack.pop()!;
        members.push(c);
        top = Math.max(top, lake[c]);
        const ci = c % n, cj = (c - ci) / n;
        for (let k = 0; k < 8; k++) {
          const i = ci + DI[k], j = cj + DJ[k];
          if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const nb = j * n + i;
          if (!seen[nb] && !Number.isNaN(lake[nb])) { seen[nb] = 1; stack.push(nb); }
        }
      }
      let deepest = 0;
      for (const c of members) deepest = Math.max(deepest, top - this.elev[c]);
      let lowest = members[0];
      for (const c of members) if (this.elev[c] < this.elev[lowest]) lowest = c;
      // Which basins hold lakes is a property of the basin (its lowest cell's world position), so tiles agree.
      const li = lowest % n, lj = (lowest - li) / n;
      const roll = hash2f(deriveSeed(this.skeleton.seed, 'lakes'), Math.round(this.x0 / this.o.cell) + li, Math.round(this.z0 / this.o.cell) + lj);
      const keep = deepest >= LAKE_DEEPEST && members.length >= LAKE_MIN_CELLS && members.length <= LAKE_MAX_CELLS && roll < LAKE_SHARE;
      for (const c of members) lake[c] = keep ? top : NaN;
    }
  }

  private traceRivers(DI: number[], DJ: number[]): void {
    const { n, acc, recv, elev, lake, o } = this;
    const minCells = o.minArea / ((o.cell / 1000) ** 2);
    const { feed } = this;
    // Where a brook runs into a river or lake (by cell, asked once).
    const joins = new Map<number, ReturnType<BrookFeed['join']>>();
    const joinAt = (c: number) => {
      if (!feed) return null;
      if (!joins.has(c)) { const i = c % n; joins.set(c, feed.join(this.x0 + (i + 0.5) * o.cell, this.z0 + ((c - i) / n + 0.5) * o.cell)); }
      return joins.get(c)!;
    };
    const isRiver = (c: number) => acc[c] >= minCells && elev[c] > 0 && Number.isNaN(lake[c]) && !joinAt(c);
    const used = new Uint8Array(n * n);
    // Heads first by size, so main stems are traced whole and tributaries end where they join.
    const heads: number[] = [];
    for (let c = 0; c < n * n; c++) {
      if (!isRiver(c)) continue;
      const ci = c % n, cj = (c - ci) / n;
      let fed = false;
      for (let k = 0; k < 8 && !fed; k++) {
        const i = ci + DI[k], j = cj + DJ[k];
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const nb = j * n + i;
        if (recv[nb] === c && isRiver(nb)) fed = true;
      }
      if (!fed) heads.push(c);
    }
    heads.sort((a, b) => acc[b] - acc[a] || a - b);
    // Brooks that end in a bigger brook (traced before them) end on its meandering line (`ontoLine`).
    const lines = o.brook ? new Map<number, number[]>() : null;
    const area = (o.cell / 1000) ** 2;
    for (const h of heads) {
      const cells: number[] = [];
      // A river that leaves a lake starts in it: the lake fills its whole cell only where the land lies below its
      // level, and the head cell's centre lies a cell further on, so the river began kilometres short of the lake,
      // out of nothing on dry ground. From the lake's cell it cuts its way out through the rim at the lake's level.
      const from = this.lakeAbove(h, DI, DJ);
      if (from >= 0) cells.push(from);
      let c = h, end: ReturnType<BrookFeed['join']> = null;
      while (c >= 0) {
        // A brook ends where it reaches a river or lake: at the water's own line.
        if ((end = joinAt(c))) break;
        cells.push(c);
        if (used[c] || elev[c] <= 0 || !Number.isNaN(lake[c])) break;
        used[c] = 1;
        // A narrow river (a gorge out of a lake) can lie between two cell centres: a brook crossing it ends in it.
        if (feed && recv[c] >= 0 && (end = this.joinBetween(c, recv[c], feed))) break;
        c = recv[c];
      }
      const into = !end && used[cells[cells.length - 1]] && cells.length > 1;
      if (cells.length + (end ? 1 : 0) < 2) continue;
      // Coarse points: cell centres, level = filled height (sea: 0), half width from the catchment.
      const px: number[] = [], pz: number[] = [], pl: number[] = [], ph: number[] = [];
      for (const cc of cells) {
        const i = cc % n, j = (cc - i) / n;
        px.push(this.x0 + (i + 0.5) * o.cell);
        pz.push(this.z0 + (j + 0.5) * o.cell);
        pl.push(elev[cc] <= 0 ? 0 : !Number.isNaN(lake[cc]) ? lake[cc] : elev[cc]);
        ph.push(o.brook ? clamp(riverHalf(acc[cc] * area), BROOK_HALF[0], BROOK_HALF[1]) : riverHalf(acc[cc] * area));
      }
      if (end) { px.push(end.x); pz.push(end.z); pl.push(end.level); ph.push(ph[ph.length - 1]); }
      // Into a lake: on to its water's edge (the cell's middle may be dry land). Out of one: from its water, over the
      // rim where it runs out, then down to its course.
      const last = cells[cells.length - 1], pond = !end && cells.length > 1 && !Number.isNaN(lake[last]) ? this.lakeIn(last) : null;
      if (pond) [px[px.length - 1], pz[pz.length - 1]] = pond.nearestWater(px[px.length - 2], pz[pz.length - 2]);
      const out = from >= 0 ? this.lakeIn(from) : null;
      if (out) {
        const [wx, wz] = out.nearestWater(out.crest[0], out.crest[1]);
        px.splice(0, 1, wx, out.crest[0], out.spill[0]); pz.splice(0, 1, wz, out.crest[1], out.spill[1]);
        pl.splice(0, 1, out.level, out.level, out.level); ph.splice(0, 1, ph[0], ph[0], ph[0]);
      }
      // Levels never rise downstream: through a rim the river cuts a gorge down to the level it came at.
      for (let k = 1; k < pl.length; k++) pl[k] = Math.min(pl[k], pl[k - 1]);
      if (into && lines) this.ontoLine(lines, px, pz, pl);
      this.rivers.push(this.shape(px, pz, pl, ph));
      if (lines) this.addLine(lines, this.rivers.length - 1);
    }
    this.rivers.forEach((r, ri) => this.index(r, ri));
  }

  /** Where the step from cell `a` to cell `b` first meets a river or lake (`BrookFeed.join`), checked every ~20 m. */
  private joinBetween(a: number, b: number, feed: BrookFeed): ReturnType<BrookFeed['join']> {
    const { n } = this, c = this.o.cell;
    const ax = a % n, az = (a - ax) / n, bx = b % n, bz = (b - bx) / n;
    const len = Math.hypot(bx - ax, bz - az) * c, steps = Math.ceil(len / 20);
    // (Most steps lie far from any river or lake: asked once for the whole step. Rivers join within ~0.35 of their
    // valley past their edge, under 150 m for all but the widest.)
    if (Number.isNaN(this.lake[b]) && !feed.riverNear(this.x0 + ((ax + bx) / 2 + 0.5) * c, this.z0 + ((az + bz) / 2 + 0.5) * c, len / 2 + 150)) return null;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const hit = feed.join(this.x0 + (ax + (bx - ax) * t + 0.5) * c, this.z0 + (az + (bz - az) * t + 0.5) * c);
      if (hit) return hit;
    }
    return null;
  }

  /** The lake cell (the one draining most) that drains into head cell `h`, or -1. */
  private lakeAbove(h: number, DI: number[], DJ: number[]): number {
    const { n, recv, lake, acc } = this;
    const hi = h % n, hj = (h - hi) / n;
    let best = -1;
    for (let k = 0; k < 8; k++) {
      const i = hi + DI[k], j = hj + DJ[k];
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const nb = j * n + i;
      if (recv[nb] === h && !Number.isNaN(lake[nb]) && (best < 0 || acc[nb] > acc[best])) best = nb;
    }
    return best;
  }

  /** Brooks' points by 100 m square (`ontoLine`). */
  private addLine(lines: Map<number, number[]>, ri: number): void {
    const r = this.rivers[ri];
    for (let k = 0; k < r.level.length; k++) {
      const key = this.key(Math.floor(r.xz[k * 2] / 100), Math.floor(r.xz[k * 2 + 1] / 100));
      let list = lines.get(key);
      if (!list) lines.set(key, (list = []));
      list.push(ri, k);
    }
  }

  /**
   * A brook that runs into a bigger one ends at that brook's cell; but the bigger one meanders away from its
   * cells, so its path ends at the nearest point of that one's line instead (and no higher than the water there),
   * before it is shaped: it bends over to it in a curve like any other.
   */
  private ontoLine(lines: Map<number, number[]>, px: number[], pz: number[], pl: number[]): void {
    const e = px.length - 1, x = px[e], z = pz[e];
    let best = Infinity, bx = x, bz = z, bl = pl[e];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const list = lines.get(this.key(Math.floor(x / 100) + i, Math.floor(z / 100) + j));
      if (list) for (let q = 0; q < list.length; q += 2) {
        const r = this.rivers[list[q]], k = list[q + 1], d = Math.hypot(r.xz[k * 2] - x, r.xz[k * 2 + 1] - z);
        if (d < best) { best = d; bx = r.xz[k * 2]; bz = r.xz[k * 2 + 1]; bl = r.level[k]; }
      }
    }
    if (best === Infinity) return;
    px[e] = bx; pz[e] = bz; pl[e] = Math.min(pl[e], bl);
  }

  /** A river's course: its coarse path smoothed (Chaikin twice), resampled every STEP metres and meandering. */
  private riverCourse(px: number[], pz: number[], pl: number[], ph: number[]): Course {
    const [X, Z, L, H] = chaikin([px, pz, pl, ph], 2);
    const c: Course = [[], [], [], []];
    const amp = Math.min(this.o.cell * 0.3, 650);
    for (let k = 0; k < X.length - 1; k++) {
      const dx = X[k + 1] - X[k], dz = Z[k + 1] - Z[k], len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.round(len / STEP));
      const nx = -dz / (len || 1), nz = dx / (len || 1);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = X[k] + dx * t, z = Z[k] + dz * t;
        const half = H[k] + (H[k + 1] - H[k]) * t;
        // Meanders: wider rivers swing in wider loops; fade at the ends so mouths and joins stay put.
        const ends = Math.min(1, Math.min(k + t, X.length - 1 - k - t) / 3);
        const m = this.meander.fbm2(x / 2600, z / 2600, 2) * amp * clamp(half / 25, 0.35, 1) * ends;
        c[0].push(x + nx * m); c[1].push(z + nz * m); c[2].push(L[k] + (L[k + 1] - L[k]) * t); c[3].push(half);
      }
    }
    c[0].push(X[X.length - 1]); c[1].push(Z[Z.length - 1]); c[2].push(L[L.length - 1]); c[3].push(H[H.length - 1]);
    return c;
  }

  /**
   * A brook's course (D50): its cells' path straightened (they step in eight directions only), rounded, and
   * meandering along its own smooth line, so it bends in curves, never in corners. Every BROOK_STEP metres.
   */
  private brookCourse(px: number[], pz: number[], pl: number[], ph: number[]): Course {
    const keep = straighten(px, pz, BROOK_STRAIGHTEN);
    const [X, Z, L, H] = resampleCourse(chaikin([keep.map((k) => px[k]), keep.map((k) => pz[k]), keep.map((k) => pl[k]), keep.map((k) => ph[k])], 3), BROOK_FINE);
    const n = X.length, amp = Math.min(this.o.cell * 0.3, 650), run = (n - 1) * BROOK_FINE;
    // Sideways by the meander field, across the rounded line (its direction over 40 m either way: on a tight bend
    // the sideways swing would fold the course over).
    blur(X, BROOK_BLUR); blur(Z, BROOK_BLUR);
    const mx = X.slice(), mz = Z.slice();
    for (let k = 1; k < n - 1; k++) {
      const a = Math.max(0, k - 4), b = Math.min(n - 1, k + 4);
      const dx = X[b] - X[a], dz = Z[b] - Z[a], len = Math.hypot(dx, dz) || 1;
      // Faded at the ends, so heads, mouths and joins stay put.
      const ends = Math.min(1, Math.min(k, n - 1 - k) * BROOK_FINE / Math.min(150, run / 3));
      const m = this.meander.fbm2(X[k] / BROOK_MEANDER, Z[k] / BROOK_MEANDER, 2) * amp * ends;
      mx[k] = X[k] - (dz / len) * m; mz[k] = Z[k] + (dx / len) * m;
    }
    blur(mx, BROOK_BLUR); blur(mz, BROOK_BLUR);
    const every = BROOK_STEP / BROOK_FINE, c: Course = [[], [], [], []];
    for (let k = 0; k < n; k += every) { c[0].push(mx[k]); c[1].push(mz[k]); c[2].push(L[k]); c[3].push(H[k]); }
    if ((n - 1) % every) { c[0].push(mx[n - 1]); c[1].push(mz[n - 1]); c[2].push(L[n - 1]); c[3].push(H[n - 1]); }
    return c;
  }

  /** Smooth and resample a coarse path, then let it meander (offset by world position only). */
  private shape(px: number[], pz: number[], pl: number[], ph: number[]): River {
    const brook = this.o.brook ?? false, step = brook ? BROOK_STEP : STEP;
    const [cx, cz, cl, chw] = brook ? this.brookCourse(px, pz, pl, ph) : this.riverCourse(px, pz, pl, ph);
    const xz: number[] = [], lv: number[] = [], hw: number[] = [];
    // A brook's ground at each point (for its level and how far its sides spread).
    const gr: number[] = [];
    const last = cx.length - 1;
    for (let k = 0; k <= last; k++) {
      xz.push(cx[k], cz[k]); hw.push(chw[k]);
      // A brook lies in the ground where it runs (its cells are too coarse for the dips between them): the land at the
      // point itself, not the cells' blend, which stands metres above a dip between them (a brook on a bank, W2).
      if (!this.feed || k === last) { lv.push(cl[k]); continue; }
      gr.push(this.feed.ground(cx[k], cz[k]));
      // Low by the sea, the land's small relief (terrain.ts, down to 0.5 m) dips below a brook's ground: it runs
      // at the sea's height there, so its banks stay dry.
      const bl = Math.min(cl[k], gr[k] - 0.2);
      lv.push(bl < LOW_LAND ? Math.min(bl, 0.3) : bl);
    }
    // A river ends where it meets the sea: its coarse cells would carry it on over the sea floor, a band of water
    // standing metres above the sea. One point past the shore, at the sea's level, so it reaches the water.
    const sea = (k: number) => this.skeleton.elevation(xz[k * 2], xz[k * 2 + 1]) < 0;
    if (lv.length > 2 && sea(lv.length - 1)) {
      let k = lv.length - 1;
      while (k > 1 && sea(k - 1)) k--;
      xz.length = (k + 1) * 2; lv.length = hw.length = k + 1;
      if (gr.length > k + 1) gr.length = k + 1;
      lv[k] = Math.min(lv[k], 0);
      // A river's coarse levels may stand above the low land by the shore: there it runs down with the land.
      for (let j = k - 1; j > 0 && !brook; j--) {
        const land = Math.max(0, this.skeleton.elevation(xz[j * 2], xz[j * 2 + 1])) + 0.5;
        if (lv[j] <= land) break;
        lv[j] = land;
      }
    }
    // Never rise downstream.
    for (let k = 1; k < lv.length; k++) lv[k] = Math.min(lv[k], lv[k - 1]);
    const fall = new Float32Array(lv.length - 1);
    const seed = deriveSeed(this.skeleton.seed, 'falls');
    // Brooks tumble down their steps without falls of their own.
    for (let a = 0, last = -Infinity, k = brook ? lv.length : 1; k < lv.length; k++) {
      if (lv[a] - lv[k] >= FALL_MIN && k - a >= 2) {
        // Which places fall is a property of the place, so neighbouring tiles agree.
        const keep = (a - last) * step >= FALL_SPACING && hash2f(seed, Math.round(xz[a * 2] / 50), Math.round(xz[a * 2 + 1] / 50)) < FALL_SHARE;
        if (keep) {
          fall[a] = lv[a] - lv[k];
          for (let j = a + 1; j < k; j++) lv[j] = lv[k];
          last = a;
        }
        a = k;
      } else if ((k - a) * step > FALL_RUN) a++;
    }
    // Over a high shore it falls into the sea (brooks run down their last stretch).
    if (!brook && lv[lv.length - 1] <= 0) {
      let j = -1;
      for (let k = Math.max(0, lv.length - 4); k < lv.length - 1; k++) if (j < 0 || lv[k] - lv[k + 1] > lv[j] - lv[j + 1]) j = k;
      const near = fall.subarray(Math.max(0, j - Math.ceil(FALL_SPACING / step)), j).some((f) => f > 0);
      if (j >= 0 && !near && lv[j] - lv[j + 1] >= FALL_MIN / 2) fall[j] = lv[j] - lv[j + 1];
    }
    const out: River = { xz: Float64Array.from(xz), level: Float32Array.from(lv), half: Float32Array.from(hw), fall };
    const feed = this.feed;
    if (feed) {
      // Where a brook lies deep below the land round it (cut down through a rise), its sides spread out: no
      // steeper than about one in three (smoothstep's steepest part included); the land's small relief adds 2 m.
      out.reach = Float32Array.from(hw, (h, k) => {
        const cut = Math.max(0, (gr[k] ?? this.drainedAt(xz[k * 2], xz[k * 2 + 1])) - lv[k]);
        return Math.max(brookValley(h), h + 3 * (cut + 2));
      });
    }
    return out;
  }

  /** The drained ground between cell centres (bilinear): a brook's points ask it rather than the land again. */
  private drainedAt(x: number, z: number): number {
    const { n, elev } = this, c = this.o.cell;
    const u = clamp((x - this.x0) / c - 0.5, 0, n - 1.001), v = clamp((z - this.z0) / c - 0.5, 0, n - 1.001);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * n + i;
    return (elev[k] * (1 - fu) + elev[k + 1] * fu) * (1 - fv) + (elev[k + n] * (1 - fu) + elev[k + n + 1] * fu) * fv;
  }

  private get meander(): Noise {
    return (this._meander ??= new Noise(deriveSeed(this.skeleton.seed, 'hydro', 'meander')));
  }
  private _meander: Noise | null = null;

  private key(bx: number, bz: number): number { return bx * 73856093 + bz * 19349663; }


  private index(r: River, ri: number): void {
    const B = this.bucket;
    for (let k = 0; k < r.level.length - 1; k++) {
      const pad = r.reach ? Math.max(r.reach[k], r.reach[k + 1]) : valleyOf(Math.max(r.half[k], r.half[k + 1]));
      const ax = r.xz[k * 2], az = r.xz[k * 2 + 1], bx = r.xz[k * 2 + 2], bz = r.xz[k * 2 + 3];
      const x0 = Math.floor((Math.min(ax, bx) - pad) / B), x1 = Math.floor((Math.max(ax, bx) + pad) / B);
      const z0 = Math.floor((Math.min(az, bz) - pad) / B), z1 = Math.floor((Math.max(az, bz) + pad) / B);
      for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) {
        const key = this.key(i, j);
        let list = this.buckets.get(key);
        if (!list) this.buckets.set(key, (list = []));
        list.push(ri, k);
      }
    }
  }

  /**
   * Every river point within `within` metres of (x, z) (resampled points, STEP apart): its river, index and
   * distance. For siting by the water (freshWater.ts).
   */
  riverPoints(x: number, z: number, within: number, visit: (r: River, k: number, d: number) => void): void {
    const B = this.bucket;
    const seen = new Set<number>();
    for (let i = Math.floor((x - within) / B); i <= Math.floor((x + within) / B); i++) for (let j = Math.floor((z - within) / B); j <= Math.floor((z + within) / B); j++) {
      const list = this.buckets.get(this.key(i, j));
      if (list) for (let q = 0; q < list.length; q += 2) {
        const ri = list[q], k = list[q + 1], id = ri * 65536 + k;
        if (seen.has(id)) continue;
        seen.add(id);
        const r = this.rivers[ri], d = Math.hypot(r.xz[k * 2] - x, r.xz[k * 2 + 1] - z);
        if (d <= within) visit(r, k, d);
      }
    }
  }

  /** Metres from (x, z) to the nearest river's edge (negative in the water), if one lies within `within`; else Infinity. */
  riverEdge(x: number, z: number, within: number): number {
    const B = this.bucket;
    let best = Infinity;
    for (let i = Math.floor((x - within) / B); i <= Math.floor((x + within) / B); i++) for (let j = Math.floor((z - within) / B); j <= Math.floor((z + within) / B); j++) {
      const list = this.buckets.get(this.key(i, j));
      if (list) for (let q = 0; q < list.length; q += 2) {
        const r = this.rivers[list[q]], k = list[q + 1];
        const ax = r.xz[k * 2], az = r.xz[k * 2 + 1], dx = r.xz[k * 2 + 2] - ax, dz = r.xz[k * 2 + 3] - az;
        const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        const e = Math.hypot(x - ax - dx * t, z - az - dz * t) - (r.half[k] + (r.half[k + 1] - r.half[k]) * t);
        if (e < best) best = e;
      }
    }
    return best <= within ? best : Infinity;
  }

  /** The water at (x, z): the nearest river whose valley reaches here, and the lake of this cell. */
  query(x: number, z: number, out: WaterHere = emptyWater()): WaterHere {
    out.river = false; out.brook = false; out.dist = Infinity; out.lake = NaN; out.fallAt = Infinity; out.fallDrop = 0;
    const list = this.buckets.get(this.key(Math.floor(x / this.bucket), Math.floor(z / this.bucket)));
    let best = Infinity;
    if (list) for (let q = 0; q < list.length; q += 2) {
      const r = this.rivers[list[q]], k = list[q + 1];
      const ax = r.xz[k * 2], az = r.xz[k * 2 + 1], bx = r.xz[k * 2 + 2], bz = r.xz[k * 2 + 3];
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1);
      const ex = x - (ax + dx * t), ez = z - (az + dz * t);
      const d = Math.hypot(ex, ez);
      const half = r.half[k] + (r.half[k + 1] - r.half[k]) * t;
      const valley = r.reach ? r.reach[k] + (r.reach[k + 1] - r.reach[k]) * t : valleyOf(half);
      // Nearest relative to its valley, so a big river's banks win over a brook's.
      const score = d / valley;
      if (d > valley || score >= best) continue;
      best = score;
      const l = Math.sqrt(l2);
      out.river = true; out.brook = this.o.brook ?? false; out.dist = d; out.half = half; out.valley = valley;
      out.level = r.level[k] + (r.level[k + 1] - r.level[k]) * t;
      out.depth = this.o.brook ? brookDepth(half) : riverDepth(half);
      out.fx = dx / l; out.fz = dz / l;
      out.cx = ax + dx * t; out.cz = az + dz * t;
      const sl = slopesOf(r);
      out.slope = sl[k] + (sl[k + 1] - sl[k]) * t;
      out.fallAt = Infinity; out.fallDrop = 0;
      if (r.fall[k] > 0) {
        // The drop happens at the lip, mid-segment; the level is flat on both sides of it.
        const along = t * l - l / 2;
        out.level = r.level[k + 1] + r.fall[k] * (1 - smoothstep(-FALL_LIP / 2, FALL_LIP / 2, along));
        out.fallAt = along; out.fallDrop = r.fall[k]; out.fallBase = r.level[k + 1];
      } else if (k > 0 && r.fall[k - 1] > 0) {
        const pl = Math.hypot(ax - r.xz[k * 2 - 2], az - r.xz[k * 2 - 1]);
        out.fallAt = pl / 2 + t * l; out.fallDrop = r.fall[k - 1]; out.fallBase = r.level[k];
      }
    }
    out.lake = this.lakeLevel(x, z);
    return out;
  }

  /** The lake of cell `c` (W3), or null. */
  private lakeIn(c: number): Lake | null {
    const id = this.lakeOf.length ? this.lakeOf[c] : -1;
    return id >= 0 ? this.lakes[id] : null;
  }

  /** The lake whose water or shore may lie at (x, z), or null. */
  lakeNear(x: number, z: number): Lake | null {
    const i = Math.floor((x - this.x0) / this.o.cell), j = Math.floor((z - this.z0) / this.o.cell);
    const id = i >= 0 && j >= 0 && i < this.n && j < this.n && this.lakeOf.length ? this.lakeOf[j * this.n + i] : -1;
    return id >= 0 ? this.lakes[id] : null;
  }

  /** The level of the lake at (x, z), NaN where there is none. */
  lakeLevel(x: number, z: number): number {
    const l = this.lakeNear(x, z);
    return l?.holds(x, z) ? l.level : NaN;
  }
}

/** Hydro tiles by need: the tile that owns a point (by its core), computed once. */
/** A tile as another thread traced it: its rivers and its sediment floors. */
export interface PackedTile {
  rivers: River[];
  plain: Float32Array;
}

/**
 * A tile packed into one array, to hand it to another thread: [count, then per river: points, xz, level, half, fall,
 * reach (0 or n)], then [floors, then per floor: cell, level].
 */
export function packTile(t: HydroTile): Float64Array {
  const { rivers, plain } = t;
  let size = 2;
  for (const r of rivers) size += 2 + r.level.length * 4 + r.fall.length + (r.reach?.length ?? 0);
  const floors: number[] = [];
  plain.forEach((p, c) => { if (!Number.isNaN(p)) floors.push(c, p); });
  size += floors.length;
  const out = new Float64Array(size);
  let o = 0;
  out[o++] = rivers.length;
  for (const r of rivers) {
    const n = r.level.length;
    out[o++] = n;
    out.set(r.xz, o); o += n * 2;
    out.set(r.level, o); o += n;
    out.set(r.half, o); o += n;
    out.set(r.fall, o); o += r.fall.length;
    out[o++] = r.reach ? 1 : 0;
    if (r.reach) { out.set(r.reach, o); o += n; }
  }
  out[o++] = floors.length / 2;
  out.set(floors, o);
  return out;
}

/** The tile `packTile` packed (the same numbers: levels and widths were float32 to begin with); `cells` per tile. */
export function unpackTile(a: Float64Array, cells: number): PackedTile {
  const rivers: River[] = [];
  let o = 1;
  for (let k = 0; k < a[0]; k++) {
    const n = a[o++];
    const xz = a.slice(o, o + n * 2); o += n * 2;
    const level = Float32Array.from(a.subarray(o, o + n)); o += n;
    const half = Float32Array.from(a.subarray(o, o + n)); o += n;
    const fall = Float32Array.from(a.subarray(o, o + n - 1)); o += n - 1;
    const r: River = { xz, level, half, fall };
    if (a[o++]) { r.reach = Float32Array.from(a.subarray(o, o + n)); o += n; }
    rivers.push(r);
  }
  const plain = new Float32Array(cells).fill(NaN);
  for (let k = 0, count = a[o++]; k < count; k++, o += 2) plain[a[o]] = a[o + 1];
  return { rivers, plain };
}

export class Hydrology {
  private readonly tiles = new Map<string, HydroTile>();
  private readonly brookTiles = new Map<string, HydroTile>();
  private readonly fine = emptyWater();
  private lastRiver: HydroTile | null = null;
  private lastBrook: HydroTile | null = null;

  /** `brooks`: the brooks' grid (D50), null for rivers alone. */
  constructor(readonly skeleton: Skeleton, readonly o: HydroOptions = HYDRO, readonly brooks: HydroOptions | null = BROOKS) {}

  /**
   * What a brook tile drains over: the land as the rivers of one river tile shape it (the one under the brook
   * tile's middle; its margin reaches far past the brook tile, so no second river tile is built at a seam).
   */
  private feedOf(main: HydroTile): BrookFeed {
    const w = emptyWater(), sk = this.skeleton;
    return {
      ground: (x, z) => shapeByWater(main.query(x, z, w), main.onFloors(x, z, sk.elevation(x, z))),
      join: (x, z) => {
        main.query(x, z, w);
        // Into a river: once well inside its valley, straight to its line.
        if (inChannel(w, (w.valley - w.half) * 0.35)) return { x: w.cx, z: w.cz, level: w.level };
        if (!Number.isNaN(w.lake) && sk.elevation(x, z) < w.lake) return { x, z, level: w.lake };
        return null;
      },
      riverNear: (x, z, within) => main.riverEdge(x, z, within) < Infinity,
    };
  }

  tileAt(x: number, z: number): HydroTile {
    return this.tileOf(this.tiles, this.o, x, z, () => null);
  }

  /** How many brook tiles are built here (grows as they arrive). */
  get brookTileCount(): number { return this.brookTiles.size; }

  /** Whether the brook tile that owns a point is built here already. */
  hasBrooks(x: number, z: number): boolean {
    const b = this.brooks, side = b ? b.core * b.cell : 1;
    return !b || this.brookTiles.has(`${Math.floor(x / side)},${Math.floor(z / side)}`);
  }

  /** A brook tile traced in another thread (its `packTile`): it need not be traced here (that takes 0.2-0.3 s). */
  adoptBrooks(tx: number, tz: number, packed: Float64Array): void {
    const b = this.brooks, key = `${tx},${tz}`;
    if (!b || this.brookTiles.has(key)) return;
    const n = b.core + 2 * b.margin;
    this.brookTiles.set(key, new HydroTile(this.skeleton, tx, tz, b, null, unpackTile(packed, n * n)));
  }

  /**
   * Ground `h` at (x, z) as the hollows' sediment floors raise it (W2): the rivers' grid's, then the brooks' (whose
   * drainage ran over the land the rivers' floors and valleys had shaped).
   */
  onFloors(x: number, z: number, h: number): number {
    const r = this.tileAt(x, z).onFloors(x, z, h), b = this.brookTileAt(x, z);
    return b ? b.onFloors(x, z, r) : r;
  }

  /** The brook tile that owns a point (null without brooks). */
  brookTileAt(x: number, z: number): HydroTile | null {
    const b = this.brooks;
    if (!b) return null;
    return this.tileOf(this.brookTiles, b, x, z, (tx, tz) => this.feedOf(this.tileAt((tx + 0.5) * b.core * b.cell, (tz + 0.5) * b.core * b.cell)));
  }

  private tileOf(tiles: Map<string, HydroTile>, o: HydroOptions, x: number, z: number, feed: (tx: number, tz: number) => BrookFeed | null): HydroTile {
    const side = o.core * o.cell;
    const tx = Math.floor(x / side), tz = Math.floor(z / side);
    // Most asks fall in the tile asked last.
    const last = tiles === this.tiles ? this.lastRiver : this.lastBrook;
    if (last && last.tx === tx && last.tz === tz) return last;
    const key = `${tx},${tz}`;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = new HydroTile(this.skeleton, tx, tz, o, feed(tx, tz))));
    if (tiles === this.tiles) this.lastRiver = t; else this.lastBrook = t;
    return t;
  }

  /** The water at (x, z): the nearest river or brook relative to its valley, and the lake here. */
  query(x: number, z: number, out: WaterHere = emptyWater()): WaterHere {
    this.tileAt(x, z).query(x, z, out);
    const b = this.brookTileAt(x, z);
    if (!b) return out;
    const f = b.query(x, z, this.fine);
    if (f.river && (!out.river || f.dist / f.valley < out.dist / out.valley)) {
      out.river = true; out.brook = true; out.dist = f.dist; out.half = f.half; out.level = f.level; out.depth = f.depth;
      out.fx = f.fx; out.fz = f.fz; out.cx = f.cx; out.cz = f.cz; out.valley = f.valley;
      out.fallAt = Infinity; out.fallDrop = 0; out.fallBase = 0; out.slope = f.slope;
    }
    return out;
  }

  /** The lake whose water or shore may lie at (x, z) (W3), or null. */
  lakeNear(x: number, z: number): Lake | null {
    return this.tileAt(x, z).lakeNear(x, z);
  }

  /** The level of the lake at (x, z), NaN where there is none (as `query` gives it, without the rivers). */
  lakeLevel(x: number, z: number): number {
    return this.tileAt(x, z).lakeLevel(x, z);
  }

  /** The nearest river alone (no brooks) at (x, z), and the lake here. */
  riverAt(x: number, z: number, out: WaterHere = emptyWater()): WaterHere {
    return this.tileAt(x, z).query(x, z, out);
  }

  /** The nearest brook alone at (x, z) (`river` false where none is near). */
  brookAt(x: number, z: number, out: WaterHere = emptyWater()): WaterHere {
    const b = this.brookTileAt(x, z);
    if (b) return b.query(x, z, out);
    out.river = out.brook = false;
    return out;
  }

  /** Metres to the nearest river's (or brook's) edge within `within`, else Infinity. */
  riverEdge(x: number, z: number, within: number, brooks = true): number {
    const b = brooks ? this.brookTileAt(x, z) : null;
    return Math.min(this.tileAt(x, z).riverEdge(x, z, within), b ? b.riverEdge(x, z, within) : Infinity);
  }

  /** Every river (and brook) point within `within` metres. */
  riverPoints(x: number, z: number, within: number, visit: (r: River, k: number, d: number) => void, brooks = true): void {
    this.tileAt(x, z).riverPoints(x, z, within, visit);
    if (brooks) this.brookTileAt(x, z)?.riverPoints(x, z, within, visit);
  }
}

/**
 * Rivers and brooks shape their valleys: inside the channel the ground drops to a rounded bed, along the
 * banks it lies a little above the water and rises gently, and further out it blends back into the land
 * (lowering hills into a valley, or lifting hollows into banks so the water stays in its bed). Gorges through
 * rims come out as steep walls. Lakes need no shaping: their basins are already below the level.
 */
export function shapeByWater(w: WaterHere, h: number): number {
  if (!w.river) return h;
  const { dist, half, level, depth, valley } = w;
  let shaped: number;
  if (dist < half) {
    const q = dist / half;
    shaped = rockLevel(w) - (depth + plunge(w)) * (1 - q * q);
  } else {
    const bank = bankLevel(w) + rim(dist - half) + (dist - half) * 0.12;
    if (h >= bank) {
      // Higher ground slopes down to the bank over the valley, keeping a share of its own relief.
      const keep = 0.2 * smoothstep(half, half + 25, dist);
      shaped = lerp(bank, h, Math.max(keep, smoothstep(half, valley, dist)));
    } else {
      // Low ground: a low levee keeps the river in its bed, then the land is left as it is.
      // (Over the valley's outer half at most, so a brook's narrow valley ends where the land is its own.)
      const levee = bankLevel(w) + rim(dist - half) + Math.min((dist - half) * 0.12, 1.2), wide = valley - half;
      shaped = Math.max(h, lerp(levee, h, smoothstep(half + Math.min(30, wide / 4), Math.min((half + valley) / 2 + 30, valley), dist)));
    }
  }
  // At the mouth the sea takes over: only lower, never build banks out into the water.
  return level < 1 ? Math.min(h, shaped) : shaped;
}

/**
 * The bank's rise over the water `out` metres past the water's edge: up to 0.4 m over BANK_RISE m, not a
 * step at the edge. A step there fell between the ground mesh's vertices, so the waterline ran along it in
 * stairs of the mesh's triangles (most of all on a brook, a few metres wide).
 */
const rim = (out: number): number => 0.4 * smoothstep(0, BANK_RISE, out);
const BANK_RISE = 1.6;

/** Extra depth of the pool a waterfall digs below its lip, metres. */
function plunge(w: WaterHere): number {
  const reach = 3 * w.half + 12;
  if (!(w.fallAt > FALL_LIP / 2) || w.fallAt > reach) return 0;
  const f = 1 - w.fallAt / reach;
  return Math.min(0.5 * w.fallDrop, 8) * f * f;
}

/**
 * The level the banks follow: the river's, except that a waterfall's step spreads out away from the water,
 * so the drop is a cliff at the river and a slope across the valley rather than a wall through the land.
 */
function bankLevel(w: WaterHere): number {
  if (!(w.fallDrop > 0)) return w.level;
  const wide = Math.min(FALL_LIP + (w.dist - w.half) * 1.5, 70);
  return w.fallBase + w.fallDrop * (1 - smoothstep(-wide / 2, wide / 2, w.fallAt));
}

/** The water leaves the lip in an arc: the rock under it steps down a little upstream, behind the falling sheet. */
const UNDERCUT = 2.5;
function rockLevel(w: WaterHere): number {
  if (!(w.fallDrop > 0) || Math.abs(w.fallAt + UNDERCUT) > 4) return w.level;
  return w.fallBase + w.fallDrop * (1 - smoothstep(-FALL_LIP / 2, FALL_LIP / 2, w.fallAt + UNDERCUT));
}
