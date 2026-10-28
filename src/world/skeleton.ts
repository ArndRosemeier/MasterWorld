/**
 * The world skeleton (docs/design/masterworld-plan.md 5.2): the low-frequency fields of the whole world as
 * pure functions of position. Unbounded, deterministic, cheap: continents and seas, mountain ranges,
 * temperature, moisture and biomes. Regions (5.5) add detail on top; the far horizon is drawn from this alone.
 *
 * Units are metres. x runs east, z runs south (three.js), y is up; the sea surface is y = 0.
 */
import { Noise, deriveSeed, clamp, smoothstep, lerp, smax, hash2i, hashToFloat } from '@futuremagic/core';
import type { BiomeDef, LandscapeKindDef, MesaDef, WorldShape } from '../setting/contract';

/** Everything the skeleton knows about one point. */
export interface SkeletonSample {
  /** Height above the sea surface (negative under water). */
  elevation: number;
  /** -1 deep ocean … 0 coast … 1 deep inland. */
  continent: number;
  /** 0..1, how much a mountain range rises here. */
  range: number;
  /** Mean annual temperature, °C. */
  temperature: number;
  /** 0 dry … 1 wet. */
  moisture: number;
  /** Index into `shape.biomes`, or -1 under the sea. */
  biome: number;
}

const LAPSE = 0.0065; // °C per metre of height

/**
 * The shore: the ground runs through the waterline at one slope, levelling off to a berm on land and a
 * shelf in the sea. Where hill country meets the sea, cliffs rise behind a narrow strip of beach.
 */
export const SHORE = {
  /** Rise per metre at the waterline (both sides, so the beach runs smoothly into the sea floor). */
  slope: 0.07,
  /** Height the beach levels off at, metres. */
  berm: 1.8,
  /** Depth the shallows level off at before the deep sea, metres. */
  shelf: 6,
  /** Continent value inside which the shore is shaped (beyond it the land is as it was). */
  band: 0.12,
};

/** Kinds of country (D55): stretches round seed points this far apart (metres), so 5-20 km across. */
const KIND_CELL = 11_000;
/** Width of the border between two kinds (metres): one blends into the other over it. */
const KIND_BORDER = 1600;
/** Slope of a pass up a mesa wall (rise per metre): a ramp of fallen rock, walked at a steady climb. */
const PASS_SLOPE = 0.6;
/** A mesa wall's talus apron and rounded crest, as shares of its height: it stands sheer between. */
const MESA_APRON = 0.28, MESA_CREST = 0.1;
/** How far in from a wall's foot a pass reaches the top (metres). */
const PASS_TOP = 50;
/** The open country when the setting names no kinds. */
const OPEN: readonly LandscapeKindDef[] = [{ id: 'open', share: 1 }];

export class Skeleton {
  private readonly continentNoise: Noise;
  private readonly warpNoise: Noise;
  private readonly rangeNoise: Noise;
  private readonly peakNoise: Noise;
  private readonly hillNoise: Noise;
  private readonly climateNoise: Noise;
  private readonly shoreNoise: Noise;
  /** Continent value at which the coast lies, set so that `landFraction` of the surface is land. */
  private readonly coast: number;
  private readonly kindNoise: Noise;
  private readonly mesaNoise: Noise;
  private readonly kindSeed: number;
  /** The kinds of country, and the mesa country's shape (if any kind is one). */
  readonly kinds: readonly LandscapeKindDef[];
  private readonly mesa: MesaDef | null;
  /** Each kind's weight at the last `kindWeights` point. */
  private readonly weights: Float64Array;
  /** The kinds' shares summed. */
  private readonly shares: number;

