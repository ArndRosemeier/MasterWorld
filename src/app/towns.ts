/**
 * Every town in the game (plan B3, B3a): the start town and each hamlet and village the VGM founds as the
 * hero walks, all alike. Each is a Township (game/township.ts: its people, words, merchants and herds)
 * and a TownView (its buildings, meshed in a terrain worker, drawn with the one building shader). The
 * game asks this registry for the town the hero is in; nothing in the game holds a town of its own.
 * The terrain shader's town masks (streets, yards, fields) move to the town the hero is nearest.
 */
import type { Vector3 } from 'three/webgpu';
import type { TownBuilding } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import type { Agent, TownLife, TownWeather } from '../sim/townLife';
import type { Herds } from '../sim/livestock';
import { Township, type TownshipContext, type TownshipSave } from '../game/township';
import type { RegionDecision } from '../world/decisions';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import type { TerrainJobs } from '../workers/pool';
import type { RoadWork } from './roads';
import { TownView } from '../render/town/TownView';
import { moveTownMasks, townMaskSize } from '../render/materials/townGround';

export interface TownsHost extends TownshipContext {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly land: TerrainJobs;
  readonly roads: RoadWork;
  /** Whether the town masks may move (none without a start town: there is no texture to move into). */
  readonly masks: boolean;
  /** Whether towns are drawn at all (`town=0`: their cores live, nothing is drawn). */
  readonly drawn: boolean;
  /** What each town kept when the game was saved (by town id). */
  readonly saved: Readonly<Record<string, TownshipSave>>;
  /** A town's core was made: the game sets how it ties in (how its people take the hero, its services). */
  made?(t: Township): void;
  /** A town's buildings stand (their doors light at night). */
  raised?(t: Township): void;
}

/** A building of a town, as the game opens it. */
export interface TownDoor {
  readonly town: Township;
  readonly b: TownBuilding;
}

/** People live (their walks, their day) while the hero is within this of the town's edge (m). */
const LIVE = 400;
/** The hero is in a town (talks there, hears its leads) within this of its edge (m). */
const IN = 60;
/** Seconds between two looks for the nearest town. */
const LOOK = 1;

export class Towns {
  private readonly cores = new Map<string, Township>();
  private readonly views = new Map<string, TownView>();
  /** The town whose masks the terrain shader reads. */
  private masked: string | null;
  private moving = false;
  private clock = 0;

  constructor(private readonly h: TownsHost) {
    // Every town the log has stood on the land since the start: its core now (cheap; its people's words
    // and days come when first asked for), its buildings when drawn.
    for (const t of h.terrain.towns) this.coreOf(t);
    this.masked = h.terrain.towns[0]?.decision.id ?? null;
  }

  /** The town the game started in (where a new hero steps out), if any. */
  get start(): Township | null {
    const t = this.h.terrain.towns[0];
    return t ? this.cores.get(t.decision.id) ?? null : null;
  }

  /** Every town's core, in the order they were settled. */
  get every(): readonly Township[] { return [...this.cores.values()]; }

  /** A town's core by its id. */
  get(id: string): Township | null { return this.cores.get(id) ?? null; }

  private coreOf(town: Town): Township {
    let t = this.cores.get(town.decision.id);
    if (t) return t;
    t = new Township(town, this.h, this.h.saved[town.decision.id]);
    this.cores.set(t.id, t);
    this.h.made?.(t);
    return t;
  }

  /** Draws every town that stands and is not drawn yet (at the start, and a loaded game's). */
  async standing(cam: Vector3): Promise<void> {
    await Promise.all(this.h.terrain.towns.map((t) => this.raise(t.decision.id, cam, false)));
  }

  /** A hamlet or village founded while playing (already in the log): planned in a worker, then drawn. */
  async found(d: RegionDecision, cam: Vector3): Promise<void> {
    let view: TownView | null = null;
    await this.h.roads.found(d, async () => {
      if (!this.h.drawn) return null;
      view = new TownView(this.h.stage, this.h.land);
      return view.build(d.id, cam, true);
    });
    const town = this.h.terrain.town(d.id);
    if (!town) return;
    const t = this.coreOf(town);
    if (view) { this.views.set(d.id, view); this.h.raised?.(t); }
  }

  private async raise(id: string, cam: Vector3, plan: boolean): Promise<void> {
    const town = this.h.terrain.town(id);
    if (town) this.coreOf(town);
    if (this.views.has(id) || !this.h.drawn) return;
    const view = new TownView(this.h.stage, this.h.land);
    this.views.set(id, view);
    await view.build(id, cam, plan);
    const t = this.cores.get(id);
    if (t) this.h.raised?.(t);
  }

  /** A town's buildings as drawn (null: not drawn). */
  viewOf(id: string): TownView | null { return this.views.get(id) ?? null; }

