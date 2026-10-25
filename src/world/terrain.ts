/**
 * The terrain surface: the skeleton's elevation plus local detail (the height field layer of 5.6). Pure,
 * deterministic, evaluated in workers for meshes and on the main thread for walking.
 */
import { Noise, deriveSeed, lerp, smoothstep } from '@futuremagic/core';
import { Skeleton } from './skeleton';
import { FALL_LIP, HYDRO, Hydrology, emptyWater, type HydroOptions, type WaterHere } from './hydro';
import type { SettingModule } from '../setting/contract';

export class Terrain {
  readonly skeleton: Skeleton;
  private readonly detail: Noise;
  readonly hydro: Hydrology;
  /** The setting's biomes (skeleton samples index them). */
  readonly biomes: SettingModule['world']['biomes'];
  private readonly here: WaterHere = emptyWater();

  /** `hydro`: tile sizes for drainage (tests use small tiles). */
  constructor(readonly seed: number, readonly setting: SettingModule, hydro: HydroOptions = HYDRO) {
    this.skeleton = new Skeleton(seed, setting.world);
    this.detail = new Noise(deriveSeed(seed, 'terrain', 'detail'));
    this.hydro = new Hydrology(this.skeleton, hydro);
    this.biomes = setting.world.biomes;
  }

  /**
   * How far a spot of ground `h` high is from open water: metres beyond the nearest river's edge, and
   * metres above the lake it lies by (Infinity where there is none). For what grows near the water.
   */
  clearOfWater(x: number, z: number, h: number, out: { river: number; lake: number }): { river: number; lake: number } {
    const w = this.hydro.query(x, z, this.here);
    out.river = w.river ? w.dist - w.half : Infinity;
    out.lake = Number.isNaN(w.lake) ? Infinity : h - w.lake;
    return out;
  }

  /** Ground height above the sea surface, metres. */
  height(x: number, z: number): number {
    const e = this.skeleton.elevation(x, z);
    if (e <= 0) return e;
    // Small undulations everywhere, rougher where the land is high.
    const rough = 1 + Math.min(4, e / 600);
    const d = this.detail.fbm2(x / 70, z / 70, 3) * 2.2 + this.detail.fbm2(x / 9 + 71.3, z / 9 - 12.9, 2) * 0.25;
    return this.shapeByWater(x, z, Math.max(0.5, e + d * rough));
  }

  /**
   * Rivers shape their valleys: inside the channel the ground drops to a rounded bed, along the banks it
   * lies a little above the water and rises gently, and further out it blends back into the land (lowering
   * hills into a valley, or lifting hollows into banks so the river stays in its bed). Gorges through rims
   * come out as steep walls. Lakes need no shaping: their basins are already below the level.
   */
  private shapeByWater(x: number, z: number, h: number): number {
    const w = this.hydro.query(x, z, this.here);
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
        const levee = bankLevel(w) + 0.4 + Math.min((dist - half) * 0.12, 1.2);
        shaped = Math.max(h, lerp(levee, h, smoothstep(half + 30, (half + valley) / 2 + 30, dist)));
      }
    }
    // At the mouth the sea takes over: only lower, never build banks out into the water.
    return level < 1 ? Math.min(h, shaped) : shaped;
  }
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