  constructor(readonly seed: number, readonly shape: WorldShape) {
    this.continentNoise = new Noise(deriveSeed(seed, 'skeleton', 'continent'));
    this.warpNoise = new Noise(deriveSeed(seed, 'skeleton', 'warp'));
    this.rangeNoise = new Noise(deriveSeed(seed, 'skeleton', 'range'));
    this.peakNoise = new Noise(deriveSeed(seed, 'skeleton', 'peak'));
    this.hillNoise = new Noise(deriveSeed(seed, 'skeleton', 'hill'));
    this.climateNoise = new Noise(deriveSeed(seed, 'skeleton', 'climate'));
    this.shoreNoise = new Noise(deriveSeed(seed, 'skeleton', 'shore'));
    // fbm of simplex noise is roughly normal around 0 with sd ≈ 0.25: the coast threshold follows from the land share.
    this.coast = (0.5 - shape.landFraction) * 0.5;
    this.kindNoise = new Noise(deriveSeed(seed, 'skeleton', 'kind'));
    this.mesaNoise = new Noise(deriveSeed(seed, 'skeleton', 'mesa'));
    this.kindSeed = deriveSeed(seed, 'skeleton', 'kinds');
    this.kinds = shape.kinds?.length ? shape.kinds : OPEN;
    this.mesa = this.kinds.find((k) => k.mesa)?.mesa ?? null;
    this.weights = new Float64Array(this.kinds.length);
    this.shares = this.kinds.reduce((a, k) => a + k.share, 0);
  }

  /** The kind of country a stretch round a seed point is (by share, from the seed). */
  private kindOfCell(i: number, j: number): number {
    let roll = hashToFloat(Math.imul(hash2i(this.kindSeed, i, j), 0x9e3779b1)) * this.shares;
    for (let k = 0; k < this.kinds.length; k++) if ((roll -= this.kinds[k].share) < 0) return k;
    return 0;
  }

  /**
   * How much of each kind of country (index into `kinds`) is at (x, z), summing to 1: one inside a stretch,
   * blended over a border KIND_BORDER wide. The stretches are the cells round seed points KIND_CELL apart,
   * their borders wandering. The array is reused: read it before the next call.
   */
  kindWeights(x: number, z: number): Float64Array {
    const w = this.weights;
    w.fill(0);
    if (this.kinds.length === 1) { w[0] = 1; return w; }
    const n = this.kindNoise;
    const px = (x + n.fbm2(x / 7000 + 1.7, z / 7000 - 4.2, 2) * 2600) / KIND_CELL;
    const pz = (z + n.fbm2(x / 7000 - 6.3, z / 7000 + 2.8, 2) * 2600) / KIND_CELL;
    const xi = Math.floor(px), zi = Math.floor(pz);
    const ds = near9, ks = kinds9;
    let f1 = Infinity, m = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = xi + di, j = zi + dj, h = hash2i(this.kindSeed, i, j);
      const dx = i + 0.15 + 0.7 * hashToFloat(h) - px, dz = j + 0.15 + 0.7 * hashToFloat(Math.imul(h, 2654435761)) - pz;
      const d = Math.sqrt(dx * dx + dz * dz) * KIND_CELL;
      ds[m] = d;
      ks[m++] = this.kindOfCell(i, j);
      f1 = Math.min(f1, d);
    }
    let sum = 0;
    for (let k = 0; k < 9; k++) {
      // Seed points about as near as the nearest share the point (d - f1 is about twice the way to their border).
      const a = Math.max(0, 1 - (ds[k] - f1) / (2 * KIND_BORDER));
      w[ks[k]] += a * a;
      sum += a * a;
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    return w;
  }

  /** The kind of country at (x, z) (index into `kinds`): the one with the most weight. */
  kindAt(x: number, z: number): number {
    const w = this.kindWeights(x, z);
    let best = 0;
    for (let k = 1; k < w.length; k++) if (w[k] > w[best]) best = k;
    return best;
  }

  /** How much of mesa country is at (x, z), 0..1. */
  mesaWeight(x: number, z: number): number {
    if (!this.mesa) return 0;
    const w = this.kindWeights(x, z);
    let k = 0;
    for (let i = 0; i < w.length; i++) if (this.kinds[i].mesa) k += w[i];
    return k;
  }

  /**
   * Of the last `mesaRise` point (or `elevation`, `sample` point): metres in from the wall's foot (negative out on the valley floor, -Infinity
   * without mesa country), the plateau's full height there, how much of a pass it is (0..1), and the rise there
   * (`elevation` and `sample` only).
   */
  readonly lastMesa = { u: -Infinity, tall: 0, pass: 0, rise: 0 };
  /** The plateaus' share of the last `landAt` (their rise there, weighted by how much mesa country it is). */
  private lastRise = 0;

