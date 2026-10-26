/**
 * The hamlets and villages the VGM founds as the hero walks (plan B3), in the game: each is a town of its
 * size from the one planner (AG settlement planTown), planned in a terrain worker and drawn like the
 * start town (render/town/TownView.ts, the building shader: nothing new compiles). The terrain shader's
 * town masks (streets, yards, fields) move to the settlement the hero is nearest. Each has its own
 * people (sim/townLife.ts, the start town's routines), living while the hero is near, and their own
 * words (talk/townTalk.ts): what they have heard of the places the VGM promised from there.
 */
import type { Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { deriveSeed } from '@futuremagic/core';
import type { SettingModule } from '../setting/contract';
import { TownLife, type TownWeather } from '../sim/townLife';
import { talkCellar, townTalk, type TownTalk, type TownTalkSave } from '../talk/townTalk';
import { keptOf } from '../vgm/leads';
import { dungeonOf, type Decision, type DecisionLog, type RegionDecision } from '../world/decisions';
import type { Terrain } from '../world/terrain';
import type { Town } from '../world/town';
import type { TerrainJobs } from '../workers/pool';
import type { RoadWork } from './roads';
import { TownView } from '../render/town/TownView';
import { moveTownMasks, townMaskSize } from '../render/materials/townGround';

export interface SettlementsHost {
  readonly stage: Stage;
  readonly terrain: Terrain;
  readonly land: TerrainJobs;
  readonly roads: RoadWork;
  /** The start town's id (drawn, walked and masked by the game itself), if there is one. */
  readonly home: string | null;
  /** Whether the town masks may move (none without a start town: there is no texture to move into). */
  readonly masks: boolean;
  readonly setting: SettingModule;
  readonly seed: number;
  /** Game hours since the start. */
  hours(): number;
  /** The decision log now. */
  log(): DecisionLog;
  /** What each settlement's people knew when the game was saved (by town id). */
  readonly saved?: Readonly<Record<string, TownTalkSave>>;
  /** A settlement's words were made: the game sets how its people take the hero (standing, plan 11.6). */
  talked?(words: TownTalk): void;
}

/** A settlement's people: their lives, and (once the hero first comes near) their words. */
export interface SettlementFolk {
  readonly town: Town;
  readonly life: TownLife;
  words: TownTalk | null;
}

/** People live (their walks, their day) while the hero is within this of the settlement's edge (m). */
const LIVE = 400;
/** The hero is in a settlement (talks there, its leads) within this of its edge (m). */
const IN = 60;

/** Seconds between two looks for the nearest settlement. */
const LOOK = 1;

export class Settlements {
  private readonly views = new Map<string, TownView>();
  private readonly folk = new Map<string, SettlementFolk>();
  /** The town whose masks the terrain shader reads, and one on its way in. */
  private masked: string | null;
  private moving = false;
  private clock = 0;

  constructor(private readonly h: SettlementsHost) {
    this.masked = h.home;
  }

  /** The settlements standing already (a loaded game's, founded before the views existed): drawn. */
  async standing(cam: Vector3): Promise<void> {
    await Promise.all(this.others().map((t) => this.raise(t.decision.id, cam, false)));
  }

  /** A hamlet or village founded while playing (already in the log): planned in a worker, then drawn. */
  async found(d: RegionDecision, cam: Vector3): Promise<void> {
    let view: TownView | null = null;
    await this.h.roads.found(d, async () => {
      view = new TownView(this.h.stage, this.h.land);
      return view.build(d.id, cam, true);
    });
    if (view) { this.views.set(d.id, view); this.peopleFor(d.id); }
  }

  private async raise(id: string, cam: Vector3, plan: boolean): Promise<void> {
    if (this.views.has(id)) return;
    const view = new TownView(this.h.stage, this.h.land);
    this.views.set(id, view);
    await view.build(id, cam, plan);
    this.peopleFor(id);
  }

  /** A drawn settlement's people move in (its plan stands on the main thread by now). */
  private peopleFor(id: string): void {
    const town = this.h.terrain.town(id);
    if (!town || this.folk.has(id)) return;
    this.folk.set(id, { town, life: new TownLife(town.plan, seedOf(town, this.h.seed), this.h.hours(), this.h.setting.routines), words: null });
  }

  /** The settlement the hero at (x, z) is in (within IN of its edge), with its people's words made; else null. */
  folkAt(x: number, z: number): SettlementFolk | null {
    let best: SettlementFolk | null = null, low = IN;
    for (const f of this.folk.values()) {
      const d = Math.hypot(x - f.town.decision.x, z - f.town.decision.z) - f.town.decision.radius;
      if (d < low) { low = d; best = f; }
    }
    if (best) this.wordsOf(best);
    return best;
  }

  /** A settlement's words, made the first time they are asked for. */
  wordsOf(f: SettlementFolk): TownTalk {
    if (f.words) return f.words;
    const h = this.h, log = h.log(), id = f.town.decision.id;
    const words = townTalk(seedOf(f.town, h.seed), h.setting, f.town, f.life.persons, log, h.saved?.[id]).talk;
    for (const k of keptOf(log)) words.hush(k);
    h.talked?.(words);
    return (f.words = words);
  }

  /** A promise the VGM made (already in the log): the settlement it was made from hears of it, if its people talk yet. */
  promised(d: Decision): void {
    for (const f of this.folk.values()) {
      if (!f.words) continue;
      const c = talkCellar(d, this.h.setting, f.town, f.life.persons, this.h.log());
      if (c) f.words.add(c);
    }
  }

  /** The settlement whose words know of promise `id` (null: none here, or none talks yet). */
  wordsFor(id: string): SettlementFolk | null {
    const log = this.h.log(), town = dungeonOf(log, log.find((x) => x.id === id))?.town;
    return (town && this.folk.get(town)) || null;
  }

  /** Every settlement's people near the hero, living (`focus`: where detail matters). */
  live(dt: number, focus: { x: number; z: number }, weather: TownWeather): TownLife[] {
    const out: TownLife[] = [];
    for (const f of this.folk.values()) {
      if (Math.hypot(focus.x - f.town.decision.x, focus.z - f.town.decision.z) - f.town.decision.radius > LIVE) continue;
      f.life.focus = focus;
      f.life.step(dt, this.h.hours(), weather);
      out.push(f.life);
    }
    return out;
  }

  /** Is a body of radius `r` at (x, z), coming from (ax, az), stepping into somebody out in a settlement? */
  touches(x: number, z: number, r: number, ax: number, az: number): boolean {
    for (const f of this.folk.values()) if (f.town.near(x, z, r) && f.life.touches(x, z, r, ax, az)) return true;
    return false;
  }

  /** What each settlement's people know, for the save (those who never talked: nothing to keep). */
  talksSaved(): Record<string, TownTalkSave> {
    const out: Record<string, TownTalkSave> = {};
    for (const [id, f] of this.folk) if (f.words) out[id] = f.words.save();
    return out;
  }

  /** The towns besides the start's. */
  private others(): readonly Town[] {
    return this.h.terrain.towns.filter((t) => t.decision.id !== this.h.home);
  }

  /** Each frame: near or far meshes, and now and then the masks move to the nearest settlement. */
  tick(dt: number, cam: Vector3): void {
    for (const v of this.views.values()) v.update(cam);
    if ((this.clock += dt) < LOOK || !this.h.masks || this.moving) return;
    this.clock = 0;
    let best: Town | null = null, low = Infinity;
    for (const t of this.h.terrain.towns) {
      if (t.decision.id !== this.h.home && !this.views.has(t.decision.id)) continue;
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

  /** Does a body of radius `r` at (x, z) touch a settlement's walls or fences? */
  solid(x: number, z: number, r: number): boolean {
    for (const t of this.others()) if (t.solid(x, z, r)) return true;
    return false;
  }

  /** The HUD's part. */
  get tally(): string {
    let folk = 0;
    for (const f of this.folk.values()) folk += f.life.agents.length;
    return `settlements ${this.views.size} (${folk} folk)`;
  }
}

/** A settlement's own seed (its decision's; older logs: from the world's). */
const seedOf = (t: Town, seed: number): number => t.decision.seed ?? deriveSeed(seed, 'settlement', t.decision.id);
