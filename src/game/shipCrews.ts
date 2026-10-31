/**
 * The crews of the ships and boats near the hero (S3), at work where their vessel's state puts them
 * (sim/shipFolk.ts) and carried with it as it rides the swell: each frame their posts go from the vessel's frame
 * into the world. They are drawn with the townsfolk (as people placed by the app, like those in a room) and their
 * bodies block the hero's, as everyone's do.
 */
import { deriveSeed } from '@futuremagic/core';
import { crewOf, crewPost, type Hand } from '../sim/shipFolk';
import { standingAgent, type Agent } from '../sim/townLife';
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

/** A crew body's radius (m), as a townsperson's. */
const BODY = 0.3;

export class ShipCrews {
  private readonly crews = new Map<string, { hands: Hand[]; agents: Agent[] }>();
  private shown: CrewPlaced[] = [];

  constructor(private readonly seed: number) {}

  /** Once a frame, after the ships have moved: every crew on its vessel now. */
  atWork(decks: Decks): readonly CrewPlaced[] {
    const out: CrewPlaced[] = [], near = new Set<string>();
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
      }
    }
    for (const id of this.crews.keys()) if (!near.has(id)) this.crews.delete(id);
    this.shown = out;
    return out;
  }

  /** Whether a body of radius `r` at (x, z), its feet at `y`, touches one of the crew. */
  inCrew(x: number, z: number, r: number, y: number): boolean {
    for (const p of this.shown) if (Math.abs(p.y - y) < 1.5 && Math.hypot(p.x - x, p.z - z) < r + BODY) return true;
    return false;
  }
}