  /** The town the hero at (x, z) is in (within IN of its edge, the nearest), else null. */
  townAt(x: number, z: number): Township | null {
    const t = this.nearest(x, z), d = t?.town.decision;
    return t && d && Math.hypot(x - d.x, z - d.z) - d.radius < IN ? t : null;
  }

  /** The town nearest (x, z), however far (null: no town stands). */
  nearest(x: number, z: number): Township | null {
    let best: Township | null = null, low = Infinity;
    for (const t of this.cores.values()) {
      const d = t.town.decision, e = Math.hypot(x - d.x, z - d.z) - d.radius;
      if (e < low) { low = e; best = t; }
    }
    return best;
  }

  /** The town whose people `a` is one of (null: none living). */
  townOf(a: Agent): Township | null {
    for (const t of this.cores.values()) if (t.living && t.life.agents.includes(a)) return t;
    return null;
  }

  /** The towns whose ground reaches within `margin` of (x, z). */
  *near(x: number, z: number, margin: number): Iterable<Township> {
    for (const t of this.cores.values()) if (t.town.near(x, z, margin)) yield t;
  }

  /** The buildings whose door is within `r` of (x, z), in every town there. */
  *doorsNear(x: number, z: number, r: number): Iterable<TownDoor> {
    for (const t of this.near(x, z, r)) {
      for (const b of t.town.plan.buildings) if (Math.abs(b.door[0] - x) <= r && Math.abs(b.door[1] - z) <= r) yield { town: t, b };
    }
  }

  /** Each frame: near or far meshes, and now and then the masks move to the nearest town. */
  tick(dt: number, cam: Vector3): void {
    for (const v of this.views.values()) v.update(cam);
    if ((this.clock += dt) < LOOK || !this.h.masks || this.moving) return;
    this.clock = 0;
    let best: Town | null = null, low = Infinity;
    for (const t of this.h.terrain.towns) {
      if (!this.views.has(t.decision.id)) continue;
      const d = Math.hypot(cam.x - t.decision.x, cam.z - t.decision.z) - t.decision.radius;
      if (d < low) { low = d; best = t; }
    }
    if (!best || best.decision.id === this.masked) return;
    const t = best, [w, h] = townMaskSize();
    this.moving = true;
    void this.h.land.townMask(t.decision.id, w, h).then((data) => {
      moveTownMasks(t.x0, t.z0, data);
      this.masked = t.decision.id;
    }).finally(() => { this.moving = false; });
  }

  /** Every town's people near `focus`, living (detail where `focus` is); those are drawn. */
  live(dt: number, focus: { x: number; z: number }, weather: TownWeather): TownLife[] {
    const out: TownLife[] = [];
    for (const t of this.near(focus.x, focus.z, LIVE)) {
      const life = t.life;
      life.focus = focus;
      life.step(dt, this.h.hours(), weather);
      out.push(life);
    }
    return out;
  }

  /** The animals of every town near (x, z), grazing; those are drawn. */
  graze(dt: number, x: number, z: number): Herds[] {
    const out: Herds[] = [];
    for (const t of this.near(x, z, LIVE)) { const h = t.herds; if (h) { h.step(dt); out.push(h); } }
    return out;
  }

  /** Does a body of radius `r` at (x, z) touch a town's walls or fences (`open`: the building drawn open, which is walked in)? */
  solid(x: number, z: number, r: number, open?: TownDoor | null): boolean {
    for (const t of this.near(x, z, r + 1)) if (t.town.solid(x, z, r, open?.town === t ? open.b.id : undefined)) return true;
    return false;
  }

  /** The steps and porches before the doors at (x, z) (null: none). */
  stand(x: number, z: number): number | null {
    let best: number | null = null;
    for (const t of this.near(x, z, 2)) { const h = t.town.stand(x, z); if (h !== null && (best === null || h > best)) best = h; }
    return best;
  }

  /** Is a body of radius `r` at (x, z), coming from (ax, az), stepping into somebody out in a town? */
  touches(x: number, z: number, r: number, ax: number, az: number): boolean {
    for (const t of this.near(x, z, r + 1)) if (t.living && t.life.touches(x, z, r, ax, az)) return true;
    return false;
  }

  /** What every town keeps, for the save. */
  toSave(): Record<string, TownshipSave> {
    const out: Record<string, TownshipSave> = {};
    for (const [id, t] of this.cores) { const s = t.toSave(); if (s.talk || s.market) out[id] = s; }
    return out;
  }

  /** The HUD's part. */
  get tally(): string {
    let folk = 0;
    for (const t of this.cores.values()) if (t.living) folk += t.life.agents.length;
    return `towns ${this.views.size} (${folk} folk)`;
  }
}