  /**
   * The rise of mesa country's plateaus over its valley floors at (x, z), metres (0 on the floors), and where
   * the wall is (`mesaWall`). A plateau is where a low-frequency field stands over a threshold (so the
   * plateaus cover `cover` of the land); its edge's distance comes from the field over its slope (as the
   * shore's does), wandering in buttresses and bays. The wall rises in up to `tiers` steps with a bench
   * between, each step the sea cliff's profile (a talus apron, the face, a rounded crest). Along a share of
   * the edge (`passes`) a ramp of fallen rock climbs it instead.
   */
  mesaRise(x: number, z: number): number {
    const m = this.mesa, at = this.lastMesa;
    at.u = -Infinity; at.tall = 0; at.pass = 0;
    if (!m) return 0;
    const n = this.mesaNoise, s = 1 / m.size;
    const wx = n.fbm2(x / 1100 + 3.3, z / 1100 - 1.4, 1) * 160, wz = n.fbm2(x / 1100 - 7.6, z / 1100 + 5.2, 1) * 160;
    const field = (px: number, pz: number) => n.fbm2(px * s, pz * s, 3, 2, 0.5);
    const D = 40, f = field(x + wx, z + wz), t = (0.5 - m.cover) * 0.5;
    // Quick out: far down in a valley (some hundreds of metres from any wall or pass).
    if (f < t - 0.25) return 0;
    const gx = (field(x + wx + D, z + wz) - f) / D, gz = (field(x + wx, z + wz + D) - f) / D;
    const g = Math.max(1e-7, Math.hypot(gx, gz));
    // Bays and buttresses (hundreds of metres), alcoves and spurs (tens).
    const edge = n.fbm2(x / 320 + 9.1, z / 320 - 2.2, 2) * 26 + n.fbm2(x / 60 - 4.7, z / 60 + 8.3, 2) * 4;
    const u1 = (at.u = (f - t) / g + edge);
    // A pass: a ramp of fallen rock heaped against the wall from the valley floor, reaching the top a little
    // in from the wall's foot (so it ends on the plateau even where that is narrow).
    const tp = (0.5 - m.passes) * 0.5;
    // Read where the wall's foot is, straight across from here: a pass runs straight up, the same all along it.
    const fx = x - (gx / g) * u1, fz = z - (gz / g) * u1;
    const p = (at.pass = smoothstep(tp, tp + 0.06, n.fbm2(fx / 420 + 1.1, fz / 420 - 9.4, 2)));
    // Quick out: well down in a valley.
    if (u1 < -60 - (p > 0 ? m.height[1] / PASS_SLOPE : 0)) return 0;
    const tall = at.tall = lerp(m.height[0], m.height[1], smoothstep(-0.4, 0.4, n.fbm2(x / 6500 + 2.4, z / 6500 + 7.1, 1)));
    const steep = lerp(m.steep[0], m.steep[1], smoothstep(-0.4, 0.4, n.fbm2(x / 700 - 1.8, z / 700 + 3.6, 1)));
    let wall: number;
    if (m.tiers >= 2 && tall >= 70) {
      // A bench part way up: wide in places, gone in others (the two steps make one wall there).
      const bench = lerp(0, 240, smoothstep(-0.3, 0.4, n.fbm2(x / 1800 + 6.6, z / 1800 - 3.9, 1)));
      // Each step at least 30 m (a lower one would be a bank, walked up).
      const split = clamp(lerp(0.35, 0.65, smoothstep(-0.4, 0.4, n.fbm2(x / 2500 - 5.5, z / 2500 + 0.4, 1))), 30 / tall, 1 - 30 / tall);
      const u2 = u1 - bench + n.fbm2(x / 160 + 2.7, z / 160 - 6.1, 2) * 20;
      wall = cliffProfile(u1, tall * split, steep, MESA_APRON, MESA_CREST) + cliffProfile(u2, tall * (1 - split), steep, MESA_APRON, MESA_CREST);
    } else wall = cliffProfile(u1, tall, steep, MESA_APRON, MESA_CREST);
    if (p <= 0) return wall;
    const ramp = clamp((u1 - PASS_TOP + tall / PASS_SLOPE) * PASS_SLOPE, 0, tall);
    return lerp(wall, ramp, p);
  }

