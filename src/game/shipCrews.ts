/**
 * The crews of the ships and boats near the hero (S3), at work where their vessel's state puts them
 * (sim/shipFolk.ts), and a ship's passengers (its harbour town's travellers by sea, aboard at the end of their
 * visit: sim/people.ts), carried with it as it rides the swell: each frame their posts go from the vessel's frame
 * into the world. They are drawn with the townsfolk (as people placed by the app, like those in a room) and their
 * bodies block the hero's, as everyone's do. The passengers are their town's people, so they can be talked to.
 *
 * Here too the castaway (S9, D52; the VGM's `castaway`, vgm/situations.ts): a fisher whose boat went over clings to it
 * upturned off the strand, treading water and calling out. The hero swims out to them; once within reach the fisher
 * takes hold and is brought in behind the hero, swimming. Where the hero finds their feet the fisher wades ashore
 * beside them, up onto the dry strand, and stands there, saved (a good deed: `saved`). Left too long, another boat
 * picks them up and they are gone. All shown, nothing told but the one cry.
 */
import { deriveSeed } from '@futuremagic/core';
import { planShip } from '@futuremagic/settlement';
import { PASSENGER_POSTS, crewOf, crewPost, passengerPost, type Hand } from '../sim/shipFolk';
import { aboardAt, sailsAt } from '../sim/people';
import { standingAgent, type Agent, type TownLife } from '../sim/townLife';
import type { ActivityKind } from '../sim/spots';
import { toWorld, type Decks } from '../world/deck';
import type { CastawayDecision } from '../world/decisions';
import { ahead } from './portalStone';

/** Someone placed where the app says (the render's Placed). */
export interface CrewPlaced {
  readonly agent: Agent;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly dir: number;
  readonly act: ActivityKind;
}

/** A line from a hand's grip to where it goes up to (world metres). */
export interface CrewLine {
  /** Who hauls on it (their hands hold its lower end). */
  readonly agent: Agent;
  readonly from: { readonly x: number; readonly y: number; readonly z: number };
  readonly to: { readonly x: number; readonly y: number; readonly z: number };
  /** Its lower end is in the hauler's hands (else it runs on from the rail). */
  readonly held: boolean;
}

/** A crew body's radius (m), as a townsperson's. */
const BODY = 0.3;
/** Where a hauling hand grips the line: this far before them and this high over their feet (m). */
const GRIP = 0.35, GRIP_UP = 0.85;

export class ShipCrews {
  private readonly crews = new Map<string, { hands: Hand[]; agents: Agent[] }>();
  private shown: CrewPlaced[] = [];
  private hauled: CrewLine[] = [];
  /** The passengers aboard now (to be talked to), and where each was in their town before boarding. */
  private aboard: CrewPlaced[] = [];
  private readonly ashore = new Map<Agent, { x: number; z: number }>();
  /** The game hour each ship near the hero cast off at, while she is under way (her passengers are who sailed then). */
  private readonly castOff = new Map<string, number>();

  constructor(private readonly seed: number) {}

