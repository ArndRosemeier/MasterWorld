/**
 * The hens of a town (plan 9.3, the animals' part of the world simulation): a flock in every farmyard
 * and in some of the town's back yards. They peck about, take a few steps, keep inside their yard and
 * near each other, scatter from someone walking into them, and sit and doze from dusk to dawn. The
 * cock crows of a morning. What they do that is heard (a cluck, a squawk, a crow) is left in `heard`
 * for the sounds. Deterministic for a seed and a sequence of steps. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { distPointPolyEdge, pointInPoly, polyArea, polyCentroid, type Poly, type TownPlan } from '@futuremagic/settlement';
import { seededSpot } from './seededSpot';
import type { PoultryDef } from '../setting/contract';

/** What a bird is doing (a renderer maps it to a clip). */
export type HenAct = 'peck' | 'idle' | 'walk' | 'run' | 'crow' | 'roost';

export interface Hen {
  readonly id: number;
  readonly flock: number;
  /** A cock (else a hen). */
  readonly cock: boolean;
  x: number;
  z: number;
  /** Facing (radians, xz atan2). */
  dir: number;
  act: HenAct;
  /** Ground speed now (m/s). */
  speed: number;
  tx: number;
  tz: number;
  /** When the current act ends (sim seconds). */
  until: number;
  readonly rng: Rng;
}

/** A yard and the ground it keeps to (its fences, house walls and sheds are its edge and holes). */
interface Yard {
  readonly outer: Poly;
  readonly holes: readonly Poly[];
}

/** Something heard from the flock this step. */
export interface HenSound {
  readonly kind: 'cluck' | 'squawk' | 'crow';
  readonly x: number;
  readonly z: number;
}

/** Walking and running pace (m/s); how close to its yard's edge (m); how near someone may come before it scatters (m). */
const PACE = 0.35, RUN = 2, EDGE = 0.5, SHY = 1.8;
/** A crow lasts as long as the cock's Idle_4 (s). */
const CROW = 4.5;

export class Poultry {
  readonly hens: Hen[] = [];
  private readonly yards: Yard[] = [];
  /** What was heard in the last step. */
  readonly heard: HenSound[] = [];
  time = 0;

  constructor(plan: TownPlan, seed: number, def: PoultryDef) {
    const rng = new Rng(deriveSeed(seed, 'poultry'));
    const keep = (yard: Yard, hens: number, cock: boolean): void => {
      // A yard with no open ground (all shed and edge) keeps none.
      if (!this.openIn(yard, new Rng(deriveSeed(seed, 'yard', this.yards.length)))) return;
      const f = this.yards.length;
      this.yards.push(yard);
      for (let k = 0; k < hens + (cock ? 1 : 0); k++) {
        const id = this.hens.length, r = new Rng(deriveSeed(seed, 'hen', id));
        const [x, z] = this.openIn(yard, r) ?? polyCentroid(yard.outer);
        this.hens.push({ id, flock: f, cock: k === hens, x, z, dir: r.range(-Math.PI, Math.PI), act: 'peck', speed: 0, tx: x, tz: z, until: r.range(0, 8), rng: r });
      }
    };
    for (const farm of plan.farms) keep({ outer: farm.yard, holes: [] }, rng.int(def.farmHens[0], def.farmHens[1]), true);
    for (const y of plan.yards) {
      if (Math.abs(polyArea(y.outer)) < def.yardArea || !rng.chance(def.yardShare)) continue;
      keep({ outer: y.outer, holes: y.holes }, rng.int(def.yardHens[0], def.yardHens[1]), rng.chance(def.yardCock));
    }
  }

