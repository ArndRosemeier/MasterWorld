/**
 * Landforms (D55, plan 5.9): the small shapes of the land, 30-500 m across, between the skeleton's big
 * country and the terrain's metre-scale bumps. Knolls, tors, dells (some with a pond), sinkholes, gullies
 * and ravines cut downhill, ridges, scarps, dry valleys, old banks and sunken lanes; boulder fields and
 * erratics leave the ground as it is and only mark where rock stands (L2).
 *
 * Each biome names its mix in the setting. Landforms are placed per cell from the seed (like flora), so they
 * never move and every thread agrees; the terrain blends them into the height field (`Terrain`), so roads,
 * towns, rivers and places see them. A middle band of relief (waves 200-600 m across) gives broken country
 * between the plains.
 *
 * Pure, runs in workers.
 */
import { Noise, Rng, clamp, deriveSeed, hash2i, smoothstep } from '@futuremagic/core';
import type { LandformDef, LandformShape, WorldShape } from '../setting/contract';
import type { Skeleton } from './skeleton';

/** Side of a landform cell, metres. A landform's reach never passes its neighbours (3 x 3 cells hold it). */
export const FORM_CELL = 256;
/** Steepest skeleton slope a landform is placed on (cliffs and terraces have their own shape). */
const MAX_SLOPE = 0.35;
/** Steepest ground a dell keeps a pond on. */
const POND_SLOPE = 0.08;

/** One landform on the land. */
export interface Landform {
  readonly def: LandformDef;
  readonly shape: LandformShape;
  /** Centre, metres. */
  readonly x: number;
  readonly z: number;
  /** Its axis (long shapes run along it, a gully downhill): unit vector. */
  readonly ax: number;
  readonly az: number;
  /** Half length along the axis and half width across it, metres. */
  readonly L: number;
  readonly W: number;
  /** Rise (or depth), metres. */
  readonly H: number;
  /** Farthest it shapes the land from its centre, metres. */
  readonly reach: number;
  /** Its own seed (wobble, rock). */
  readonly seed: number;
  /** A dell's pond: its water level, metres (NaN: no pond). */
  readonly pond: number;
}

interface Cell {
  readonly forms: readonly Landform[];
  /** Height of the middle band of relief here, metres. */
  readonly relief: number;
}

/** A town's ground, which keeps landforms away (a town levels its ground). */
export interface FormFree {
  readonly x: number;
  readonly z: number;
  /** No landform's middle within this radius, metres. */
  readonly r: number;
  /** Out to here the town eases the landforms away: no pond within it (it would stand on level ground). */
  readonly calm: number;
}

const EMPTY: Cell = { forms: [], relief: 0 };
const CACHE = 4096;

/** A smooth hump: 1 at t = 0 down to 0 at t = 1 (flat at both ends). */
const bump = (t: number): number => (t >= 1 ? 0 : (1 - t * t) * (1 - t * t));

export class Landforms {
  private readonly cells = new Map<number, Cell>();
  private readonly seed: number;
  private readonly band: Noise;
  private readonly defs: readonly LandformDef[];
  /** The forms of the 3 x 3 cells round the last asked cell, and the relief of those cells. */
  private near: Landform[] = [];
  private nearI = NaN;
  private nearJ = NaN;
  private readonly nearRelief = new Float32Array(9);
  private free: readonly FormFree[] = [];

  /**
   * `wet(x, z)`: whether a river runs near (no pond is kept there: the river's banks would spill it).
   */
  constructor(seed: number, readonly world: WorldShape, readonly skeleton: Skeleton, private readonly wet: (x: number, z: number) => boolean = () => false) {
    this.seed = deriveSeed(seed, 'landforms');
    this.band = new Noise(deriveSeed(seed, 'landforms', 'band'));
    this.defs = world.landforms ?? [];
  }