  /** Continent field: -1 deep ocean … 0 coast … 1 deep inland. */
  continent(x: number, z: number): number {
    const s = 1 / this.shape.continentSpacing;
    // Domain warp: coasts with bays and peninsulas instead of round blobs.
    const wx = this.warpNoise.fbm2(x * s * 2, z * s * 2, 3) * 0.35;
    const wz = this.warpNoise.fbm2(x * s * 2 + 41.3, z * s * 2 - 17.9, 3) * 0.35;
    const c = this.continentNoise.fbm2(x * s + wx, z * s + wz, 6, 2.1, 0.52) - this.coast;
    return clamp(c * 4, -1, 1);
  }

  /** 0..1: where mountain ranges rise. Long chains, more of them inland than at the coast. */
  range(x: number, z: number, continent: number): number {
    const s = 1 / this.shape.rangeSpacing;
    const chain = this.rangeNoise.ridged2(x * s, z * s, 3, 2, 0.5, 2.2);
    return smoothstep(0.42, 0.8, chain) * smoothstep(0.02, 0.25, continent);
  }

  elevation(x: number, z: number): number {
    const c = this.continent(x, z);
    return this.heightAt(x, z, c, this.range(x, z, c));
  }

  /**
   * Metres from the shoreline (positive inland) of the last `elevation` or `sample` call, ±Infinity away
   * from the coast. The terrain reads it to keep beaches smooth.
   */
  lastShore = Infinity;

  /**
   * Distance to the shoreline, metres, positive inland: the continent value over its slope (the field is
   * smooth over hundreds of metres), shifted a little so the shore has coves and points.
   */
  shoreDistance(x: number, z: number, c: number): number {
    if (c > SHORE.band) return Infinity;
    if (c < -SHORE.band) return -Infinity;
    const D = 25;
    const g = Math.hypot(this.continent(x + D, z) - c, this.continent(x, z + D) - c) / D;
    const coves = this.shoreNoise.fbm2(x / 420 + 3.1, z / 420 - 8.4, 3) * 28;
    return c / Math.max(g, 1e-7) + coves;
  }

  private heightAt(x: number, z: number, c: number, r: number): number {
    const w = this.shape;
    const s = (this.lastShore = this.shoreDistance(x, z, c));
    this.lastMesa.u = -Infinity;
    this.lastMesa.tall = 0;
    this.lastMesa.rise = 0;
    this.lastRise = 0;
    // The shore profile: one slope through the waterline, a berm on land, a shelf in the sea.
    let floor = s >= 0 ? SHORE.berm * (1 - Math.exp((-s * SHORE.slope) / SHORE.berm)) : -SHORE.shelf * (1 - Math.exp((s * SHORE.slope) / SHORE.shelf));
    // Well inland the shore no longer has a say (it hands over to the land as it is beyond the band).
    const inland = s > 0 ? Math.max(smoothstep(300, 600, s), smoothstep(SHORE.band * 0.65, SHORE.band, c)) : 0;
    floor = lerp(floor, 1, inland);
    if (c <= 0) {
      // Then the deep sea.
      const d = smoothstep(0, 0.35, -c);
      const sea = floor - lerp(0, w.seaDepth - SHORE.shelf, d * d);
      return s > 0 ? Math.max(sea, this.cliff(x, z, s, this.landAt(x, z, c, this.relief(x, z)))) : sea;
    }
    const relief = this.relief(x, z);
    const amp = amplitude(relief, w.drama);
    const land = this.landAt(x, z, c, relief);
    // Mountains: ridged peaks inside the ranges, sharper with drama.
    const peaks = r > 0 ? this.peakNoise.ridgedTerrain2(x / 14_000, z / 14_000, 6, 1.4 + w.drama * 0.8) : 0;
    // The land comes down to the coast, flattening out into the beach right at the water.
    // The plateaus of mesa country keep their height until a few hundred metres from the coast (where the
    // land is high, the sea cliffs take over from there).
    const rise = this.lastRise;
    let h = smoothstep(0, 60, s) * (smoothstep(0, SHORE.band, c) * (land - rise) + rise * smoothstep(80, 500, s)) + r * peaks * (w.mountainHeight - amp);
    // High ground gets broad steps too (benches and cliffs below the peaks).
    if (w.drama > 0 && h > 600) {
      const step = 160;
      const terraced = Math.floor(h / step) * step + step * smoothstep(0.25, 0.75, (h % step) / step);
      h = lerp(h, terraced, w.drama * 0.45 * smoothstep(600, 1200, h));
    }
    if (s === Infinity) return Math.max(1, h);
    // The land rises behind the beach (softly blended in, but not at the waterline itself).
    const soft = 1.2 * smoothstep(0, 40, s) * (1 - inland);
    h = soft > 1e-3 ? smax(floor, h, soft) : Math.max(floor, h);
    return Math.max(h, this.cliff(x, z, s, land));
  }