  /**
   * Advance `dt` seconds at `hour` (0..24); `near`: whoever walks about (the hero; null: none); `blocked`: a
   * wall or shed in the way of a bird of radius r at (x, z).
   */
  step(dt: number, hour: number, def: PoultryDef, near: { x: number; z: number } | null, blocked?: (x: number, z: number, r: number) => boolean): void {
    this.time += dt;
    this.heard.length = 0;
    const h = ((hour % 24) + 24) % 24, awake = h >= def.awake[0] && h < def.awake[1];
    for (const a of this.hens) {
      // Dusk: each sits down where it is (at its own moment); dawn: up again.
      if (!awake) {
        if (a.act !== 'roost' && a.rng.chance(dt / 8)) Object.assign(a, { act: 'roost', speed: 0, until: 0 });
        continue;
      }
      if (a.act === 'roost') { if (a.rng.chance(dt / 15)) this.standAbout(a, h, def); continue; }
      // Someone walking into the flock: it squawks and runs off.
      if (near && a.act !== 'run' && Math.hypot(near.x - a.x, near.z - a.z) < SHY) { this.scatter(a, near); continue; }
      if (a.act === 'walk' || a.act === 'run') {
        const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
        if (d < 0.08 || this.time >= a.until) { this.standAbout(a, h, def); continue; }
        // A hen turns quickly, a little slower when running.
        const want = Math.atan2(dz, dx);
        let turn = want - a.dir;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        const rate = (a.act === 'run' ? 6 : 4) * dt;
        a.dir += Math.max(-rate, Math.min(rate, turn));
        const v = (a.act === 'run' ? RUN : PACE) * Math.max(0.15, Math.cos(turn));
        const nx = a.x + Math.cos(a.dir) * v * dt, nz = a.z + Math.sin(a.dir) * v * dt;
        if (!this.inside(this.yards[a.flock], nx, nz) || blocked?.(nx, nz, 0.18)) { this.standAbout(a, h, def); continue; }
        a.x = nx; a.z = nz; a.speed = v;
      } else if (this.time >= a.until) this.stroll(a, h, def);
      else if (a.act === 'peck' && a.rng.chance(dt / 25)) this.heard.push({ kind: 'cluck', x: a.x, z: a.z });
    }
  }

  /** Peck where it is, or stand and look about (a cock of a morning may crow). */
  private standAbout(a: Hen, h: number, def: PoultryDef): void {
    a.speed = 0;
    if (a.cock && h < def.crowUntil && a.rng.chance(0.3)) {
      Object.assign(a, { act: 'crow', until: this.time + CROW });
      this.heard.push({ kind: 'crow', x: a.x, z: a.z });
      return;
    }
    a.act = a.rng.chance(a.cock ? 0.5 : 0.8) ? 'peck' : 'idle';
    a.until = this.time + a.rng.range(3, 12);
  }

  /** A few steps on: after the flock now and then, else anywhere close by. */
  private stroll(a: Hen, h: number, def: PoultryDef): void {
    if (a.rng.chance(0.3)) { this.standAbout(a, h, def); return; }
    const yard = this.yards[a.flock];
    const mates = this.hens.filter((b) => b.flock === a.flock && b !== a);
    const mate = mates.length && a.rng.chance(0.4) ? mates[a.rng.int(0, mates.length - 1)] : null;
    for (let k = 0; k < 8; k++) {
      const ox = mate ? mate.x : a.x, oz = mate ? mate.z : a.z;
      const ang = a.rng.range(-Math.PI, Math.PI), d = a.rng.range(mate ? 0.6 : 0.5, mate ? 1.5 : 2.5);
      const tx = ox + Math.cos(ang) * d, tz = oz + Math.sin(ang) * d;
      if (!this.inside(yard, tx, tz)) continue;
      Object.assign(a, { tx, tz, act: 'walk', until: this.time + Math.hypot(tx - a.x, tz - a.z) / PACE * 2 + 2 });
      return;
    }
    // Hemmed in at the edge: back towards the middle.
    const [tx, tz] = this.openIn(yard, a.rng) ?? [a.x, a.z];
    Object.assign(a, { tx, tz, act: 'walk', until: this.time + 20 });
  }

  /** Off from `near`, a few metres, staying in the yard (sideways if straight away is the fence). */
  private scatter(a: Hen, near: { x: number; z: number }): void {
    const away = Math.atan2(a.z - near.z, a.x - near.x), yard = this.yards[a.flock];
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
      const d = a.rng.range(2, 3.5), tx = a.x + Math.cos(away + turn) * d, tz = a.z + Math.sin(away + turn) * d;
      if (!this.inside(yard, tx, tz)) continue;
      Object.assign(a, { tx, tz, act: 'run', until: this.time + 3 });
      this.heard.push({ kind: 'squawk', x: a.x, z: a.z });
      return;
    }
  }

  private inside(y: Yard, x: number, z: number): boolean {
    if (!pointInPoly(y.outer, x, z) || distPointPolyEdge(y.outer, x, z) < EDGE) return false;
    for (const hole of y.holes) if (pointInPoly(hole, x, z) || distPointPolyEdge(hole, x, z) < EDGE) return false;
    return true;
  }

  /** A seeded spot well inside the yard (null: none found). */
  private openIn(y: Yard, r: Rng): [number, number] | null {
    return seededSpot(y.outer, (x, z) => this.inside(y, x, z), r);
  }
}
