/**
 * The cellar's household comes down when it has gone quiet (show, don't tell; CLAUDE.md rule 11): a moment after the
 * last of its dwellers falls, the one the hero would have reported to climbs down the ladder under the hatch, seen on
 * the rungs (@futuremagic/figure's LadderClimb, their body its puppet as the hero's is), walks through the cellar to
 * the hero (game/visitor.ts), and thanks them there, paying as they would have at their door. Then they go back to
 * the ladder and up it. So the hero sees that the task is done; no line has to say so. Drawn as townsfolk are
 * (FolkView, which places them in the cellar while the land above is out of the frame).
 */
import { LadderClimb, faceYaw, type ClimbStep, type Climber } from '@futuremagic/figure';
import { DungeonGround, type P3 } from '../sim/dungeonNav';
import type { Agent } from '../sim/townLife';
import { Visitor } from '../game/visitor';
import type { Placed } from '../render/folk/FolkView';
import type { CellarVisit } from './cellarVisit';

/** Seconds after the last foe falls before they come (they heard it go still). */
export const COME_AFTER = 3;
/** Where they wait to come down, and where the climb starts and ends: this far over the cellar's floor (m), out of sight up the shaft. */
const UP_THE_SHAFT = 6, CLIMB_TOP = 2.5;
/** Seconds they hold out the purse as their thanks begin (the 'interact' clip), then talk. */
const HAND_OVER = 1.4;

export interface OwnerHost {
  /** Their body once drawn as a character (null: not yet dressed). */
  body(): Climber | null;
  /** Say `text` over their head (a speech bubble) while they stand at `at` (world). */
  say(text: string, at: () => P3 | null): void;
  /** They thank the hero: the promise is kept and paid; what they say (empty: nothing). */
  told(): string;
}

export type Phase = 'wait' | 'down' | 'walk' | 'up' | 'gone';

export class OwnerComes {
  /** Where they are in it: waiting up the shaft, on the ladder down, walking (to the hero and back), on it up, gone. */
  phase: Phase = 'wait';
  private t = 0;
  private readonly climb = new LadderClimb();
  private readonly ground: DungeonGround;
  private walker: Visitor | null = null;
  /** Seconds since their thanks began (−1: not yet). */
  private thanking = -1;
  private body: Climber = { height: 1.75, hipHeight: 0.9 };

  constructor(readonly visit: CellarVisit, readonly agent: Agent, private readonly host: OwnerHost) {
    this.ground = new DungeonGround(visit.space);
  }

  /** Back up and gone (the hero may climb up after them). */
  get done(): boolean { return this.phase === 'gone'; }

  /** They have thanked the hero. */
  get thanked(): boolean { return this.thanking >= 0; }

  /** Each frame (`hero`: the hero's feet, world). */
  step(dt: number, hero: P3): void {
    this.t += dt;
    const L = this.visit.ladder;
    if (this.phase === 'wait') {
      const body = this.host.body();
      if (!body || this.t < COME_AFTER) return;
      this.body = body;
      this.play([
        { kind: 'climb', ladder: L, from: L.floor + CLIMB_TOP, to: L.floor },
        { kind: 'foot', ladder: L, dir: 'off' },
      ], L.floor + CLIMB_TOP);
      this.phase = 'down';
      return;
    }
    if (this.phase === 'down' || this.phase === 'up') {
      this.climb.advance(dt);
      if (this.climb.active) return;
      if (this.phase === 'up') { this.phase = 'gone'; return; }
      const O = this.visit.origin, p = this.climb.pos;
      this.walker = new Visitor(this.ground, { x: p.x - O.x, y: p.y - O.y, z: p.z - O.z }, -Math.PI / 2 - this.climb.yaw);
      this.phase = 'walk';
      return;
    }
    if (this.phase !== 'walk' || !this.walker) return;
    const O = this.visit.origin, v = this.walker;
    if (this.thanking >= 0) this.thanking += dt;
    const e = v.step(dt, { x: hero.x - O.x, y: hero.y - O.y, z: hero.z - O.z });
    if (e === 'thanks') {
      this.thanking = 0;
      const text = this.host.told();
      if (text) this.host.say(text, () => (this.phase === 'walk' ? { x: v.x + O.x, y: v.y + O.y, z: v.z + O.z } : null));
    }
    if (e === 'gone') {
      // At the ladder's foot: onto it and up into the house again.
      this.play([
        { kind: 'foot', ladder: L, dir: 'on' },
        { kind: 'climb', ladder: L, from: L.floor, to: L.floor + CLIMB_TOP },
      ], v.y + O.y, v.x + O.x, v.z + O.z, faceYaw(L));
      this.phase = 'up';
    }
  }

  /** Where they are drawn now (world), for the townsfolk's view; null once gone. */
  placed(): Placed | null {
    const L = this.visit.ladder, a = this.agent;
    if (this.phase === 'gone') return null;
    if (this.phase === 'wait') return { agent: a, x: L.x, y: L.floor + UP_THE_SHAFT, z: L.z, dir: -Math.PI / 2 - faceYaw(L), act: 'wait' };
    if (this.phase === 'down' || this.phase === 'up') {
      const p = this.climb.pos;
      return { agent: a, x: p.x, y: p.y, z: p.z, dir: -Math.PI / 2 - this.climb.yaw, act: 'walk', puppet: this.climb };
    }
    const O = this.visit.origin, v = this.walker!;
    const act = v.walking ? 'walk' : this.thanking >= 0 && this.thanking < HAND_OVER ? 'mark' : v.phase === 'thank' ? 'chat' : 'wait';
    return { agent: a, x: v.x + O.x, y: v.y + O.y, z: v.z + O.z, dir: v.dir, act };
  }

  /** Start a climb at feet height `y` (by the ladder, or at x, z), facing the ladder. */
  private play(steps: ClimbStep[], y: number, x?: number, z?: number, yaw?: number): void {
    const L = this.visit.ladder;
    this.climb.play(steps, x ?? L.x, y, z ?? L.z, yaw ?? faceYaw(L), this.body);
    this.climb.advance(0);
  }
}
