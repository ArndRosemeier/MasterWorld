/**
 * The crews of the ships and boats near the hero (S3), at work where their vessel's state puts them
 * (sim/shipFolk.ts), and a ship's passengers (its harbour town's travellers by sea, aboard at the end of their
 * visit: sim/people.ts), carried with it as it rides the swell: each frame their posts go from the vessel's frame
 * into the world. They are drawn with the townsfolk (as people placed by the app, like those in a room) and their
 * bodies block the hero's, as everyone's do. The passengers are their town's people, so they can be talked to.
 */
import { deriveSeed } from '@futuremagic/core';
import { PASSENGER_POSTS, crewOf, crewPost, passengerPost, type Hand } from '../sim/shipFolk';
import { aboardAt } from '../sim/people';
import { standingAgent, type Agent, type TownLife } from '../sim/townLife';
import type { ActivityKind } from '../sim/spots';
import { toWorld, type Decks } from '../world/deck';

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
  readonly from: { readonly x: number; readonly y: number; readonly z: number };
  readonly to: { readonly x: number; readonly y: number; readonly z: number };
}

/** A crew body's radius (m), as a townsperson's. */
const BODY = 0.3;
/** Where a hauling hand grips the line: this far before them and this high over their feet (m). */
const GRIP = 0.4, GRIP_UP = 1.15;

export class ShipCrews {
  private readonly crews = new Map<string, { hands: Hand[]; agents: Agent[] }>();
  private shown: CrewPlaced[] = [];
  private hauled: CrewLine[] = [];
  /** The passengers aboard now (to be talked to), and where each was in their town before boarding. */
  private aboard: CrewPlaced[] = [];
  private readonly ashore = new Map<Agent, { x: number; z: number }>();

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
          lines.push({ from: grip, to: via ?? up });
          if (via) lines.push({ from: via, to: up });
        }
      }
      // A town's passengers go aboard the first of its ships near the hero.
      const town = v.id.slice(0, v.id.lastIndexOf('/')), life = v.plan.kind === 'ship' && !boarded.has(town) ? lifeOf(town) : null;
      if (!life) continue;
      boarded.add(town);
      const going = life.agents.filter((a) => a.person.bySea && aboardAt(a.person, hours)).slice(0, PASSENGER_POSTS);
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
    for (const [a, at] of this.ashore) if (!aboard.some((p) => p.agent === a)) { a.x = at.x; a.z = at.z; this.ashore.delete(a); }
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
