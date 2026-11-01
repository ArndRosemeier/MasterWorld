/**
 * A place's household comes to the hero when it has gone quiet (show, don't tell; CLAUDE.md rule 11): a moment after
 * the last of its dwellers falls, the one the hero would have reported to comes. Under a house they climb down the
 * ladder under the hatch, seen on the rungs (@futuremagic/figure's LadderClimb, their body its puppet as the hero's
 * is); out on the land they waited outside its way in (Township.waitAt) and come in through it. They walk through the
 * place to the hero (game/visitor.ts) and thank them there, paying as they would have at their door; then they go back
 * the way they came. So the hero sees that the task is done; no line has to say so. Drawn as townsfolk are (FolkView,
 * which places them in the place while the land above is out of the frame).
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
/** A place on the land: they wait this far out behind its way in (in the rock, unseen), and step in this far inside it (m). */
const BEHIND = 4, IN_FROM = 0.8;
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

/**
 * Someone lost in the place (D62), found alive: they sit hurt by the lair's hoard at its end (`at`, the place's
 * frame) until the hero comes up to them; then they get up, say `found()`'s words and walk out the way in, up the
 * ladder under a house, home (the town has them back). Shown, not told (rule 11).
 */
export interface LostHere {
  readonly at: P3;
  /** The hero came up to them: what they say. */
  cameUp(): string;
}

/** How near the hero comes to someone lost before they get up (m), and the seconds they speak before they walk out. */
const FOUND_NEAR = 2.2, FOUND_SPEAK = 2.5;

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

  /** Someone lost, sitting where they were found (the place's frame): set while they wait to be found. */
  private readonly sat: P3 | null = null;

  constructor(readonly visit: CellarVisit, readonly agent: Agent, private readonly host: OwnerHost, private readonly lost?: LostHere) {
    this.ground = new DungeonGround(visit.space);
    // A little off the heap, where the floor goes on.
    if (lost) { const p = this.ground.slide(lost.at.x, lost.at.y, lost.at.z, 0.9, 0.5, 0.3); this.sat = p ? { ...p, y: lost.at.y } : lost.at; }
  }

  /** The one lost has been found (they got up). */
  get found(): boolean { return !!this.lost && this.phase !== 'wait'; }

  /** Back up and gone (the hero may climb up after them). */
  get done(): boolean { return this.phase === 'gone'; }

  /** They have thanked the hero. */
  get thanked(): boolean { return this.thanking >= 0; }

  /** Each frame (`hero`: the hero's feet, world). */
  step(dt: number, hero: P3): void {
    this.t += dt;
    const L = this.visit.ladder;
    if (this.phase === 'wait' && this.sat) {
      const O = this.visit.origin, at = this.sat;
      if (!this.host.body() || Math.hypot(hero.x - O.x - at.x, hero.z - O.z - at.z) > FOUND_NEAR || Math.abs(hero.y - O.y - at.y) > 1.2) return;
      // Found: up, a word, then out the way in (the visitor's way back leads to it).
      const h = this.visit.cellar.hatch, f = this.out, d = this.visit.above ? 1 : IN_FROM;
      this.walker = new Visitor(this.ground, { x: h.x - f[0] * d, y: h.y, z: h.z - f[1] * d }, Math.atan2(hero.z - O.z - at.z, hero.x - O.x - at.x));
      Object.assign(this.walker, { x: at.x, y: at.y, z: at.z });
      this.thanking = 0;
      const text = this.lost!.cameUp(), v = this.walker;
      if (text) this.host.say(text, () => (this.phase === 'walk' ? { x: v.x + O.x, y: v.y + O.y, z: v.z + O.z } : null));
      this.phase = 'walk';
      return;
    }
    if (this.phase === 'wait') {
      const body = this.host.body();
      if (!body || this.t < COME_AFTER) return;
      this.body = body;
      // A place out on the land: they come in through its way in, where they waited outside.
      if (!this.visit.above) {
        const h = this.visit.cellar.hatch, f = this.out;
        this.walker = new Visitor(this.ground, { x: h.x - f[0] * IN_FROM, y: h.y, z: h.z - f[1] * IN_FROM }, Math.atan2(-f[1], -f[0]));
        this.phase = 'walk';
        return;
      }
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
    // Someone found speaks a moment, facing the hero, then walks out.
    if (this.sat && this.thanking >= 0 && this.thanking < FOUND_SPEAK) return;
    if (this.sat) v.goBack();
    const e = v.step(dt, { x: hero.x - O.x, y: hero.y - O.y, z: hero.z - O.z });
    if (e === 'thanks') {
      this.thanking = 0;
      const text = this.host.told();
      if (text) this.host.say(text, () => (this.phase === 'walk' ? { x: v.x + O.x, y: v.y + O.y, z: v.z + O.z } : null));
    }
    if (e === 'gone' && !this.visit.above) this.phase = 'gone';
    else if (e === 'gone') {
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
    if (this.phase === 'wait' && this.sat) {
      const O = this.visit.origin, at = this.sat;
      return { agent: a, x: O.x + at.x, y: O.y + at.y, z: O.z + at.z, dir: Math.atan2(-this.out[1], -this.out[0]), act: 'hurt' };
    }
    if (this.phase === 'wait' && !this.visit.above) {
      // Out of sight behind the way in, being dressed.
      const O = this.visit.origin, h = this.visit.cellar.hatch, f = this.out;
      return { agent: a, x: O.x + h.x + f[0] * BEHIND, y: O.y + h.y, z: O.z + h.z + f[1] * BEHIND, dir: Math.atan2(-f[1], -f[0]), act: 'wait' };
    }
    if (this.phase === 'wait') return { agent: a, x: L.x, y: L.floor + UP_THE_SHAFT, z: L.z, dir: -Math.PI / 2 - faceYaw(L), act: 'wait' };
    if (this.phase === 'down' || this.phase === 'up') {
      const p = this.climb.pos;
      return { agent: a, x: p.x, y: p.y, z: p.z, dir: -Math.PI / 2 - this.climb.yaw, act: 'walk', puppet: this.climb };
    }
    const O = this.visit.origin, v = this.walker!;
    const speaking = this.thanking >= 0 && this.thanking < (this.sat ? FOUND_SPEAK : HAND_OVER);
    const act = v.walking ? 'walk' : speaking ? (this.sat ? 'chat' : 'mark') : v.phase === 'thank' ? 'chat' : 'wait';
    return { agent: a, x: v.x + O.x, y: v.y + O.y, z: v.z + O.z, dir: v.dir, act };
  }

  /** Out of the place through its way in (the frame's x, z): the hero arrives facing the other way. */
  private get out(): readonly [number, number] {
    const yaw = this.visit.cellar.hatch.yaw;
    return [Math.sin(yaw), Math.cos(yaw)];
  }

  /** Start a climb at feet height `y` (by the ladder, or at x, z), facing the ladder. */
  private play(steps: ClimbStep[], y: number, x?: number, z?: number, yaw?: number): void {
    const L = this.visit.ladder;
    this.climb.play(steps, x ?? L.x, y, z ?? L.z, yaw ?? faceYaw(L), this.body);
    this.climb.advance(0);
  }
}