  /**
   * Once a frame, after the ships have moved: every crew on its vessel now, and the passengers aboard at game hour
   * `hours` (`lifeOf`: a harbour town's life, by its id; `hero`: where the hero stands, whom a passenger held in
   * talk faces).
   */
  atWork(decks: Decks, hours = 0, lifeOf: (town: string) => TownLife | null = () => null, hero: { x: number; z: number } | null = null): readonly CrewPlaced[] {
    const out: CrewPlaced[] = [], lines: CrewLine[] = [], near = new Set<string>(), aboard: CrewPlaced[] = [], boarded = new Set<string>();
    for (const v of decks.each()) {
      near.add(v.id);
      let c = this.crews.get(v.id);
      if (!c) {
        const hands = crewOf(v.plan, this.seed, v.id);
        c = { hands, agents: hands.map((h) => standingAgent(h.person, v.pose.x, v.pose.z, 0, 'wait', deriveSeed(h.person.seed, 'life'))) };
        this.crews.set(v.id, c);
      }
      const turn = Math.atan2(v.pose.uz, v.pose.ux);
      for (const [k, h] of c.hands.entries()) {
        const post = crewPost(v.plan, h, k, v.state), w = toWorld(v.pose, post.a, post.h, post.b), a = c.agents[k];
        a.x = w.x; a.z = w.z; a.dir = post.dir + turn; a.act = a.next = post.act;
        out.push({ agent: a, x: w.x, y: w.y, z: w.z, dir: a.dir, act: post.act });
        const l = post.line;
        if (l) {
          const grip = toWorld(v.pose, post.a + Math.cos(post.dir) * GRIP, post.h + GRIP_UP, post.b + Math.sin(post.dir) * GRIP), up = toWorld(v.pose, l.a, l.h, l.b);
          const via = l.via ? toWorld(v.pose, l.via.a, l.via.h, l.via.b) : null;
          lines.push({ agent: a, from: grip, to: via ?? up, held: true });
          if (via) lines.push({ agent: a, from: via, to: up, held: false });
        }
      }
      // A town's passengers go aboard the first of its ships near the hero.
      const town = v.id.slice(0, v.id.lastIndexOf('/')), life = v.plan.kind === 'ship' && !boarded.has(town) ? lifeOf(town) : null;
      if (!life) continue;
      boarded.add(town);
      // Waiting aboard at the pier (the end of their visit); under way, everyone of them in town when she cast off.
      if (v.state !== 'sailing') this.castOff.delete(v.id);
      else if (!this.castOff.has(v.id)) this.castOff.set(v.id, hours);
      const off = this.castOff.get(v.id);
      const going = life.agents.filter((a) => (off === undefined ? aboardAt(a.person, hours) : sailsAt(a.person, off))).slice(0, PASSENGER_POSTS);
      for (const a of going) a.person.sailing = off !== undefined;
      for (const [k, a] of going.entries()) {
        const post = passengerPost(v.plan, k), w = toWorld(v.pose, post.a, post.h, post.b);
        if (!this.ashore.has(a)) this.ashore.set(a, { x: a.x, z: a.z });
        a.x = w.x; a.z = w.z;
        // Held in talk: turned to the hero, talking.
        const dir = a.held && hero ? Math.atan2(hero.z - w.z, hero.x - w.x) : post.dir + turn;
        const p = { agent: a, x: w.x, y: w.y, z: w.z, dir, act: a.held ? 'chat' as const : post.act };
        out.push(p);
        aboard.push(p);
      }
    }
    for (const id of this.crews.keys()) if (!near.has(id)) this.crews.delete(id);
    // Off the ship (sailed, or the hero gone from near it): back where they were in their town.
    for (const [a, at] of this.ashore) if (!aboard.some((p) => p.agent === a)) { a.x = at.x; a.z = at.z; a.person.sailing = false; this.ashore.delete(a); }
    for (const id of this.castOff.keys()) if (!near.has(id)) this.castOff.delete(id);
    this.shown = out;
    this.hauled = lines;
    this.aboard = aboard;
    return out;
  }

  /** The passengers aboard the ships near the hero now, where they stand (to be talked to). */
  get passengers(): readonly CrewPlaced[] {
    return this.aboard;
  }

  /** The lines the crew haul on now, from their hands up (drawn as ropes). */
  get lines(): readonly CrewLine[] {
    return this.hauled;
  }

  /** Whether a body of radius `r` at (x, z), its feet at `y`, touches one of the crew. */
  inCrew(x: number, z: number, r: number, y: number): boolean {
    for (const p of this.shown) if (Math.abs(p.y - y) < 1.5 && Math.hypot(p.x - x, p.z - z) < r + BODY) return true;
    return false;
  }
}

/** What the fisher does now. */
export type CastawayState = 'cling' | 'towed' | 'ashore';

