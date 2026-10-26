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
/** Spacing of river polyline points after resampling, metres. */
const STEP = 80;
/** Brooks: resample spacing, meander scale (metres), and the half widths they keep to. */
const BROOK_STEP = 40;
const BROOK_MEANDER = 450;
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
  /** Lake level per cell (NaN: no lake). */
  readonly lake: Float32Array;
  readonly rivers: River[] = [];
  /** Segment index: bucket (BUCKET-m squares) → [river, point] pairs. */
  private readonly buckets = new Map<number, number[]>();
  private readonly bucket: number;

  /** `given`: the tile's rivers as another thread traced them (`packRivers`); the drainage is not kept then. */
  constructor(readonly skeleton: Skeleton, readonly tx: number, readonly tz: number, readonly o: HydroOptions = HYDRO, private readonly feed: BrookFeed | null = null, given: readonly River[] | null = null) {
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
      this.rivers.push(...given);
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
    }

    this.traceRivers(DI, DJ);
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
    // Brooks that end in a bigger brook (traced before them): their last point moves onto its meandering line.
    const tributaries: number[] = [];
    const area = (o.cell / 1000) ** 2;
    for (const h of heads) {
      const cells: number[] = [];
      let c = h, end: ReturnType<BrookFeed['join']> = null;
      while (c >= 0) {
        // A brook ends where it reaches a river or lake: at the water's own line.
        if ((end = joinAt(c))) break;
        cells.push(c);
        if (used[c] || elev[c] <= 0 || !Number.isNaN(lake[c])) break;
        used[c] = 1;
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
      // Levels never rise downstream: through a rim the river cuts a gorge down to the level it came at.
      for (let k = 1; k < pl.length; k++) pl[k] = Math.min(pl[k], pl[k - 1]);
      this.rivers.push(this.shape(px, pz, pl, ph));
      if (into && o.brook) tributaries.push(this.rivers.length - 1);
    }
    if (tributaries.length) this.joinTributaries(tributaries);
    this.rivers.forEach((r, ri) => this.index(r, ri));
  }

  /**
   * A brook that runs into a bigger one ends at that brook's cell; but the bigger one meanders away from its
   * cells, so the end moves to the nearest point of its line (and no higher than the water there).
   */
  private joinTributaries(tribs: readonly number[]): void {
    const G = 100, grid = new Map<number, number[]>();
    this.rivers.forEach((r, ri) => {
      for (let k = 0; k < r.level.length; k++) {
        const key = this.key(Math.floor(r.xz[k * 2] / G), Math.floor(r.xz[k * 2 + 1] / G));
        let list = grid.get(key);
        if (!list) grid.set(key, (list = []));
        list.push(ri, k);
      }
    });
    for (const ti of tribs) {
      const t = this.rivers[ti], e = t.level.length - 1, x = t.xz[e * 2], z = t.xz[e * 2 + 1];
      let best = Infinity, bx = x, bz = z, bl = t.level[e];
      for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
        const list = grid.get(this.key(Math.floor(x / G) + i, Math.floor(z / G) + j));
        if (list) for (let q = 0; q < list.length; q += 2) {
          // Only brooks traced before it: the one whose cell it ran into is among them.
          if (list[q] >= ti) continue;
          const r = this.rivers[list[q]], k = list[q + 1], d = Math.hypot(r.xz[k * 2] - x, r.xz[k * 2 + 1] - z);
          if (d < best) { best = d; bx = r.xz[k * 2]; bz = r.xz[k * 2 + 1]; bl = r.level[k]; }
        }
      }
      if (best === Infinity) continue;
      t.xz[e * 2] = bx; t.xz[e * 2 + 1] = bz;
      t.level[e] = Math.min(t.level[e], bl);
    }
  }

  /** Smooth and resample a coarse path, then let it meander (offset by world position only). */
  private shape(px: number[], pz: number[], pl: number[], ph: number[]): River {
    // Chaikin twice.
    let X = px, Z = pz, L = pl, H = ph;
    for (let it = 0; it < 2; it++) {
      const x: number[] = [X[0]], z: number[] = [Z[0]], l: number[] = [L[0]], h: number[] = [H[0]];
      for (let k = 0; k < X.length - 1; k++) {
        for (const t of [0.25, 0.75]) {
          x.push(X[k] + (X[k + 1] - X[k]) * t); z.push(Z[k] + (Z[k + 1] - Z[k]) * t);
          l.push(L[k] + (L[k + 1] - L[k]) * t); h.push(H[k] + (H[k + 1] - H[k]) * t);
        }
      }
      x.push(X[X.length - 1]); z.push(Z[Z.length - 1]); l.push(L[L.length - 1]); h.push(H[H.length - 1]);
      X = x; Z = z; L = l; H = h;
    }
    // Resample every STEP metres, offset sideways by a meander field.
    const xz: number[] = [], lv: number[] = [], hw: number[] = [];
    // A brook's ground at each point (for its level and how far its sides spread).
    const gr: number[] = [];
    const amp = Math.min(this.o.cell * 0.3, 650), brook = this.o.brook ?? false;
    const step = brook ? BROOK_STEP : STEP, scale = brook ? BROOK_MEANDER : 2600;
    for (let k = 0; k < X.length - 1; k++) {
      const dx = X[k + 1] - X[k], dz = Z[k + 1] - Z[k], len = Math.hypot(dx, dz);
      const steps = Math.max(1, Math.round(len / step));
      const nx = -dz / (len || 1), nz = dx / (len || 1);
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const x = X[k] + dx * t, z = Z[k] + dz * t;
        const half = H[k] + (H[k + 1] - H[k]) * t;
        // Meanders: wider rivers swing in wider loops; fade at the ends so mouths and joins stay put.
        const ends = Math.min(1, Math.min(k + t, X.length - 1 - k - t) / 3);
        const m = this.meander.fbm2(x / scale, z / scale, 2) * amp * (brook ? 1 : clamp(half / 25, 0.35, 1)) * ends;
        xz.push(x + nx * m, z + nz * m);
        // A brook lies in the ground where it runs (its cells are too coarse for the dips between them).
        const lk = L[k] + (L[k + 1] - L[k]) * t;
        if (this.feed) gr.push(this.drainedAt(x + nx * m, z + nz * m));
        lv.push(this.feed ? Math.min(lk, gr[gr.length - 1] - 0.2) : lk);
        hw.push(half);
      }
    }
    xz.push(X[X.length - 1], Z[Z.length - 1]); lv.push(L[L.length - 1]); hw.push(H[H.length - 1]);
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
    const i = Math.floor((x - this.x0) / this.o.cell), j = Math.floor((z - this.z0) / this.o.cell);
    if (i >= 0 && j >= 0 && i < this.n && j < this.n) out.lake = this.lake[j * this.n + i];
    return out;
  }
}

