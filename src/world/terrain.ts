/**
 * The terrain surface: the skeleton's elevation plus local detail (the height field layer of 5.6). Pure,
 * deterministic, evaluated in workers for meshes and on the main thread for walking.
 */
import { Noise, deriveSeed, lerp, smin, smoothstep } from '@futuremagic/core';
import { SHORE, Skeleton, emptySample } from './skeleton';
import { BROOKS, HYDRO, Hydrology, emptyWater, inChannel, shapeByWater, type HydroOptions, type WaterHere } from './hydro';
import type { SettingModule } from '../setting/contract';
import { ArchField, BLEND } from './volumes';
import { settlementOf, type Decision, type DecisionLog, type HoldDecision, type RoadDecision, type TownDecision } from './decisions';
import { holdBare, holdGround } from './hold';
import { RETREAT_CLEARING, clearingOf, type Clearing } from './dungeon/site';
import { RoadNet } from './roads';
import { bridgeBank } from './bridges';
import type { Field, TownPlan } from '@futuremagic/settlement';
import { Town, TownGround } from './town';

export class Terrain {
  readonly skeleton: Skeleton;
  private readonly detail: Noise;
  readonly hydro: Hydrology;
  /** The setting's biomes (skeleton samples index them). */
  readonly biomes: SettingModule['world']['biomes'];
  private readonly here: WaterHere = emptyWater();
  private readonly brook: WaterHere = emptyWater();
  private readonly bank = (): number => bridgeBank(this.brook);

  /** `hydro`, `brooks`: tile sizes for drainage (tests use small tiles; null: no brooks). */
  constructor(readonly seed: number, readonly setting: SettingModule, hydro: HydroOptions = HYDRO, brooks: HydroOptions | null = BROOKS) {
    this.skeleton = new Skeleton(seed, setting.world);
    this.detail = new Noise(deriveSeed(seed, 'terrain', 'detail'));
    this.hydro = new Hydrology(this.skeleton, hydro, brooks);
    this.biomes = setting.world.biomes;
  }

  private fields: ArchField[] = [];
  private townSpots: { d: TownDecision; level: number }[] = [];
  private townList: Town[] | null = null;
  private holdList: HoldDecision[] = [];
  private readonly probe = emptySample();
  private readonly wet = { river: 0, lake: 0 };
  private roadNet = new RoadNet();
  private readonly clearingMap = new Map<string, Clearing>();

  /**
   * Build what the decision log says stands on the land (plan 5.1): rock volumes and towns (the start's,
   * and the hamlets and villages the VGM founded in regions it opened). The land
   * under a town calms down (less small relief, a level market), so call this before anything is built
   * from the heights.
   */
  settle(log: DecisionLog): void {
    this.fields = [];
    this.townSpots = [];
    this.townList = null;
    this.roadNet = new RoadNet();
    this.holdList = [];
    for (const d of log) {
      if (d.kind === 'volume') this.fields.push(new ArchField(this, d.site));
      else if (d.kind === 'town') this.townSpots.push({ d, level: this.skeleton.elevation(d.x, d.z) });
      else if (d.kind === 'hold') this.holdList.push(d);
    }
    this.clearingMap.clear();
    // Roads, clearings, and the settlements founded in regions (after the towns of the log, in its order).
    this.settleMore(log);
  }

  /**
   * Lay a road decided while the game runs (plan 7): the ground under it is levelled from now on. Whatever
   * was built from the old heights near it (meshes, plants) is for the caller to build again.
   */
  addRoad(d: RoadDecision): void {
    this.roadNet.insert(d);
  }

