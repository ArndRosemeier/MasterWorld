/**
 * Going into a building and out again (D38, in place): as one comes up to a door, that one building is
 * drawn open where it stands (HouseView): its door open, every storey inside as the outside shows it,
 * stairs, windows one looks out of. One walks in and out with no fade; the building shuts again once one
 * has walked away. Inside, the sky's light comes in through the openings, a lamp burns under the ceiling
 * of the storey one is on (reaching about the room: no shadows, which would build shaders for everyone it
 * lit) and the eye adapts.
 */
import { interiorBlocked, planInterior, type InteriorFixture, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import { houseWalk, type HouseWalk } from '../game/interiorWorld';
import type { HouseView } from '../render/town/HouseView';
import type { SkyView } from '../render/sky';
import type { PointLight } from 'three/webgpu';
import type { Placed } from '../render/folk/FolkView';
import { roomCast } from '../sim/roomCast';
import type { TownLife } from '../sim/townLife';
import type { Notes } from './notes';
import type { Player } from './player';

/** What a room is called when one walks in. */
const NAMES: Partial<Record<TownBuilding['kind'], string>> = { inn: 'the inn', smithy: 'the smithy', bakery: 'the bakery', temple: 'the temple', hall: 'the hall', mill: 'the mill', workshop: 'a workshop', stable: 'the stable', barn: 'the barn' };

/** Races who stand on a step behind a counter, and its height (m; the counter is 1.05 m, made for men). */
const SMALL = new Set(['halfling', 'dwarf']);
const SERVE_STEP = 0.3;
/** A building opens as one comes this near its door (m), and shuts once one is this far from it, outside. */
const OPEN_AT = 7;
const SHUT_AT = 14;
/** Pushing this long (s) on a stair without getting anywhere: put off it (a body wedged under a low edge). */
const STUCK_FOR = 2;

interface Open { b: TownBuilding; plan: InteriorPlan; walk: HouseWalk }

export class InteriorVisit {
  private open: Open | null = null;
  /** The player is within its walls. */
  private within = false;
  /** The storey the lamp burns on (-1: out). */
  private lampOn = -1;
  private readonly plans = new Map<number, InteriorPlan>();
  /** On the way down to the cellar. */
  private going = false;

  constructor(
    private readonly buildings: readonly TownBuilding[],
    /** Houses with a cellar: a hatch in the room, and the way down (`before` runs once the screen is dark). */
    private readonly cellars: ReadonlyMap<number, (before: () => void) => Promise<void>>,
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
  /** The building the player is in (-1: outside). */
  get building(): number { return this.within ? this.open!.b.id : -1; }

  private planOf(b: TownBuilding): InteriorPlan {
    let p = this.plans.get(b.id);
    if (!p) this.plans.set(b.id, (p = planInterior(b, { hatch: this.cellars.has(b.id) })));
    return p;
  }

  /** Draws `b` open (shutting the last). */
  private async openUp(b: TownBuilding): Promise<Open> {
    if (this.open?.b.id === b.id) return this.open;
    this.shut();
    const plan = this.planOf(b);
    this.open = { b, plan, walk: houseWalk(b, plan) };
    await this.view.drawOpen(b, plan);
    return this.open;
  }

  private shut(): void {
    if (!this.open) return;
    this.out();
    this.open = null;
    this.view.hide();
  }

  /** Into `b` at once: just inside its door, or (`up`, coming up through its hatch) beside the hatch. */
  async enter(b: TownBuilding, _now = true, up = false): Promise<void> {
    const o = await this.openUp(b);
    const hatch = up ? o.plan.fixtures.find((f) => f.kind === 'hatch') : undefined;
    const [a, bb] = hatch ? besideHatch(o.plan, hatch) : [0, o.plan.storeys[0].b0 + 1.0];
    const p = o.walk.floorAt(a, bb, 0);
    this.player.teleport(p.x, p.y, p.z, Math.atan2(-b.vx, -b.vz));
    this.come();
  }

  update(_dt: number): void {
    if (this.player.flying) return;
    const w = this.player.walker, x = w.pos.x, z = w.pos.z;
    // The nearest door within reach opens (not while one is inside another).
    if (!this.within) {
      let best: TownBuilding | null = null, bd = OPEN_AT;
      for (const b of this.buildings) {
        if (Math.abs(b.door[0] - x) > OPEN_AT || Math.abs(b.door[1] - z) > OPEN_AT) continue;
        const d = Math.hypot(b.door[0] - x, b.door[1] - z);
        if (d < bd) { bd = d; best = b; }
      }
      if (best && best.id !== this.open?.b.id) void this.openUp(best);
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
    const [a, bb] = o.walk.frame.toRoom(x, z);
    // Wedged on a stair for a while, pushing: off it, at the end one was heading for.
    if (w.stuckFor > STUCK_FOR) this.offStair(o, a, bb, k);
    // Onto the hatch: down to the cellar.
    const hatch = o.plan.fixtures.find((f) => f.kind === 'hatch'), down = this.cellars.get(o.b.id);
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
    const b = this.open.b, trapdoor = this.open.plan.fixtures.some((f) => f.kind === 'hatch');
    this.notes.say(`You step into ${NAMES[b.kind] ?? 'the house'}.${trapdoor ? ' A trapdoor in the floor leads down to the cellar.' : ''}`, trapdoor ? 6 : 3);
  }

  /** Stepping out. */
  private out(): void {
    if (!this.within) return;
    this.within = false;
    this.sky.sheltered = false;
    this.lampOn = -1;
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
  }

  /** The people the town has in the open building now, placed on its spots (null: none open). */
  people(life: TownLife): Placed[] | null {
    const o = this.open;
    if (!o) return null;
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
    return `${this.within ? 'in' : 'open'} ${this.open.b.kind} #${this.open.b.id}${this.within ? ` storey ${this.lampOn}` : ''}`;
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