/** Hydro tiles by need: the tile that owns a point (by its core), computed once. */
/** Rivers packed into one array, to hand a tile to another thread: [count, then per river: points, xz, level, half, fall, reach (0 or n)]. */
export function packRivers(rivers: readonly River[]): Float64Array {
  let size = 1;
  for (const r of rivers) size += 2 + r.level.length * 4 + r.fall.length + (r.reach?.length ?? 0);
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
  return out;
}

/** The rivers `packRivers` packed (the same numbers: levels and widths were float32 to begin with). */
export function unpackRivers(a: Float64Array): River[] {
  const out: River[] = [];
  let o = 1;
  for (let k = 0; k < a[0]; k++) {
    const n = a[o++];
    const xz = a.slice(o, o + n * 2); o += n * 2;
    const level = Float32Array.from(a.subarray(o, o + n)); o += n;
    const half = Float32Array.from(a.subarray(o, o + n)); o += n;
    const fall = Float32Array.from(a.subarray(o, o + n - 1)); o += n - 1;
    const r: River = { xz, level, half, fall };
    if (a[o++]) { r.reach = Float32Array.from(a.subarray(o, o + n)); o += n; }
    out.push(r);
  }
  return out;
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
      ground: (x, z) => shapeByWater(main.query(x, z, w), sk.elevation(x, z)),
      join: (x, z) => {
        main.query(x, z, w);
        // Into a river: once well inside its valley, straight to its line.
        if (inChannel(w, (w.valley - w.half) * 0.35)) return { x: w.cx, z: w.cz, level: w.level };
        if (!Number.isNaN(w.lake) && sk.elevation(x, z) < w.lake) return { x, z, level: w.lake };
        return null;
      },
    };
  }

  tileAt(x: number, z: number): HydroTile {
    return this.tileOf(this.tiles, this.o, x, z, () => null);
  }

  /** Whether the brook tile that owns a point is built here already. */
  hasBrooks(x: number, z: number): boolean {
    const b = this.brooks, side = b ? b.core * b.cell : 1;
    return !b || this.brookTiles.has(`${Math.floor(x / side)},${Math.floor(z / side)}`);
  }

  /** A brook tile traced in another thread (its `packRivers`): it need not be traced here (that takes 0.2-0.3 s). */
  adoptBrooks(tx: number, tz: number, packed: Float64Array): void {
    const b = this.brooks, key = `${tx},${tz}`;
    if (!b || this.brookTiles.has(key)) return;
    this.brookTiles.set(key, new HydroTile(this.skeleton, tx, tz, b, null, unpackRivers(packed)));
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
    const bank = bankLevel(w) + 0.4 + (dist - half) * 0.12;
    if (h >= bank) {
      // Higher ground slopes down to the bank over the valley, keeping a share of its own relief.
      const keep = 0.2 * smoothstep(half, half + 25, dist);
      shaped = lerp(bank, h, Math.max(keep, smoothstep(half, valley, dist)));
    } else {
      // Low ground: a low levee keeps the river in its bed, then the land is left as it is.
      // (Over the valley's outer half at most, so a brook's narrow valley ends where the land is its own.)
      const levee = bankLevel(w) + 0.4 + Math.min((dist - half) * 0.12, 1.2), wide = valley - half;
      shaped = Math.max(h, lerp(levee, h, smoothstep(half + Math.min(30, wide / 4), Math.min((half + valley) / 2 + 30, valley), dist)));
    }
  }
  // At the mouth the sea takes over: only lower, never build banks out into the water.
  return level < 1 ? Math.min(h, shaped) : shaped;
}

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