/** The hero as the fisher sees them: where, which way they face, and whether they swim (not yet on their feet). */
export interface CastawayHero {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly swimming: boolean;
}

/** The water and the land where the fisher is. */
export interface CastawayWater {
  /** The sea's surface (m). */
  surface(x: number, z: number): number;
  /** The ground (the bed under the water) (m). */
  ground(x: number, z: number): number;
}

/** How near the hero swims (m) before the fisher takes hold; how far behind the hero they swim. */
export const REACH = 2.4;
const BEHIND = 1.1;
/** How far the fisher is from the boat's middle (m), on its side. */
const BY_BOAT = 1.1;
/** How deep the fisher's feet (the body's origin) sit under the surface while they swim or tread water (m): as the hero's (game/walker.ts floats the feet 0.56 of the height down, render/hero/HeroView.ts drops a swimmer 0.15 more), for a body of some 1.72 m. */
const SWIM_DROP = 1.22;
/** Ashore: how far up the strand they wade (m) past the hero, how fast (m/s), and when they are out of the water (the ground at most this under the sea's surface, waves and all, m). */
const WADE = 3, WADE_PACE = 1.1, DRY = 0.15;
/** Steps of 1.5 m they wade on at most looking for dry ground (then they stop where they are). */
const WADE_ON = 12;
/** Out of the hero's sight this far off (m), the fisher saved goes home. */
const GONE = 70;

interface Adrift {
  readonly d: CastawayDecision;
  readonly agent: Agent;
  state: CastawayState;
  /** Where they swim or stand now. */
  x: number;
  z: number;
  dir: number;
  /** Ashore: where they wade to. */
  to: { x: number; z: number } | null;
  /** Steps waded on looking for dry ground, and the way they wade (a unit vector). */
  wade: number;
  ux: number;
  uz: number;
  saved: boolean;
}

export class Castaways {
  private readonly adrift = new Map<string, Adrift>();
  private shown: CrewPlaced[] = [];

  /** Brought in (the decision): the app writes the good deed (once a fisher). */
  saved: (d: CastawayDecision, agent: Agent) => void = () => {};

  constructor(private readonly seed: number) {}

  /**
   * Once a frame: `open` the castaways the log still has adrift (vgm/situations.ts castawaysAt), each fisher where
   * they are now. A fisher brought in stays where they came ashore until the hero is gone from them.
   */
  drift(dt: number, open: readonly CastawayDecision[], hero: CastawayHero, water: CastawayWater): readonly CrewPlaced[] {
    for (const d of open) if (!this.adrift.has(d.id)) this.adrift.set(d.id, this.begin(d));
    const out: CrewPlaced[] = [];
    for (const [id, a] of this.adrift) {
      const off = Math.hypot(a.x - hero.x, a.z - hero.z);
      // Picked up by another boat (time ran out), or saved and left behind.
      if ((!a.saved && a.state !== 'towed' && !open.some((d) => d.id === id)) || (a.saved && off > GONE)) { this.adrift.delete(id); continue; }
      this.swimOn(a, dt, hero, water);
      // Out of their depth they swim with the head out; in the shallows they wade, feet on the bed.
      const floating = water.surface(a.x, a.z) - SWIM_DROP, bed = water.ground(a.x, a.z);
      // (Never into the bed: in the shallows behind the hero their feet are on it.)
      const wet = a.state !== 'ashore' || bed < floating;
      const y = Math.max(floating, bed);
      a.agent.x = a.x; a.agent.z = a.z; a.agent.dir = a.dir;
      const act = a.state === 'cling' ? 'tread' : a.state === 'towed' ? 'swim' : a.to ? (wet ? 'swim' : 'walk') : 'wait';
      a.agent.act = a.agent.next = act;
      out.push({ agent: a.agent, x: a.x, y, z: a.z, dir: a.dir, act });
    }
    this.shown = out;
    return out;
  }

  /** The fishers drawn now. */
  get fishers(): readonly CrewPlaced[] {
    return this.shown;
  }