  /** The towns' grounds, which hold no landforms. Forgets the landforms placed so far. */
  setFree(free: readonly FormFree[]): void {
    this.free = free;
    this.cells.clear();
    this.nearI = NaN;
  }

  /** How much the landforms and the middle relief raise (or lower) the ground at (x, z), metres. */
  offset(x: number, z: number): number {
    this.gatherNear(x, z);
    let h = this.reliefAt(x, z);
    const forms = this.near;
    for (let k = 0; k < forms.length; k++) {
      const f = forms[k], dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz >= f.reach * f.reach) continue;
      h += shapeAt(f, dx * f.ax + dz * f.az, dz * f.ax - dx * f.az);
    }
    return h;
  }

  /** A pond's water level at (x, z) (NaN where there is none). */
  pondAt(x: number, z: number): number {
    this.gatherNear(x, z);
    for (const f of this.near) {
      if (Number.isNaN(f.pond)) continue;
      const dx = x - f.x, dz = z - f.z;
      if (dx * dx + dz * dz < f.L * f.L) return f.pond;
    }
    return NaN;
  }

  /** The landforms whose centre lies within `r` metres of (x, z). */
  within(x: number, z: number, r: number): Landform[] {
    const out: Landform[] = [];
    const i0 = Math.floor((x - r) / FORM_CELL), i1 = Math.floor((x + r) / FORM_CELL);
    const j0 = Math.floor((z - r) / FORM_CELL), j1 = Math.floor((z + r) / FORM_CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      for (const f of this.formCell(i, j).forms) if (Math.hypot(f.x - x, f.z - z) <= r) out.push(f);
    }
    return out;
  }

  /** The middle band of relief at (x, z), metres (its height eased between cell centres). */
  private reliefAt(x: number, z: number): number {
    const fx = x / FORM_CELL - 0.5, fz = z / FORM_CELL - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    // Cells i, i+1 and j, j+1 lie within the 3 x 3 round the sample's cell (nearI - 1 .. nearI + 1).
    const a = (di: number, dj: number) => this.nearRelief[(j + dj - this.nearJ + 1) * 3 + (i + di - this.nearI + 1)];
    const amp = (a(0, 0) * (1 - tx) + a(1, 0) * tx) * (1 - tz) + (a(0, 1) * (1 - tx) + a(1, 1) * tx) * tz;
    if (amp <= 0) return 0;
    return amp * this.band.fbm2(x / 380 + 17.7, z / 380 - 4.1, 2);
  }

  private gatherNear(x: number, z: number): void {
    const i = Math.floor(x / FORM_CELL), j = Math.floor(z / FORM_CELL);
    if (i === this.nearI && j === this.nearJ) return;
    const near: Landform[] = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const c = this.formCell(i + di, j + dj);
      for (const f of c.forms) near.push(f);
      this.nearRelief[(dj + 1) * 3 + di + 1] = c.relief;
    }
    this.near = near;
    this.nearI = i;
    this.nearJ = j;
  }

  private formCell(i: number, j: number): Cell {
    const key = i + j * 2_097_152;
    let c = this.cells.get(key);
    if (!c) {
      if (this.cells.size >= CACHE) this.cells.clear();
      c = this.place(i, j);
      this.cells.set(key, c);
    }
    return c;
  }

  /** The landforms of cell (i, j), from the seed and the biome at the cell's centre. */
  private place(i: number, j: number): Cell {
    if (!this.defs.length) return EMPTY;
    const sk = this.skeleton;
    const b = sk.sample((i + 0.5) * FORM_CELL, (j + 0.5) * FORM_CELL).biome;
    const mix = b >= 0 ? this.world.biomes[b].landforms : undefined;
    if (!mix) return EMPTY;
    const rng = new Rng(hash2i(this.seed, i, j));
    const defs = this.defs.filter((d) => (mix.mix[d.id] ?? 0) > 0);
    const expected = (mix.perKm2 * FORM_CELL * FORM_CELL) / 1e6;
    const n = Math.floor(expected) + (rng.float() < expected % 1 ? 1 : 0);
    const forms: Landform[] = [], start = rng.int(0, 3);
    for (let k = 0; k < n && defs.length; k++) {
      const def = rng.weighted(defs, (d) => mix.mix[d.id] ?? 0);
      // Spread over the cell's quarters in turn, so no stretch of a walk goes long without one.
      const q = (k + start) % 4;
      const x = (i + ((q & 1) + rng.float()) / 2) * FORM_CELL, z = (j + ((q >> 1) + rng.float()) / 2) * FORM_CELL;
      const size = rng.range(def.size[0], def.size[1]), width = def.width ? rng.range(def.width[0], def.width[1]) : size;
      const H = rng.range(def.height[0], def.height[1]), turn = rng.float() * Math.PI * 2, roll = rng.float(), fseed = rng.nextU32();
      // Not on the beach, not on a cliff, not in a town.
      const e = sk.elevation(x, z), shore = sk.lastShore;
      if (e < 4 || shore < 250) continue;
      const gx = (sk.elevation(x + 20, z) - e) / 20, gz = (sk.elevation(x, z + 20) - e) / 20, slope = Math.hypot(gx, gz);
      if (slope > MAX_SLOPE) continue;
      const L = Math.min(size / 2, FORM_CELL * 0.98), W = Math.min(width / 2, L);
      const reach = Math.min(FORM_CELL * 0.98, reachOf(def.shape, L, W));
      if (this.free.some((t) => Math.hypot(x - t.x, z - t.z) < t.r + reach * 0.5)) continue;
      // Gullies, ravines and dry valleys run downhill; the rest lie any way.
      const downhill = (def.shape === 'gully' || def.shape === 'ravine' || def.shape === 'dryValley') && slope > 1e-3;
      const ax = downhill ? -gx / slope : Math.cos(turn), az = downhill ? -gz / slope : Math.sin(turn);
      // A pond only where the dell is whole: off the shore, away from towns and running water.
      const pondable = def.shape === 'dell' && slope < POND_SLOPE && roll < (def.pond ?? 0) && (e > 12 || shore > 700)
        && !this.free.some((t) => Math.hypot(x - t.x, z - t.z) < t.calm + L * 1.4) && !this.wet(x, z);
      const pond = pondable ? this.pondLevel(x, z, L, H, b) : NaN;
      forms.push({ def, shape: def.shape, x, z, ax, az, L, W, H, reach, seed: fseed, pond });
    }
    return { forms, relief: mix.relief };
  }

  /**
   * A dell's pond level: below the lowest point of its rim (by a margin for the terrain's small bumps), at
   * most half way up from its floor. NaN if that leaves too little water.
   */
  private pondLevel(x: number, z: number, L: number, H: number, biome: number): number {
    const landAt = (px: number, pz: number) => this.skeleton.elevation(px, pz) + this.bandAt(px, pz, biome);
    let rim = Infinity;
    for (let a = 0; a < 12; a++) rim = Math.min(rim, landAt(x + Math.cos((a * Math.PI) / 6) * L * 1.1, z + Math.sin((a * Math.PI) / 6) * L * 1.1));
    const floor = landAt(x, z) - H, level = Math.min(rim - 1.4, floor + H * 0.55);
    return level - floor > 0.8 ? level : NaN;
  }

  /** The middle relief at a point from one biome's mix (for a pond's level, set when it is placed). */
  private bandAt(x: number, z: number, biome: number): number {
    const amp = this.world.biomes[biome].landforms?.relief ?? 0;
    return amp * this.band.fbm2(x / 380 + 17.7, z / 380 - 4.1, 2);
  }
}

