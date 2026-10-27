/**
 * Going into a building and out again (D38, in place): as one comes up to a door, that one building is
 * drawn open where it stands (HouseView): its door open, every storey inside as the outside shows it,
 * stairs, windows one looks out of. One walks in and out with no fade; the building shuts again once one
 * has walked away. Inside, the sky's light comes in through the openings, a lamp burns under the ceiling
 * of the storey one is on (reaching about the room: no shadows, which would build shaders for everyone it
 * lit) and the eye adapts. The sun that comes in is thrown about the room (game/roomLight.ts): its
 * value eases as the sun moves and is gone at night.
 */
import { HATCH_RUNG, HATCH_RUNG_IN, HATCH_SHAFT, hatchSides, type InteriorFixture, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import { openHouse, type OpenHouse } from '../world/townMesh';
import { houseWalk, type HouseWalk } from '../game/interiorWorld';
import { guildSigns } from '../game/guilds';
import type { HouseView } from '../render/town/HouseView';
import type { SkyView } from '../render/sky';
import type { PointLight } from 'three/webgpu';
import type { Placed } from '../render/folk/FolkView';
import { roomCast } from '../sim/roomCast';
import { RoomFlow } from '../sim/roomFlow';
import type { TownView } from '../render/town/TownView';
import { houseKey } from '../world/town';
import { roomBounce, roomSun, type RoomSun } from '../game/roomLight';
import { ROOM_LIGHT } from '../render/materials/building';
import type { Player } from './player';
import type { TownDoor } from './towns';
import type { CellarVisit } from './cellarVisit';
import type { HatchWay } from './hatchClimb';
import type { Ladder } from '@futuremagic/figure';
import { Vector3 } from 'three/webgpu';

/** Races who stand on a step behind a counter, and its height (m; the counter is 1.05 m, made for men). */
const SMALL = new Set(['halfling', 'dwarf']);
const SERVE_STEP = 0.3;
/** A building opens as one comes this near its door (m), and shuts once one is this far from it, outside. */
const OPEN_AT = 7;
const SHUT_AT = 14;
/** How fast the room's thrown-about light follows the sun (per second): the eye takes a moment too. */
const BOUNCE_EASE = 2;
/** Pushing this long (s) on a stair without getting anywhere: put off it (a body wedged under a low edge). */
const STUCK_FOR = 2;
/** Houses kept planned and drawn (their meshes) after they shut, for coming back to them. */
const KEPT = 8;
/** A hatch is used (E) from this near its middle (m). */
const HATCH_REACH = 1.6;

interface Open { door: TownDoor; b: TownBuilding; plan: InteriorPlan; walk: HouseWalk; flow: RoomFlow }

/** The towns, as the doors see them: every town's buildings open alike (plan B3a). */
export interface InteriorTowns {
  /** The buildings whose door is within `r` of (x, z), in whichever town. */
  doorsNear(x: number, z: number, r: number): Iterable<TownDoor>;
  /** A town's buildings as drawn (the open one is taken out of them meanwhile). */
  viewOf(town: string): TownView | null;
}

export class InteriorVisit {
  private open: Open | null = null;
  /** The player is within its walls. */
  private within = false;
  /** The storey the lamp burns on (-1: out). */
  private lampOn = -1;
  /** That storey's openings and surfaces, for the sun it throws about (null: out). */
  private room: RoomSun | null = null;
  /** Houses planned and drawn open (by houseKey), the latest last: being made in a worker, or made. */
  private readonly houses = new Map<string, Promise<OpenHouse>>();

  constructor(
    private readonly towns: InteriorTowns,
    /** Houses with a cellar (by houseKey): a hatch in the room, and the cellar under it (built when asked). */
    private readonly cellars: ReadonlyMap<string, () => Promise<CellarVisit>>,
    private readonly view: HouseView,
    private readonly player: Player,
    /** The room's lamp (the hero's lantern below ground: one light, always in the scene). */
    private readonly light: PointLight,
    private readonly sky: SkyView,
    /** Plans a house and draws it open (`b`, its cellar's hatch, a guild's hall, the sign): a terrain worker's job. */
    private readonly lay: (b: TownBuilding, hatch: boolean, hall: boolean, sign?: [number, number, number]) => Promise<OpenHouse> =
      async (b, hatch, hall, sign) => openHouse(b, { hatch, hall }, sign),
  ) {}

  /** The player is inside a building. */
  get inside(): boolean { return this.within; }
  /** What the open building adds to the walker's world (null: none open). */
  get walk(): HouseWalk | null { return this.open?.walk ?? null; }
  /** The building drawn open (walked into or not), and its town (null: none). */
  get opened(): TownDoor | null { return this.open?.door ?? null; }
  /** The building the player is in, and its town (null: outside). */
  get door(): TownDoor | null { return this.within ? this.open!.door : null; }

  /** The door's house planned and drawn open: made once (in a worker), kept for the last few houses. */
  private houseOf(door: TownDoor): Promise<OpenHouse> {
    const key = houseKey(door.town.id, door.b.id);
    let h = this.houses.get(key);
    if (h) this.houses.delete(key);
    else {
      // A guild house in the open (not a hidden one) is a hall: a weapon rack and a practice post (D49).
      const g = door.town.guildAt(door.b.id);
      h = this.lay(door.b, this.cellars.has(key), !!g && !g.guild.hidden, guildSigns(door.town.guilds).get(door.b.id));
      h.catch(() => this.houses.delete(key));
    }
    this.houses.set(key, h);
    if (this.houses.size > KEPT) this.houses.delete(this.houses.keys().next().value!);
    return h;
  }

  /** Draws the door's building open (shutting the last) once a worker has made it. */
  private async openUp(door: TownDoor): Promise<Open> {
    if (this.open && same(this.open.door, door)) return this.open;
    const house = await this.houseOf(door);
    // Asked again while it was being made (each frame by the door): opened by the first answer.
    if (this.open && same(this.open.door, door)) return this.open;
    this.shut();
    const b = door.b, plan = house.plan;
    this.open = { door, b, plan, walk: houseWalk(b, plan), flow: new RoomFlow(plan) };
    this.placed = null;
    await this.view.drawOpen(b, house.mesh, this.towns.viewOf(door.town.id), house.lid);
    return this.open;
  }

  /** Shut the open building (the hero went down below it). */
  shut(): void {
    if (!this.open) return;
    this.out();
    this.open = null;
    this.view.hide();
  }

  /**
   * Into the door's building at once (a night's sleep, a ride, a talk's shot): just inside its door, or (`byHatch`,
   * the shots' `room=cellar`) where one gets down into its hatch, facing it.
   */
  async enter(door: TownDoor, _now = true, byHatch = false): Promise<void> {
    const o = await this.openUp(door), b = door.b;
    const hatch = byHatch ? o.plan.fixtures.find((f) => f.kind === 'hatch') : undefined;
    if (hatch) {
      const l = this.wayDown(o, hatch).ladder;
      this.player.teleport(l.x + l.nx * 1.1, l.floor, l.z + l.nz * 1.1, Math.atan2(l.nx, l.nz));
    } else {
      const p = o.walk.floorAt(0, o.plan.storeys[0].b0 + 1.0, 0);
      this.player.teleport(p.x, p.y, p.z, Math.atan2(-b.vx, -b.vz));
    }
    this.come();
  }

  update(dt: number): void {
    this.doors(dt);
    this.stepPeople(dt);
  }

  private doors(dt: number): void {
    // Climbing through the hatch, the climb opens and shuts the house (app/hatchClimb.ts).
    if (this.player.offFoot || this.player.puppet) return;
    const w = this.player.walker, x = w.pos.x, z = w.pos.z;
    // The nearest door within reach opens (not while one is inside another).
    if (!this.within) {
      let best: TownDoor | null = null, bd = OPEN_AT;
      for (const door of this.towns.doorsNear(x, z, OPEN_AT)) {
        const d = Math.hypot(door.b.door[0] - x, door.b.door[1] - z);
        if (d < bd) { bd = d; best = door; }
      }
      if (best && !(this.open && same(this.open.door, best))) void this.openUp(best);
      else if (!best && this.open && Math.hypot(this.open.b.door[0] - x, this.open.b.door[1] - z) > SHUT_AT && !this.open.walk.within(x, z)) this.shut();
    }
    const o = this.open;
    if (!o) return;
    const inNow = o.walk.within(x, z);
    if (inNow && !this.within) this.come();
    else if (!inNow && this.within) this.out();
    if (!this.within) return;
    // The lamp on the storey one is on.
    const k = o.walk.storey(w.pos.y);
    if (k !== this.lampOn) this.lamp(k);
    this.bounce(dt);
    const [a, bb] = o.walk.frame.toRoom(x, z);
    // Wedged on a stair for a while, pushing: off it, at the end one was heading for.
    if (w.stuckFor > STUCK_FOR && !this.player.puppet) this.offStair(o, a, bb, k);
  }

  /** The hatch in the room the hero stands by (within reach, on its storey), with a cellar under it; else null. */
  hatchNear(): { way: HatchWay; below: () => Promise<CellarVisit> } | null {
    const o = this.open, w = this.player.walker;
    if (!o || !this.within) return null;
    const hatch = o.plan.fixtures.find((f) => f.kind === 'hatch'), below = this.cellars.get(houseKey(o.door.town.id, o.b.id));
    if (!hatch || !below || o.walk.storey(w.pos.y) !== hatch.storey) return null;
    const [a, b] = o.walk.frame.toRoom(w.pos.x, w.pos.z);
    if (Math.hypot(a - hatch.a, b - hatch.b) > HATCH_REACH) return null;
    return { way: this.wayDown(o, hatch), below };
  }

  /**
   * Come up into the door's building through its hatch (the climb has the hero on the ladder under it, the screen
   * dark): drawn open, stepped into; its way down (null: it has no hatch).
   */
  async arriveAbove(door: TownDoor): Promise<HatchWay | null> {
    const o = await this.openUp(door);
    const hatch = o.plan.fixtures.find((f) => f.kind === 'hatch');
    if (!hatch) return null;
    this.come();
    return this.wayDown(o, hatch);
  }

  /**
   * The way down through a hatch, as the house draws it (@futuremagic/settlement hatchSides): the ladder just inside
   * its edge on its side, facing out of the hole; the lid hinged on its side.
   */
  private wayDown(o: Open, f: InteriorFixture): HatchWay {
    const { ladder: [da, db], hinge: hs } = hatchSides(o.plan, f);
    const half = Math.abs(da) * f.w / 2 + Math.abs(db) * f.d / 2, across = Math.abs(db) * f.w / 2 + Math.abs(da) * f.d / 2;
    const fr = o.walk.frame, [cx, cz] = fr.toWorld(f.a, f.b), [ex, ez] = fr.toWorld(f.a + da, f.b + db);
    const nx = ex - cx, nz = ez - cz, floor = o.walk.floorAt(f.a, f.b, f.storey).y;
    const ladder: Ladder = { x: cx + nx * (half - HATCH_RUNG_IN), z: cz + nz * (half - HATCH_RUNG_IN), nx, nz, lo: floor - HATCH_SHAFT, hi: floor, floor, halfWidth: Math.min(0.3, across - 0.12), rung: HATCH_RUNG, rim: true };
    const [hx, hz] = fr.toWorld(f.a + hs[0], f.b + hs[1]), sx = hx - cx, sz = hz - cz, out = Math.abs(hs[0]) * f.w / 2 + Math.abs(hs[1]) * f.d / 2;
    const view = this.view, hinge = { x: cx + sx * out, y: floor, z: cz + sz * out };
    // Up from the hinge: the lid's free edge rises and swings over towards the hinge.
    const axis = new Vector3(-sx, 0, -sz).cross(new Vector3(0, 1, 0)).normalize();
    return { ladder, floor, hole: [cx, cz, half], hinge: [sx, sz], lid: (angle) => view.swingLid(hinge.x, hinge.y, hinge.z, axis, angle) };
  }

  /** Off the flight under (a, b) of storey `k`, if one stands on it: to its top or its foot, whichever one faces. */
  private offStair(o: Open, a: number, b: number, k: number): void {
    const w = this.player.walker, h = w.pos.y - o.b.floorY;
    if (Math.abs(h - o.plan.storeys[k].y) < 0.05) return;
    for (const s of o.plan.stairs) {
      const run = s.steps * s.tread, along = (a - s.a) * s.da + (b - s.b) * s.db, across = (a - s.a) * s.db - (b - s.b) * s.da;
      if (s.storey !== k || along < -0.3 || along > run + 0.3 || Math.abs(across) > s.w / 2 + 0.3) continue;
      const [fx, fz] = o.walk.frame.toWorld(s.a + s.da, s.b + s.db), [x0, z0] = o.walk.frame.toWorld(s.a, s.b);
      const up = -Math.sin(w.yaw) * (fx - x0) - Math.cos(w.yaw) * (fz - z0) > 0;
      const t = up ? run + 0.6 : -0.6, p = o.walk.floorAt(s.a + s.da * t, s.b + s.db * t, up ? k + 1 : k);
      this.player.teleport(p.x, p.y, p.z, w.yaw);
      return;
    }
  }

  /** Stepping in (the room shows where one is: no words). */
  private come(): void {
    if (this.within || !this.open) return;
    this.within = true;
    this.sky.sheltered = true;
    this.lamp(this.open.walk.storey(this.player.walker.pos.y));
  }

  /** Stepping out. */
  private out(): void {
    if (!this.within) return;
    this.within = false;
    this.sky.sheltered = false;
    this.lampOn = -1;
    this.room = null;
    ROOM_LIGHT.bounce.value.setRGB(0, 0, 0);
    this.light.intensity = 0;
    this.light.distance = 14; // the lantern's own
  }

  /** The room's lamp: under the ceiling of storey `k`, towards the back. */
  private lamp(k: number): void {
    const o = this.open!, s = o.plan.storeys[k];
    const p = o.walk.floorAt((s.a0 + s.a1) / 2, s.b1 - (s.b1 - s.b0) * 0.3, k);
    this.light.position.set(p.x, p.y + s.height - 0.35, p.z);
    // Brighter and farther-reaching in a big room (the temple's hall), never far past its walls.
    const area = (s.a1 - s.a0) * (s.b1 - s.b0), big = Math.min(3, Math.max(1, area / 12));
    this.light.intensity = 10 * big;
    this.light.distance = Math.hypot(s.a1 - s.a0, s.b1 - s.b0) * 0.6 + 1.5;
    this.lampOn = k;
    const fresh = !this.room;
    this.room = roomSun(o.b, o.plan, k);
    // Stepping in: the room's light is there at once (the eye adapts with the exposure meanwhile).
    if (fresh) this.bounce(Infinity);
  }

  /** Eases the sun thrown about the room towards what comes in now (sky.ts sets the sun first). */
  private bounce(dt: number): void {
    if (!this.room) return;
    const e = roomBounce(this.room, this.sky.sunDir, 1), sun = this.sky.sunColor, v = ROOM_LIGHT.bounce.value;
    const k = Math.min(1, dt * BOUNCE_EASE);
    v.setRGB(v.r + (sun.r * e - v.r) * k, v.g + (sun.g * e - v.g) * k, v.b + (sun.b * e - v.b) * k);
  }

  /** The people its town has in the open building now, on their spots or on their way (null: none open). */
  people(): Placed[] | null {
    return this.open ? this.placed ?? [] : null;
  }
  private placed: Placed[] | null = null;

  /** Who is in the open building this frame, and where (walking in, sitting down, walking out). */
  private stepPeople(dt: number): void {
    const o = this.open;
    if (!o) { this.placed = null; return; }
    const life = o.door.town.life;
    // Only those drawn (Actors makes adults): a child would hold a seat and show nobody.
    const cast = roomCast(life.agents, life.spots, o.b.id, o.plan, o.flow.kept);
    const places = o.flow.frame(cast, dt);
    // Those walking out wait on the doorstep until they reach it (else they would be in the street already).
    for (const a of o.flow.leaving) life.linger(a, 0.25);
    this.placed = places.map(({ agent, a, b, storey, yaw, act, seat }) => {
      const p = o.walk.floorAt(a, b, storey);
      // The small folk serve from a step behind the counter (unseen behind it): else only their hair shows.
      const step = act === 'serve' && SMALL.has(agent.person.race) ? SERVE_STEP : 0;
      return { agent, x: p.x, y: p.y + step, z: p.z, dir: o.walk.frame.dirOf(yaw), act, ...(seat !== undefined ? { seat: p.y + seat } : {}) };
    });
  }

  /** Where one stands outside the door of the building one is in (null: outside). */
  get outside(): { x: number; y: number; z: number; yaw: number } | null {
    const b = this.within ? this.open?.b : undefined;
    return b ? { x: b.door[0], y: b.floorY, z: b.door[1], yaw: Math.atan2(b.vx, b.vz) } : null;
  }

  get roomText(): string {
    if (!this.open) return '';
    const g = this.open.door.town.guildAt(this.open.b.id);
    return `${this.within ? 'in' : 'open'} ${this.open.b.kind} #${this.open.b.id}${g ? ` (${g.guild.name})` : ''} of ${this.open.door.town.id}${this.within ? ` storey ${this.lampOn}` : ''}`;
  }
}

/** The same building of the same town. */
const same = (a: TownDoor, b: TownDoor): boolean => a.town === b.town && a.b.id === b.b.id;
