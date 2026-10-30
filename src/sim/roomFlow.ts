/**
 * People coming and going in a room drawn open (D48): who comes in walks from the door to their place, who leaves
 * walks from it to the door (or to the foot of the stairs, going up to bed, and is then drawn abed upstairs), and
 * who is sent to another place walks over to it, round the furniture (@futuremagic/settlement roomPath). Without
 * this they appeared on their seats and vanished from them. Those already in when the room opens are at their
 * places at once. Room coordinates; pure.
 */
import { roomPath, type InteriorPlan } from '@futuremagic/settlement';
import { benchUnder, type Cast } from './roomCast';
import type { ActivityKind } from './spots';
import type { Agent } from './townLife';

/** Someone drawn in the room this frame. */
export interface RoomPlace {
  agent: Agent;
  /** Room coordinates and storey. */
  a: number;
  b: number;
  storey: number;
  /** Facing in the room (the plan's convention, atan2(b, a)). */
  yaw: number;
  act: ActivityKind;
  /** Sitting: the seat's height over the storey's floor (the bench top). */
  seat?: number;
  /** Asleep: the bed's height over the storey's floor (the top of its bedding). */
  bed?: number;
}

/** Indoors one walks no faster than this (m/s): between tables, not down the street. */
const ROOM_PACE = 1.1;

interface Walk {
  /** Flat a, b pairs; `i` the next point. */
  path: number[];
  i: number;
  a: number;
  b: number;
  yaw: number;
  /** Where to: a spot of the room (its index), or out of it (-1: the door, -2: up the stairs). */
  to: number;
}

const OUT = -1, UP = -2;

export class RoomFlow {
  /** Where each one was drawn last (and the spot they had). */
  private readonly drawn = new Map<Agent, { spot: number; a: number; b: number; yaw: number }>();
  private readonly walks = new Map<Agent, Walk>();
  private started = false;
  /** Just outside the doorway, and before the first step up (where one goes up to bed). */
  readonly door: [number, number];
  private readonly stair: [number, number] | null;

  constructor(readonly plan: InteriorPlan) {
    const g = plan.storeys[0];
    this.door = [0, g.b0 - 0.45];
    const s = plan.stairs.find((x) => x.storey === 0);
    this.stair = s ? [s.a - s.da * 0.4, s.b - s.db * 0.4] : null;
  }

  /** The spot each one had last frame (roomCast's `kept`, so seats stay whose they are). */
  get kept(): Map<Agent, number> {
    const m = new Map<Agent, number>();
    for (const [a, d] of this.drawn) if (d.spot >= 0) m.set(a, d.spot);
    return m;
  }

  /** Those walking out through the door now (the town must keep them at its doorstep until they reach it). */
  get leaving(): Agent[] {
    const out: Agent[] = [];
    for (const [a, w] of this.walks) if (w.to === OUT) out.push(a);
    return out;
  }

  /** One frame: who is where, from the room's cast now (roomCast) and `dt` seconds walked. */
  frame(cast: readonly Cast[], dt: number): RoomPlace[] {
    const first = !this.started;
    this.started = true;
    const now = new Map<Agent, Cast>();
    for (const c of cast) now.set(c.agent, c);
    // Come in, or sent to another place: walk there from where they are drawn (from the door if not).
    for (const c of cast) {
      const s = this.plan.spots[c.spot], w = this.walks.get(c.agent), was = this.drawn.get(c.agent);
      if (first) { this.walks.delete(c.agent); continue; }
      // Off to a place upstairs (to bed): from the ground floor up the stairs first, then there.
      const below = !!w || !was || was.spot < 0 || this.plan.spots[was.spot].storey === 0;
      if (s.storey !== 0) {
        if (w?.to === UP) continue;
        if (!below || !this.stair) { this.walks.delete(c.agent); continue; }
        this.walk(c.agent, w ? [w.a, w.b] : was ? [was.a, was.b] : this.door, this.stair, UP);
        continue;
      }
      if (w ? w.to === c.spot : was?.spot === c.spot) continue;
      // Down from upstairs (up from bed): from the foot of the stairs.
      const from: [number, number] = w ? [w.a, w.b] : was && !below && this.stair ? this.stair : was ? [was.a, was.b] : this.door;
      this.walk(c.agent, from, [s.a, s.b], c.spot);
    }
    // Gone from the cast: out of the door, or up to bed; anyone else (away to another building) just goes.
    for (const [a, d] of this.drawn) {
      if (now.has(a) || (this.walks.get(a)?.to ?? 0) < 0) continue;
      const to = a.act === 'walk' && !a.hidden ? OUT : a.act === 'sleep' && this.stair ? UP : 0;
      if (to < 0 && d.spot >= 0 && this.plan.spots[d.spot].storey !== 0) continue;
      if (to < 0) this.walk(a, [d.a, d.b], to === OUT ? this.door : this.stair!, to);
      else this.walks.delete(a);
    }
    // Everyone on the way takes their steps.
    for (const [a, w] of this.walks) {
      if (!now.has(a) && w.to >= 0) { this.walks.delete(a); continue; }
      let left = Math.min(a.person.speed, ROOM_PACE) * dt;
      while (left > 0 && w.i * 2 < w.path.length) {
        const pa = w.path[w.i * 2], pb = w.path[w.i * 2 + 1], da = pa - w.a, db = pb - w.b, d = Math.hypot(da, db);
        if (d <= left) { w.a = pa; w.b = pb; left -= d; w.i++; continue; }
        w.a += (da / d) * left; w.b += (db / d) * left; w.yaw = Math.atan2(db, da);
        left = 0;
      }
      if (w.i * 2 >= w.path.length) this.walks.delete(a);
    }
    // Where each one is drawn.
    const out: RoomPlace[] = [];
    this.drawn.clear();
    for (const [a, w] of this.walks) {
      out.push({ agent: a, a: w.a, b: w.b, storey: 0, yaw: w.yaw, act: 'walk' });
      this.drawn.set(a, { spot: w.to >= 0 ? w.to : -1, a: w.a, b: w.b, yaw: w.yaw });
    }
    for (const c of cast) {
      if (this.walks.has(c.agent)) continue;
      const s = this.plan.spots[c.spot], bench = c.act === 'sit' ? benchUnder(this.plan, s) : undefined;
      const bed = c.act === 'sleep' ? benchUnder(this.plan, s, 'bed') : undefined;
      out.push({ agent: c.agent, a: s.a, b: s.b, storey: s.storey, yaw: s.yaw, act: c.act, ...(bench ? { seat: bench.h } : {}), ...(bed ? { bed: bed.h } : {}) });
      this.drawn.set(c.agent, { spot: c.spot, a: s.a, b: s.b, yaw: s.yaw });
    }
    return out;
  }

  /** Sets `a` walking from `from` to `to` (no way round the furniture: they are there at once). */
  private walk(a: Agent, from: [number, number], to: [number, number], spot: number): void {
    const path = roomPath(this.plan, from, to);
    if (!path) { this.walks.delete(a); return; }
    this.walks.set(a, { path, i: 1, a: from[0], b: from[1], yaw: Math.atan2(path[3] - path[1], path[2] - path[0]), to: spot });
  }
}
