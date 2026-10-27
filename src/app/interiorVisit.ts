/**
 * Going into a building and out again (D38, in place): as one comes up to a door, that one building is
 * drawn open where it stands (HouseView): its door open, every storey inside as the outside shows it,
 * stairs, windows one looks out of. One walks in and out with no fade; the building shuts again once one
 * has walked away. Inside, the sky's light comes in through the openings, a lamp burns under the ceiling
 * of the storey one is on (reaching about the room: no shadows, which would build shaders for everyone it
 * lit) and the eye adapts. The sun that comes in is thrown about the room (game/roomLight.ts): its
 * value eases as the sun moves and is gone at night.
 */
import { interiorBlocked, planInterior, type InteriorFixture, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import { houseWalk, type HouseWalk } from '../game/interiorWorld';
import type { HouseView } from '../render/town/HouseView';
import type { SkyView } from '../render/sky';
import type { PointLight } from 'three/webgpu';
import type { Placed } from '../render/folk/FolkView';
import { roomCast } from '../sim/roomCast';
import type { TownView } from '../render/town/TownView';
import { houseKey } from '../world/town';
import { roomBounce, roomSun, type RoomSun } from '../game/roomLight';
import { ROOM_LIGHT } from '../render/materials/building';
import type { Notes } from './notes';
import type { Player } from './player';
import type { TownDoor } from './towns';

/** What a room is called when one walks in. */
const NAMES: Partial<Record<TownBuilding['kind'], string>> = { inn: 'the inn', smithy: 'the smithy', bakery: 'the bakery', temple: 'the temple', hall: 'the hall', mill: 'the mill', workshop: 'a workshop', stable: 'the stable', barn: 'the barn' };

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

interface Open { door: TownDoor; b: TownBuilding; plan: InteriorPlan; walk: HouseWalk }

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
  private readonly plans = new Map<string, InteriorPlan>();
  /** On the way down to the cellar. */
  private going = false;

  constructor(
    private readonly towns: InteriorTowns,
    /** Houses with a cellar (by houseKey): a hatch in the room, and the way down (`before` runs once the screen is dark). */
    private readonly cellars: ReadonlyMap<string, (before: () => void) => Promise<void>>,
    private readonly view: HouseView,
    private readonly player: Player,
    /** The room's lamp (the hero's lantern below ground: one light, always in the scene). */
    private readonly light: PointLight,
    private readonly sky: SkyView,
    private readonly notes: Notes,
  ) {}

  /** The player is inside a building. */
  get inside(): boolean { return this.within; }
  /** What the open building adds to the walker's world (null: none open). */
  get walk(): HouseWalk | null { return this.open?.walk ?? null; }
  /** The building drawn open (walked into or not), and its town (null: none). */
  get opened(): TownDoor | null { return this.open?.door ?? null; }
  /** The building the player is in, and its town (null: outside). */
  get door(): TownDoor | null { return this.within ? this.open!.door : null; }

  private planOf(door: TownDoor): InteriorPlan {
    const key = houseKey(door.town.id, door.b.id);
    let p = this.plans.get(key);
    // A guild house in the open (not a hidden one) is a hall: a weapon rack and a practice post (D49).
    const g = door.town.guildAt(door.b.id);
    if (!p) this.plans.set(key, (p = planInterior(door.b, { hatch: this.cellars.has(key), hall: !!g && !g.guild.hidden })));
    return p;
  }

  /** Draws the door's building open (shutting the last). */
  private async openUp(door: TownDoor): Promise<Open> {
    if (this.open && same(this.open.door, door)) return this.open;
    this.shut();
    const b = door.b, plan = this.planOf(door);
    this.open = { door, b, plan, walk: houseWalk(b, plan) };
    await this.view.drawOpen(b, plan, this.towns.viewOf(door.town.id));
    return this.open;
  }

  private shut(): void {
    if (!this.open) return;
    this.out();
    this.open = null;
    this.view.hide();
  }

  /** Into the door's building at once: just inside its door, or (`up`, coming up through its hatch) beside the hatch. */
  async enter(door: TownDoor, _now = true, up = false): Promise<void> {
    const o = await this.openUp(door), b = door.b;
    const hatch = up ? o.plan.fixtures.find((f) => f.kind === 'hatch') : undefined;
    const [a, bb] = hatch ? besideHatch(o.plan, hatch) : [0, o.plan.storeys[0].b0 + 1.0];
    const p = o.walk.floorAt(a, bb, 0);
    this.player.teleport(p.x, p.y, p.z, Math.atan2(-b.vx, -b.vz));
    this.come();
  }

  update(dt: number): void {
    if (this.player.offFoot) return;
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
    if (w.stuckFor > STUCK_FOR) this.offStair(o, a, bb, k);
    // Onto the hatch: down to the cellar.
    const hatch = o.plan.fixtures.find((f) => f.kind === 'hatch'), down = this.cellars.get(houseKey(o.door.town.id, o.b.id));
    if (!this.going && k === 0 && hatch && down && Math.abs(a - hatch.a) < hatch.w / 2 - 0.1 && Math.abs(bb - hatch.b) < hatch.d / 2 - 0.1) {
      this.going = true;
      void down(() => this.shut()).finally(() => { this.going = false; });
    }
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

  /** Stepping in. */
  private come(): void {
    if (this.within || !this.open) return;
    this.within = true;
    this.sky.sheltered = true;
    this.lamp(this.open.walk.storey(this.player.walker.pos.y));
    // A cellar's house: the trapdoor in the floor is the way down (it lies in a dark corner, easy to miss).
    const b = this.open.b, trapdoor = this.open.plan.fixtures.some((f) => f.kind === 'hatch'), g = this.open.door.town.guildAt(b.id);
    this.notes.say(`You step into ${g && !g.guild.hidden ? g.guild.name : NAMES[b.kind] ?? 'the house'}.${trapdoor ? ' A trapdoor in the floor leads down to the cellar.' : ''}`, trapdoor ? 6 : 3);
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

  /** The people its town has in the open building now, placed on its spots (null: none open). */
  people(): Placed[] | null {
    const o = this.open;
    if (!o) return null;
    const life = o.door.town.life;
    // Only those drawn (Actors makes adults): a child would hold a seat and show nobody.
    return roomCast(life.agents, life.spots, o.b.id, o.plan).map(({ agent, spot, act }) => {
      const s = o.plan.spots[spot], p = o.walk.floorAt(s.a, s.b, s.storey);
      // The small folk serve from a step behind the counter (unseen behind it): else only their hair shows.
      const step = s.kind === 'serve' && SMALL.has(agent.person.race) ? SERVE_STEP : 0;
      return { agent, x: p.x, y: p.y + step, z: p.z, dir: o.walk.frame.dirOf(s.yaw), act };
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

/** A free place beside the hatch, facing nothing in particular (room coordinates). */
function besideHatch(plan: InteriorPlan, h: InteriorFixture): [number, number] {
  for (const d of [0.9, 1.2, 1.5]) {
    for (const [da, db] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const a = h.a + da * d, b = h.b + db * d;
      if (!interiorBlocked(plan, a, b, 0.35, 0, true)) return [a, b];
    }
  }
  return [0, plan.storeys[0].b0 + 1.0];
}

/** The same building of the same town. */
const same = (a: TownDoor, b: TownDoor): boolean => a.town === b.town && a.b.id === b.b.id;
