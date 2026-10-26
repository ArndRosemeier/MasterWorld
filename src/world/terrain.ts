/**
 * The terrain surface: the skeleton's elevation plus local detail (the height field layer of 5.6). Pure,
 * deterministic, evaluated in workers for meshes and on the main thread for walking.
 */
import { Noise, deriveSeed, lerp, smin, smoothstep } from '@futuremagic/core';
import { SHORE, Skeleton, emptySample } from './skeleton';
import { FALL_LIP, HYDRO, Hydrology, emptyWater, type HydroOptions, type WaterHere } from './hydro';
import type { SettingModule } from '../setting/contract';
import { ArchField, BLEND } from './volumes';
import type { DecisionLog, HoldDecision, TownDecision } from './decisions';
import { holdBare, holdGround } from './hold';
import type { Field } from '@futuremagic/settlement';
import { Town, TownGround } from './town';

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

  private fields: ArchField[] = [];
  private townSpots: { d: TownDecision; level: number }[] = [];
  private townList: Town[] | null = null;
  private holdList: HoldDecision[] = [];
  private readonly probe = emptySample();
  private readonly wet = { river: 0, lake: 0 };

  /**
   * Build what the decision log says stands on the land (plan 5.1): rock volumes and towns. The land
   * under a town calms down (less small relief, a level market), so call this before anything is built
   * from the heights.
   */
  settle(log: DecisionLog): void {
    this.fields = [];
    this.townSpots = [];
    this.townList = null;
    this.holdList = [];
    for (const d of log) {
      if (d.kind === 'volume') this.fields.push(new ArchField(this, d.site));
      else if (d.kind === 'town') this.townSpots.push({ d, level: this.skeleton.elevation(d.x, d.z) });
      else if (d.kind === 'hold') this.holdList.push(d);
    }
  }

  /** The biome at a point (an index into `biomes`; -1 under the sea). */
  biomeAt(x: number, z: number): number {
    return this.skeleton.sample(x, z, this.probe).biome;
  }

  /** The rock volumes standing on this land. */
  get volumes(): readonly ArchField[] {
    return this.fields;
  }

  /** The peoples' holds on this land (plan 11.6): their gates and courts. */
  get holds(): readonly HoldDecision[] {
    return this.holdList;
  }

  /** The towns standing on this land (planned when first asked for). */
  get towns(): readonly Town[] {
    if (!this.townList) this.townList = this.townSpots.map(({ d }) => new Town(d, this));
    return this.townList;
  }

  /** What a town has made of the ground here (TownGround.None outside every town). */
  townGround(x: number, z: number): TownGround {
    for (let i = 0; i < this.townSpots.length; i++) {
      const town = this.towns[i];
      if (!town.near(x, z, 0)) continue;
      const g = town.groundAt(x, z);
      if (g !== TownGround.None) return g;
    }
    return TownGround.None;
  }

  /** The field at a point (its crop and rows), or null. */
  fieldAt(x: number, z: number): Field | null {
    for (const town of this.towns) if (town.near(x, z, 0)) { const f = town.fieldAt(x, z); if (f) return f; }
    return null;
  }

  /** Depth of open water at a point (> 0: sea, lake or river), roughly: for keeping things out of it. */
  waterDepth(x: number, z: number): number {
    const h = this.height(x, z);
    if (h < 0.3) return 0.3 - h;
    const w = this.clearOfWater(x, z, h, this.wet);
    return Math.max(-w.river, 0.3 - w.lake, 0);
  }

  /**
   * The solid ground near a volume as a signed distance (positive in air): its rock blended into the
   * height field, as it is meshed. Null away from every volume (the height field alone holds there).
   */
  rockSurface(x: number, y: number, z: number): number | null {
    for (const f of this.volumes) if (f.inBounds(x, y, z)) return smin(y - this.height(x, z), f.at(x, y, z), BLEND);
    return null;
  }

  /** Whether rock of a volume, or a hold's gate and court, stands on the ground here (`h` the ground height): nothing grows there. */
  rockAt(x: number, z: number, h: number): boolean {
    for (const f of this.volumes) if (f.inBounds(x, h + 0.3, z) && f.at(x, h + 0.3, z) < 0.8) return true;
    for (const d of this.holdList) if (holdBare(d, x, z)) return true;
    return false;
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

  /** Ground height above the sea surface, metres: the land's own, as the holds shape it. */
  height(x: number, z: number): number {
    let h = this.landHeight(x, z);
    for (let i = 0; i < this.holdList.length; i++) h = holdGround(this.holdList[i], x, z, h);
    return h;
  }

  private landHeight(x: number, z: number): number {
    const base = this.skeleton.elevation(x, z), shore = this.skeleton.lastShore;
    // The swash: low swells along the waterline (beach cusps), so the water's edge curves gently instead of
    // running dead straight; they die out on dry sand and in deeper water.
    const swash = Math.abs(base) < 2.5 ? (1 - smoothstep(0.6, 2.5, Math.abs(base))) * this.detail.fbm2(x / 22 - 40.1, z / 22 + 8.8, 2) * 0.15 : 0;
    const e = base + swash;
    if (e <= 0) return e;
    // Small undulations everywhere, rougher where the land is high; none on the beach, so it runs smoothly
    // into the water instead of the waterline wandering over bumps.
    let calm = Math.max(smoothstep(SHORE.berm + 0.6, SHORE.berm + 5, e), smoothstep(350, 700, shore));
    let level = e;
    for (const s of this.townSpots) {
      // A town calms its ground: most of the small relief goes, and the market is level.
      const d = Math.hypot(x - s.d.x, z - s.d.z), R = s.d.radius;
      if (d > R * 1.8) continue;
      const market = smoothstep(40, 22, d);
      calm *= (1 - 0.75 * smoothstep(R * 1.8, R * 1.1, d)) * (1 - market);
      level = lerp(level, s.level, market);
    }
    if (calm <= 0) return this.shapeByWater(x, z, level);
    const rough = 1 + Math.min(4, e / 600);
    const d = this.detail.fbm2(x / 70, z / 70, 3) * 2.2 + this.detail.fbm2(x / 9 + 71.3, z / 9 - 12.9, 2) * 0.25;
    return this.shapeByWater(x, z, Math.max(Math.min(level, 0.5), level + d * rough * calm));
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