  /** Relief amplitude: some country is gentle, some rugged, changing over tens of kilometres. */
  private relief(x: number, z: number): number {
    return smoothstep(-0.35, 0.55, this.hillNoise.fbm2(x / 40_000 + 5.3, z / 40_000 - 2.1, 3));
  }

  /** The land before it meets the coast and the mountains: lowlands, ridged hills, terraces. */
  private landAt(x: number, z: number, c: number, relief: number): number {
    const w = this.shape;
    const amp = amplitude(relief, w.drama);
    // Lowlands: broad swells, ridged hills with real valleys between them, and rolling ground.
    const plains = 20 + 120 * c + this.hillNoise.fbm2(x / 12_000, z / 12_000, 3) * 60;
    const ridges = this.hillNoise.ridgedTerrain2(x / 5200 + 13.1, z / 5200 - 7.7, 5, 1.2 + w.drama * 0.6);
    const rolling = this.hillNoise.fbm2(x / 1500 - 3.7, z / 1500 + 8.2, 3) * 0.15;
    let land = plains + amp * (ridges + rolling);
    // Drama: escarpments and mesas: terraces cut into rugged hill country.
    if (w.drama > 0) {
      const step = 70;
      const terraced = Math.floor(land / step) * step + step * smoothstep(0.3, 0.7, (land % step) / step);
      land = lerp(land, terraced, w.drama * 0.7 * smoothstep(0.45, 0.8, relief));
    }
    // Mesa country: broad, gentler valley floors and the plateaus over them.
    const k = this.mesa ? this.mesaWeight(x, z) : 0;
    this.lastRise = 0;
    if (k > 0) {
      const floor = plains + Math.min(amp, 160) * (0.3 * ridges + 0.6 * rolling);
      this.lastMesa.rise = this.mesaRise(x, z);
      this.lastRise = k * this.lastMesa.rise;
      land = lerp(land, floor, k) + this.lastRise;
    }
    return land;
  }

  /**
   * Sea cliffs: along some stretches of coast where the land behind is high, it rises steeply behind a
   * narrow beach instead of sloping down to it. The foot wanders (buttresses, coves), the height tapers
   * in and out along the coast. 0 where there is no cliff.
   */
  private cliff(x: number, z: number, s: number, land: number): number {
    if (s < 0 || land < 8 || this.shape.drama <= 0) return 0;
    const n = this.shoreNoise;
    // Cliffs come and go along the coast within a few hundred metres, so few low half-cliffs stand on beaches.
    const k = smoothstep(0.18, 0.28, n.fbm2(x / 5000 - 17.3, z / 5000 + 4.6, 2)) * smoothstep(8, 16, land) * Math.min(1, this.shape.drama * 1.5);
    if (k <= 0) return 0;
    // Height: set over kilometres, varied by headlands and dips over a few hundred metres.
    const tall = lerp(12, 65, smoothstep(-0.45, 0.45, n.fbm2(x / 9000 + 2.2, z / 9000 + 9.9, 2)));
    const top = Math.min(land, tall * (1 + 0.45 * n.fbm2(x / 300 - 6.1, z / 300 + 1.3, 2) + 0.12 * n.fbm2(x / 45 + 4.4, z / 45 - 2.6, 2))) * k;
    // The foot wanders (buttresses and coves), and some stretches lean back more than others.
    const foot = Math.max(3, 11 + n.fbm2(x / 70 + 0.7, z / 70 - 5.5, 2) * 5 + n.fbm2(x / 240 - 3.3, z / 240 + 2.9, 2) * 8 + n.fbm2(x / 24 - 9.1, z / 24 + 7.7, 2) * 1.8);
    const steep = lerp(1.7, 3, smoothstep(-0.4, 0.4, n.fbm2(x / 600 + 8.8, z / 600, 2)));
    // Gullies: narrow clefts every few dozen metres, cut deeper into the top of the face than at its foot.
    const cleft = clamp(1 - Math.abs(n.fbm2(x / 38 + 1.9, z / 38 - 4.2, 2)) * 3.2, 0, 1) ** 2;
    const depth = cleft * (4 + 0.25 * top);
    const u = s - foot;
    return cliffProfile(u - depth * (0.25 + 0.75 * smoothstep(0, 0.9 * top + 12, u)), top, steep);
  }


