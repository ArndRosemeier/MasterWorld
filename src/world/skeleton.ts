/**
 * The world skeleton (docs/design/masterworld-plan.md 5.2): the low-frequency fields of the whole world as
 * pure functions of position. Unbounded, deterministic, cheap: continents and seas, mountain ranges,
 * temperature, moisture and biomes. Regions (5.5) add detail on top; the far horizon is drawn from this alone.
 *
 * Units are metres. x runs east, z runs south (three.js), y is up; the sea surface is y = 0.
 */
import { Noise, deriveSeed, clamp, smoothstep, lerp, smax } from '@futuremagic/core';
import type { BiomeDef, WorldShape } from '../setting/contract';

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
    let h = smoothstep(0, SHORE.band, c) * smoothstep(0, 60, s) * land + r * peaks * (w.mountainHeight - amp);
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
 * so rock, sand and grass meet along smooth lines on the mesh. Low cliffs come out as steep banks.
 */
export function cliffProfile(u: number, top: number, steep: number): number {
  if (u <= 0 || top <= 0) return 0;
  const L1 = Math.max(10, 0.4 * top), L2 = Math.max(7, 0.3 * top);
  const S = Math.min(steep, top / ((L1 + L2) / 2));
  const h1 = (S * L1) / 2, Lm = (top - h1 - (S * L2) / 2) / S;
  if (u < L1) return (S * u * u) / (2 * L1);
  if (u < L1 + Lm) return h1 + S * (u - L1);
  const v = Math.max(0, L2 - (u - L1 - Lm));
  return top - (S * v * v) / (2 * L2);
}

/** Height scale of the hills for a relief (0 gentle … 1 rugged). */
const amplitude = (relief: number, drama: number): number => lerp(45, 560, relief) * (0.55 + 0.45 * drama);

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