/** How far from its centre a landform shapes the land. */
function reachOf(shape: LandformShape, L: number, W: number): number {
  switch (shape) {
    case 'knoll': case 'tor': case 'dell': case 'sinkhole': return Math.hypot(L, W) * 1.15;
    case 'scarp': return Math.hypot(L, W * 3 + L * 0.1);
    case 'bank': case 'sunkenLane': return Math.hypot(L, W * 2.2 + L * 0.08);
    case 'boulders': case 'erratic': return 0;
    default: return Math.hypot(L, W * 1.05 + L * 0.16);
  }
}

/** A landform's rise at (u along its axis, v across it), metres. */
export function shapeAt(f: Landform, u: number, v: number): number {
  const { L, W, H } = f;
  const ph = (f.seed % 1000) / 159.2; // a phase from the seed, 0..2π
  switch (f.shape) {
    case 'knoll': case 'tor': case 'dell': case 'sinkhole': {
      // Round, with a lobed outline so no two look turned out of one mould.
      // (Three lobes and two, from the direction's sine and cosine; each form lies turned its own way.)
      const d = Math.sqrt(u * u + v * v) || 1, c = u / d, sn = v / d;
      const r = Math.sqrt((u / L) * (u / L) + (v / W) * (v / W)) * (1 + 0.14 * (3 * sn - 4 * sn * sn * sn) + 0.14 * sn * c);
      if (f.shape === 'knoll') return H * bump(r);
      // A tor's crown stands up steeply where the rock breaks through.
      if (f.shape === 'tor') return H * (0.55 * bump(r) + 0.45 * smoothstep(0.5, 0.22, r));
      // A dell is a dish; a sinkhole drops steeply to a narrow floor.
      if (f.shape === 'dell') return -H * bump(r);
      return -H * smoothstep(1, 0.35, r);
    }
    case 'gully': case 'ravine': case 'dryValley': {
      // Cut along the axis (downhill), deepening as it goes, the line wandering a little.
      const t = u / L;
      if (t <= -1 || t >= 1) return 0;
      const w = v + L * (0.12 * Math.sin(t * 2.6 + ph) + 0.04 * Math.sin(t * 7.1 - ph));
      const across = Math.abs(w) / W;
      const along = smoothstep(-1, -0.55, t) * smoothstep(1, 0.75, t) * (0.45 + 0.55 * (t + 1) / 2);
      // A gully is a V, a ravine has steep walls and a narrow floor, a dry valley is a broad U.
      const profile = f.shape === 'gully' ? clamp(1 - across, 0, 1) ** 1.4 : f.shape === 'ravine' ? smoothstep(1, 0.3, across) : bump(across);
      return -H * profile * along;
    }
    case 'ridge': {
      const t = u / L;
      if (t <= -1 || t >= 1) return 0;
      const w = v + L * (0.1 * Math.sin(t * 2.2 + ph) + 0.03 * Math.sin(t * 6.3 - ph));
      return H * clamp(1 - Math.abs(w) / W, 0, 1) ** 1.5 * bump(Math.abs(t));
    }
    case 'scarp': {
      // A step in the land: a short steep face, the ground behind it higher; it fades out at both ends.
      const t = u / L;
      if (t <= -1 || t >= 1) return 0;
      const w = v + L * 0.1 * Math.sin(t * 2 + ph);
      const step = smoothstep(-W * 0.3, W * 0.3, w) - 0.5;
      return H * step * smoothstep(1, 0.65, Math.abs(t)) * (1 - smoothstep(W, W * 3, Math.abs(w)));
    }
    case 'bank': case 'sunkenLane': {
      const t = u / L;
      if (t <= -1 || t >= 1) return 0;
      const w = Math.abs(v + L * 0.08 * Math.sin(t * 1.7 + ph)) / W;
      const along = smoothstep(1, 0.85, Math.abs(t));
      // An old bank is a low wall of earth; a sunken lane is worn down between two low banks.
      if (f.shape === 'bank') return H * bump(w) * along;
      return (-H * smoothstep(1, 0.5, w) + 0.35 * H * bump(Math.abs(w - 1.4) / 0.6)) * along;
    }
    default:
      return 0;
  }
}
