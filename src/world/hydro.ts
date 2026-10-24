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
import { MinHeap, Noise, clamp, deriveSeed, hash2f, smoothstep } from '@futuremagic/core';
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
}

export const HYDRO: HydroOptions = { cell: 2000, core: 512, margin: 128, minArea: 120 };

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
}

/** What the water does at one point (filled by `HydroTile.query`). */
export interface WaterHere {
  /** Nearest river within its valley: distance to its centre line, its half width, level and depth there. */
  river: boolean;
  dist: number;
  half: number;
  level: number;
  depth: number;
  /** Unit flow direction of that river. */
  fx: number;
  fz: number;
  /** Valley radius the river shapes the land within. */
  valley: number;
  /** Lake level here (the cell is a lake), else NaN. */
  lake: number;
  /** Distance downstream from the nearest waterfall's lip (negative above it), Infinity when none is near; its height and the level at its foot. */
  fallAt: number;
  fallDrop: number;
  fallBase: number;
}

export const emptyWater = (): WaterHere => ({ river: false, dist: Infinity, half: 0, level: 0, depth: 0, fx: 0, fz: 0, valley: 0, lake: NaN, fallAt: Infinity, fallDrop: 0, fallBase: 0 });

/** Half width (m) of a river draining `areaKm2`. */
export const riverHalf = (areaKm2: number): number => 0.6 * Math.sqrt(areaKm2);
/** Depth (m) of a river of half width `half`. */
export const riverDepth = (half: number): number => 1.2 + half * 0.15;
/** How far either side the river shapes its valley. */
export const valleyOf = (half: number): number => half + Math.max(120, half * 4);

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

  constructor(readonly skeleton: Skeleton, readonly tx: number, readonly tz: number, readonly o: HydroOptions = HYDRO) {
    const { cell, core, margin } = o;
    const n = (this.n = core + 2 * margin);
    this.x0 = (tx * core - margin) * cell;
    this.z0 = (tz * core - margin) * cell;
    this.bucket = cell;
    const N = n * n;
    const E = (this.elev = new Float32Array(N));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) E[j * n + i] = skeleton.elevation(this.x0 + (i + 0.5) * cell, this.z0 + (j + 0.5) * cell);
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

    // Lakes: land cells the flood filled; each lake lies flat at its spill level.
    const lake = (this.lake = new Float32Array(N).fill(NaN));
    for (let c = 0; c < N; c++) if (E[c] > 0 && F[c] - E[c] > LAKE_MIN) lake[c] = F[c];
    this.flattenLakes(DI, DJ);

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
    const isRiver = (c: number) => acc[c] >= minCells && elev[c] > 0 && Number.isNaN(lake[c]);
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
    const area = (o.cell / 1000) ** 2;
    for (const h of heads) {
      const cells: number[] = [];
      let c = h;
      while (c >= 0) {
        cells.push(c);
        if (used[c] || elev[c] <= 0 || !Number.isNaN(lake[c])) break;
        used[c] = 1;
        c = recv[c];
      }
      if (cells.length < 2) continue;
      // Coarse points: cell centres, level = filled height (sea: 0), half width from the catchment.
      const px: number[] = [], pz: number[] = [], pl: number[] = [], ph: number[] = [];
      for (const cc of cells) {
        const i = cc % n, j = (cc - i) / n;
        px.push(this.x0 + (i + 0.5) * o.cell);
        pz.push(this.z0 + (j + 0.5) * o.cell);
        pl.push(elev[cc] <= 0 ? 0 : !Number.isNaN(lake[cc]) ? lake[cc] : elev[cc]);
        ph.push(riverHalf(acc[cc] * area));
      }
      // Levels never rise downstream: through a rim the river cuts a gorge down to the level it came at.
      for (let k = 1; k < pl.length; k++) pl[k] = Math.min(pl[k], pl[k - 1]);
      this.rivers.push(this.shape(px, pz, pl, ph));
    }
    this.rivers.forEach((r, ri) => this.index(r, ri));
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
        xz.push(x + nx * m, z + nz * m);
        lv.push(L[k] + (L[k + 1] - L[k]) * t);
        hw.push(half);
      }
    }
    xz.push(X[X.length - 1], Z[Z.length - 1]); lv.push(L[L.length - 1]); hw.push(H[H.length - 1]);
    // Never rise downstream.
    for (let k = 1; k < lv.length; k++) lv[k] = Math.min(lv[k], lv[k - 1]);
    const fall = new Float32Array(lv.length - 1);
    const seed = deriveSeed(this.skeleton.seed, 'falls');
    for (let a = 0, last = -Infinity, k = 1; k < lv.length; k++) {
      if (lv[a] - lv[k] >= FALL_MIN && k - a >= 2) {
        // Which places fall is a property of the place, so neighbouring tiles agree.
        const keep = (a - last) * STEP >= FALL_SPACING && hash2f(seed, Math.round(xz[a * 2] / 50), Math.round(xz[a * 2 + 1] / 50)) < FALL_SHARE;
        if (keep) {
          fall[a] = lv[a] - lv[k];
          for (let j = a + 1; j < k; j++) lv[j] = lv[k];
          last = a;
        }
        a = k;
      } else if ((k - a) * STEP > FALL_RUN) a++;
    }
    return { xz: Float64Array.from(xz), level: Float32Array.from(lv), half: Float32Array.from(hw), fall };
  }

  private get meander(): Noise {
    return (this._meander ??= new Noise(deriveSeed(this.skeleton.seed, 'hydro', 'meander')));
  }
  private _meander: Noise | null = null;

  private key(bx: number, bz: number): number { return bx * 73856093 + bz * 19349663; }

  private index(r: River, ri: number): void {
    const B = this.bucket;
    for (let k = 0; k < r.level.length - 1; k++) {
      const pad = valleyOf(Math.max(r.half[k], r.half[k + 1]));
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

  /** The water at (x, z): the nearest river whose valley reaches here, and the lake of this cell. */
  query(x: number, z: number, out: WaterHere = emptyWater()): WaterHere {
    out.river = false; out.dist = Infinity; out.lake = NaN; out.fallAt = Infinity; out.fallDrop = 0;
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
      const valley = valleyOf(half);
      // Nearest relative to its valley, so a big river's banks win over a brook's.
      const score = d / valley;
      if (d > valley || score >= best) continue;
      best = score;
      const l = Math.sqrt(l2);
      out.river = true; out.dist = d; out.half = half; out.valley = valley;
      out.level = r.level[k] + (r.level[k + 1] - r.level[k]) * t;
      out.depth = riverDepth(half);
      out.fx = dx / l; out.fz = dz / l;
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
export class Hydrology {
  private readonly tiles = new Map<string, HydroTile>();
  constructor(readonly skeleton: Skeleton, readonly o: HydroOptions = HYDRO) {}

  tileAt(x: number, z: number): HydroTile {
    const side = this.o.core * this.o.cell;
    const tx = Math.floor(x / side), tz = Math.floor(z / side);
    const key = `${tx},${tz}`;
    let t = this.tiles.get(key);
    if (!t) this.tiles.set(key, (t = new HydroTile(this.skeleton, tx, tz, this.o)));
    return t;
  }

  query(x: number, z: number, out: WaterHere = emptyWater()): WaterHere {
    return this.tileAt(x, z).query(x, z, out);
  }
}