  temperature(x: number, z: number, elevation: number): number {
    const w = this.shape;
    const t = w.baseTemperature + z * 0.001 * w.northCooling + this.climateNoise.fbm2(x / 400_000, z / 400_000, 3) * 4;
    return t - Math.max(0, elevation) * LAPSE;
  }

  moisture(x: number, z: number, continent: number): number {
    // Wetter near the coasts, drier deep inland, with broad wet and dry belts.
    const belts = this.climateNoise.fbm2(x / 250_000 + 91.7, z / 250_000 - 33.1, 4) * 0.45;
    return clamp(0.7 - continent * 0.3 + belts, 0, 1);
  }

  sample(x: number, z: number, out: SkeletonSample = emptySample()): SkeletonSample {
    const c = this.continent(x, z);
    const r = this.range(x, z, c);
    const e = this.heightAt(x, z, c, r);
    out.continent = c;
    out.range = r;
    out.elevation = e;
    out.temperature = this.temperature(x, z, e);
    out.moisture = this.moisture(x, z, c);
    out.biome = e <= 0 ? -1 : pickBiome(this.shape.biomes, out.temperature, out.moisture, e);
    return out;
  }
}

/**
 * A cliff's height `u` metres in from its foot: a concave apron of scree easing into the face, the face at
 * `steep` (rise per metre), and a rounded crest. The slope changes over metres, not between two vertices,
 * so rock, sand and grass meet along smooth lines on the mesh. Low cliffs come out as steep banks. `apron`
 * and `crest`: their widths as shares of the height (a mesa's wall stands sheer, on a shorter apron).
 */
export function cliffProfile(u: number, top: number, steep: number, apron = 0.4, crest = 0.3): number {
  if (u <= 0 || top <= 0) return 0;
  const L1 = Math.max(apron * 25, apron * top), L2 = Math.max((crest * 70) / 3, crest * top);
  const S = Math.min(steep, top / ((L1 + L2) / 2));
  const h1 = (S * L1) / 2, Lm = (top - h1 - (S * L2) / 2) / S;
  if (u < L1) return (S * u * u) / (2 * L1);
  if (u < L1 + Lm) return h1 + S * (u - L1);
  const v = Math.max(0, L2 - (u - L1 - Lm));
  return top - (S * v * v) / (2 * L2);
}

/** Height scale of the hills for a relief (0 gentle … 1 rugged). */
const amplitude = (relief: number, drama: number): number => lerp(45, 560, relief) * (0.55 + 0.45 * drama);

const near9 = new Float64Array(9);
const kinds9 = new Int32Array(9);

export function emptySample(): SkeletonSample {
  return { elevation: 0, continent: 0, range: 0, temperature: 0, moisture: 0, biome: -1 };
}

const outside = (v: number, r: readonly [number, number]): number => (v < r[0] ? r[0] - v : v > r[1] ? v - r[1] : 0);

/** The first biome whose ranges all hold, else the one closest to fitting. */
export function pickBiome(biomes: readonly BiomeDef[], temperature: number, moisture: number, elevation: number): number {
  let best = 0, bestMiss = Infinity;
  for (let i = 0; i < biomes.length; i++) {
    const b = biomes[i];
    const miss = outside(temperature, b.temperature) / 10 + outside(moisture, b.moisture) + (b.elevation ? outside(elevation, b.elevation) / 1000 : 0);
    if (miss === 0) return i;
    if (miss < bestMiss) { bestMiss = miss; best = i; }
  }
  return best;
}