  /**
   * Decisions made while the game runs that change the land, in workers as on the main thread (they reach
   * the workers as a `decisions` job): roads, and the clearings round places out on the land (dungeons, the
   * teachers' towers and the places of opened regions). Others leave
   * the land as it is.
   */
  settleMore(ds: readonly Decision[]): void {
    for (const d of ds) {
      if (d.kind === 'road') this.addRoad(d);
      else if (d.kind === 'dungeon' && d.site) {
        const c = clearingOf(this.setting.dungeons[d.template]?.form.clearing, d.site);
        if (c) this.clearingMap.set(d.id, c);
      } else if (d.kind === 'retreat') {
        // A teacher's tower (C3) stands in the open like a ruined tower's.
        const c = clearingOf(RETREAT_CLEARING, d);
        if (c) this.clearingMap.set(d.id, c);
      } else if (d.kind === 'region' && d.site) {
        // A place the VGM opened as the hero walked: a settlement is a town of its size (its fields clear
        // the wood); another place keeps its footprint and what was cleared round it free of trees.
        const fills = this.setting.regions?.fills ?? [], town = settlementOf(d, fills);
        if (town) { this.addTown(town); continue; }
        const f = fills.find((k) => k.id === d.fill), { x, z, r } = d.site;
        if (f && f.place !== 'none') this.clearingMap.set(d.id, { x, z, r: r + (f.clearing ?? 0) });
      }
    }
  }

  /**
   * A town founded while the game runs (a region's hamlet or village): its ground calms from now on.
   * `plan`: its plan, if a worker planned it (planning takes too long for a frame); else planned when asked.
   * Settling it twice changes nothing.
   */
  addTown(d: TownDecision, plan?: TownPlan): void {
    if (this.townSpots.some((s) => s.d.id === d.id)) return;
    this.townSpots.push({ d, level: this.skeleton.elevation(d.x, d.z) });
    if (this.townList) this.townList.push(new Town(d, this, plan));
  }

  /** The town of this id (the start's or a settlement founded since), if it stands on this land. */
  town(id: string): Town | undefined {
    const i = this.townSpots.findIndex((s) => s.d.id === id);
    return i < 0 ? undefined : this.towns[i];
  }

  /** Ground kept free of trees round the places out on the land (by the place's id). */
  get clearings(): ReadonlyMap<string, Clearing> {
    return this.clearingMap;
  }

  /** How far (x, z) lies outside the nearest clearing, metres (negative inside; Infinity with none). */
  fromClearing(x: number, z: number): number {
    let best = Infinity;
    for (const c of this.clearingMap.values()) best = Math.min(best, Math.hypot(x - c.x, z - c.z) - c.r);
    return best;
  }

  /** The roads on this land. */
  get roads(): RoadNet {
    return this.roadNet;
  }

  /** The biome at a point (an index into `biomes`; -1 under the sea). */
  biomeAt(x: number, z: number): number {
    return this.skeleton.sample(x, z, this.probe).biome;
  }

  /** The id of the biome at a point (null under the sea). */
  biomeIdAt(x: number, z: number): string | null {
    const b = this.biomeAt(x, z);
    return b < 0 ? null : this.biomes[b].id;
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

  /** Depth of open water at a point (> 0: sea, lake or river), roughly: for keeping things out of it. `h`: its height, when known. */
  waterDepth(x: number, z: number, h = this.height(x, z)): number {
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

  /** How steep the ground is at (x, z), roughly: the larger rise per metre over `d` metres east or south (`h`: its height, when known). */
  steepness(x: number, z: number, d: number, h = this.height(x, z)): number {
    return Math.max(Math.abs(this.height(x + d, z) - h), Math.abs(this.height(x, z + d) - h)) / d;
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
    if (calm > 0) {
      const rough = 1 + Math.min(4, e / 600);
      const d = this.detail.fbm2(x / 70, z / 70, 3) * 2.2 + this.detail.fbm2(x / 9 + 71.3, z / 9 - 12.9, 2) * 0.25;
      level = Math.max(Math.min(level, 0.5), level + d * rough * calm);
    }
    // Rivers shape their valleys, then brooks theirs in the land the rivers left (their levels come from it, D50),
    // each blending out to the edge of its own valley, so where two meet the land stays whole.
    const r = this.hydro.riverAt(x, z, this.here);
    level = shapeByWater(this.hydro.brookAt(x, z, this.brook), shapeByWater(r, level));
    // A road levels its bed and shoulders, over a brook (it runs under the road, walled as a bridge:
    // world/bridges.ts); a river still cuts its ford.
    if (!this.roadNet.empty) {
      level = this.roadNet.level(x, z, level, this.brook.river ? this.bank : undefined);
      if (inChannel(r)) level = Math.min(level, shapeByWater(r, level));
    }
    return level;
  }
}
