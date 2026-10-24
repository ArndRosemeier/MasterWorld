/**
 * The world skeleton (docs/design/masterworld-plan.md 5.2): the low-frequency fields of the whole world as
 * pure functions of position. Unbounded, deterministic, cheap: continents and seas, mountain ranges,
 * temperature, moisture and biomes. Regions (5.5) add detail on top; the far horizon is drawn from this alone.
 *
 * Units are metres. x runs east, z runs south (three.js), y is up; the sea surface is y = 0.
 */
import { Noise, deriveSeed, clamp, smoothstep, lerp } from '@futuremagic/core';
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

export class Skeleton {
  private readonly continentNoise: Noise;
  private readonly warpNoise: Noise;
  private readonly rangeNoise: Noise;
  private readonly peakNoise: Noise;
  private readonly hillNoise: Noise;
  private readonly climateNoise: Noise;
  /** Continent value at which the coast lies, set so that `landFraction` of the surface is land. */
  private readonly coast: number;

  constructor(readonly seed: number, readonly shape: WorldShape) {
    this.continentNoise = new Noise(deriveSeed(seed, 'skeleton', 'continent'));
    this.warpNoise = new Noise(deriveSeed(seed, 'skeleton', 'warp'));
    this.rangeNoise = new Noise(deriveSeed(seed, 'skeleton', 'range'));
    this.peakNoise = new Noise(deriveSeed(seed, 'skeleton', 'peak'));
    this.hillNoise = new Noise(deriveSeed(seed, 'skeleton', 'hill'));
    this.climateNoise = new Noise(deriveSeed(seed, 'skeleton', 'climate'));
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

  private heightAt(x: number, z: number, c: number, r: number): number {
    const w = this.shape;
    if (c <= 0) {
      // Shelf, then the deep sea.
      const d = smoothstep(0, 0.35, -c);
      return -lerp(2, w.seaDepth, d * d);
    }
    const coastRamp = smoothstep(0, 0.12, c);
    // Lowlands: broad rolling ground and hills.
    const plains = 25 + 140 * c + this.hillNoise.fbm2(x / 9000, z / 9000, 4) * 90;
    const hills = Math.max(0, this.hillNoise.fbm2(x / 2600 + 13.1, z / 2600 - 7.7, 4)) * 160;
    // Mountains: ridged peaks inside the ranges, sharper with drama.
    const peaks = this.peakNoise.ridgedTerrain2(x / 14000, z / 14000, 6, 1.4 + w.drama * 0.8);
    let h = coastRamp * (plains + hills) + r * peaks * w.mountainHeight;
    // Drama: lift the uplands and cut terraces into the high ground (mesas, steps).
    if (w.drama > 0 && h > 300) {
      const step = 140;
      const terraced = Math.floor(h / step) * step + step * smoothstep(0.25, 0.75, (h % step) / step);
      h = lerp(h, terraced, w.drama * 0.5 * smoothstep(300, 900, h));
    }
    return Math.max(1, h);
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