  /** The fisher of castaway `id`, if they are about (whose cry it is). */
  fisherOf(id: string): CrewPlaced | null {
    const a = this.adrift.get(id);
    return a ? this.shown.find((p) => p.agent === a.agent) ?? null : null;
  }

  /** What castaway `id`'s fisher does now (null: not about). */
  stateOf(id: string): CastawayState | null {
    return this.adrift.get(id)?.state ?? null;
  }

  /** A fisher's body in the way of (x, z) within r (m), for the walker (bodies block, MW #394). */
  inBody(x: number, z: number, r: number): boolean {
    for (const p of this.shown) if (Math.hypot(p.x - x, p.z - z) < r + 0.3) return true;
    return false;
  }

  /** The fisher of `d`: one of a boat's crew (sim/shipFolk.ts), beside the upturned boat, facing it. */
  private begin(d: CastawayDecision): Adrift {
    const hand = crewOf(planShip(d.seed, 'boat'), this.seed, d.id)[0];
    // Beside it (its keel along `yaw`): off its side by BY_BOAT, facing it.
    const [sx, sz] = ahead(d.yaw), x = d.x + sz * BY_BOAT, z = d.z - sx * BY_BOAT;
    const dir = Math.atan2(d.z - z, d.x - x);
    const agent = standingAgent(hand.person, x, z, dir, 'tread', hand.person.seed);
    return { d, agent, state: 'cling', x, z, dir, to: null, wade: 0, ux: 0, uz: 0, saved: false };
  }

  private swimOn(a: Adrift, dt: number, hero: CastawayHero, water: CastawayWater): void {
    if (a.state === 'cling') {
      // Turned to the hero once they are near (they have seen them coming); takes hold within reach.
      const dx = hero.x - a.x, dz = hero.z - a.z, d = Math.hypot(dx, dz);
      if (d < 30) a.dir = Math.atan2(dz, dx);
      if (d < REACH && hero.swimming) a.state = 'towed';
      return;
    }
    if (a.state === 'towed') {
      // Behind the hero, the way they swim.
      const [fx, fz] = ahead(hero.yaw), bx = hero.x - fx * BEHIND, bz = hero.z - fz * BEHIND;
      const k = Math.min(1, dt * 4);
      a.x += (bx - a.x) * k;
      a.z += (bz - a.z) * k;
      a.dir = Math.atan2(hero.z - a.z, hero.x - a.x);
      // The hero on their feet in the shallows: the fisher wades on up the strand beside them.
      if (!hero.swimming) {
        a.state = 'ashore';
        const gx = hero.x - a.x, gz = hero.z - a.z, k = Math.hypot(gx, gz) || 1;
        a.ux = gx / k;
        a.uz = gz / k;
        a.to = { x: hero.x + a.ux * WADE - a.uz * 1.2, z: hero.z + a.uz * WADE + a.ux * 1.2 };
      }
      return;
    }
    if (!a.to) return;
    const dx = a.to.x - a.x, dz = a.to.z - a.z, d = Math.hypot(dx, dz), step = WADE_PACE * dt;
    if (d > step) {
      a.ux = dx / d;
      a.uz = dz / d;
      a.x += a.ux * step;
      a.z += a.uz * step;
      a.dir = Math.atan2(dz, dx);
      return;
    }
    a.x = a.to.x;
    a.z = a.to.z;
    // Still in the water there: on the way they go until they are out of it (past the waves' reach).
    if (water.ground(a.x, a.z) < water.surface(a.x, a.z) - DRY && a.wade++ < WADE_ON) {
      a.to = { x: a.x + a.ux * 1.5, z: a.z + a.uz * 1.5 };
      return;
    }
    a.to = null;
    // Out on the dry strand: turned to the hero, saved.
    a.dir = Math.atan2(hero.z - a.z, hero.x - a.x);
    if (!a.saved) {
      a.saved = true;
      this.saved(a.d, a.agent);
    }
  }
}
