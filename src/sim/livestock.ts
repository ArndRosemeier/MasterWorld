/**
 * Farm animals in their paddocks (plan 9.3, the animals' part of the world simulation): each grazes a
 * while, wanders a few steps to fresh grass, stands and dozes, and keeps inside its paddock's fence and
 * a little apart from the others. Which animal it is (the setting's livestock) is the renderer's
 * business. Deterministic for a seed and a sequence of steps. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { pointInPoly, polyBounds, polyCentroid, type Paddock, type TownPlan } from '@futuremagic/settlement';

/** What an animal is doing (a renderer maps it to a clip). */
export type GrazerAct = 'eat' | 'idle' | 'walk';

export interface Grazer {
  id: number;
  paddock: number;
  x: number;
  z: number;
  /** Facing (radians, xz atan2). */
  dir: number;
  act: GrazerAct;
  /** Ground speed now (m/s). */
  speed: number;
  /** Where it walks to. */
  tx: number;
  tz: number;
  /** When the current act ends (sim seconds). */
  until: number;
  rng: Rng;
  /** Out of its paddock (a stray, C10): it grazes round where it got to, not kept in by the fence. */
  loose?: { x: number; z: number };
  /** Points to pass on its walk first (x, z pairs): its paddock's gate, out or in. */
  way?: number[];
}

/** Walking pace (m/s), how close it keeps to the fence (m) and to another animal. */
const PACE = 0.9, FENCE = 1.6, APART = 2.6;
/** A beast out of its paddock trots off (m/s). */
const TROT = 1.7;

export class Herds {
  /** The animals in their paddocks now (those driven off are not). */
  animals: Grazer[] = [];
  /** Every animal, home or not. */
  private readonly every: Grazer[] = [];
  time = 0;

  constructor(readonly plan: TownPlan, seed: number) {
    for (const pd of plan.paddocks) for (let k = 0; k < pd.animals; k++) {
      const id = this.every.length, rng = new Rng(deriveSeed(seed, 'grazer', id));
      const [x, z] = this.grassIn(pd, rng);
      this.every.push({ id, paddock: pd.id, x, z, dir: rng.range(-Math.PI, Math.PI), act: 'eat', speed: 0, tx: x, tz: z, until: rng.range(0, 30), rng });
    }
    this.animals = [...this.every];
  }

  /** Raiders drove off `taken` animals of a paddock (by paddock id; vgm/events.ts takenFrom); the rest, or all once they are back, graze there. */
  driven(taken: ReadonlyMap<number, number>): void {
    const seen = new Map<number, number>();
    this.animals = this.every.filter((a) => {
      const k = seen.get(a.paddock) ?? 0;
      seen.set(a.paddock, k + 1);
      return k >= (taken.get(a.paddock) ?? 0);
    });
  }

  /** The beast out of its paddock now (C10), if any. */
  get straying(): Grazer | null {
    return this.animals.find((a) => a.loose) ?? null;
  }

  /**
   * One beast of paddock `paddock` gets out through its gate and wanders to `to` (a stray, C10); `to` null:
   * the one out (caught, or the stray over) goes back in through the gate.
   */
  loose(paddock: number, to: { x: number; z: number } | null): void {
    const pd = this.plan.paddocks[paddock];
    if (!pd) return;
    const [cx, cz] = polyCentroid(pd.poly), [gx, gz] = pd.gate, l = Math.hypot(cx - gx, cz - gz) || 1;
    const inX = gx + ((cx - gx) / l) * 3, inZ = gz + ((cz - gz) / l) * 3, outX = gx - ((cx - gx) / l) * 3, outZ = gz - ((cz - gz) / l) * 3;
    if (to) {
      const a = this.animals.find((x) => x.paddock === paddock && !x.loose);
      if (!a) return;
      Object.assign(a, { loose: { ...to }, way: [inX, inZ, outX, outZ], tx: to.x, tz: to.z, act: 'walk', until: this.time + 600 });
      return;
    }
    for (const a of this.animals) {
      if (a.paddock !== paddock || !a.loose) continue;
      const [x, z] = this.grassIn(pd, a.rng);
      Object.assign(a, { loose: undefined, way: [outX, outZ, inX, inZ], tx: x, tz: z, act: 'walk', until: this.time + 600 });
    }
  }

  /** Advance `dt` seconds. */
  step(dt: number): void {
    this.time += dt;
    for (const a of this.animals) {
      if (a.act === 'walk') {
        // Through the gate first, if it has a way to go.
        const wx = a.way?.length ? a.way[0] : a.tx, wz = a.way?.length ? a.way[1] : a.tz;
        if (a.way?.length && Math.hypot(wx - a.x, wz - a.z) < 0.8) { a.way.splice(0, 2); continue; }
        const dx = wx - a.x, dz = wz - a.z, d = Math.hypot(dx, dz);
        if ((d < 0.1 && !a.way?.length) || this.time >= a.until) { a.way = undefined; this.settle(a); continue; }
        // Turn towards the goal, then step (no turning on the spot).
        const want = Math.atan2(dz, dx);
        let turn = want - a.dir;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        a.dir += Math.max(-1.2 * dt, Math.min(1.2 * dt, turn));
        // Out, it trots.
        const v = (a.loose ? TROT : PACE) * Math.max(0.2, Math.cos(turn));
        const nx = a.x + Math.cos(a.dir) * v * dt, nz = a.z + Math.sin(a.dir) * v * dt;
        // On its way through the gate, or out, the fence keeps it in no more.
        if (!a.way?.length && !a.loose && !this.roomAt(a, nx, nz)) { this.settle(a); continue; }
        a.x = nx; a.z = nz; a.speed = v;
      } else if (this.time >= a.until) this.wander(a);
    }
  }

  /** Graze or stand where it is. */
  private settle(a: Grazer): void {
    a.speed = 0;
    a.act = a.rng.chance(0.75) ? 'eat' : 'idle';
    a.until = this.time + a.rng.range(12, 45);
  }

  /** On to fresh grass a few metres off (or stay put a while longer). */
  private wander(a: Grazer): void {
    const pd = this.plan.paddocks[a.paddock];
    // Out: a few steps round where it got to.
    if (a.loose) {
      const ang = a.rng.range(-Math.PI, Math.PI), d = a.rng.range(1, 4);
      Object.assign(a, { tx: a.loose.x + Math.cos(ang) * d, tz: a.loose.z + Math.sin(ang) * d, act: 'walk', until: this.time + 12 });
      return;
    }
    if (a.rng.chance(0.35)) { this.settle(a); return; }
    for (let k = 0; k < 8; k++) {
      const d = a.rng.range(2, 9), ang = a.dir + a.rng.range(-1.6, 1.6);
      const tx = a.x + Math.cos(ang) * d, tz = a.z + Math.sin(ang) * d;
      if (!this.inside(pd, tx, tz)) continue;
      a.tx = tx; a.tz = tz; a.act = 'walk';
      a.until = this.time + d / PACE * 2.5 + 4;
      return;
    }
    // Hemmed in by the fence: turn back towards the middle.
    const [x, z] = this.grassIn(pd, a.rng);
    a.tx = x; a.tz = z; a.act = 'walk';
    a.until = this.time + 30;
  }

  private roomAt(a: Grazer, x: number, z: number): boolean {
    if (!this.inside(this.plan.paddocks[a.paddock], x, z)) return false;
    for (const b of this.animals) {
      if (b === a || b.paddock !== a.paddock) continue;
      // Walking into another is not allowed; walking away from one is.
      const now = Math.hypot(b.x - a.x, b.z - a.z), then = Math.hypot(b.x - x, b.z - z);
      if (then < APART && then < now) return false;
    }
    return true;
  }

  /** Inside the paddock and at least FENCE from its fence. */
  private inside(pd: Paddock, x: number, z: number): boolean {
    if (!pointInPoly(pd.poly, x, z)) return false;
    const p = pd.poly, n = p.length >> 1;
    for (let i = 0; i < n; i++) {
      const ax = p[i * 2], az = p[i * 2 + 1], dx = p[((i + 1) % n) * 2] - ax, dz = p[((i + 1) % n) * 2 + 1] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) < FENCE) return false;
    }
    return true;
  }

  /** A seeded spot of grass well inside the paddock. */
  private grassIn(pd: Paddock, r: Rng): [number, number] {
    const [x0, z0, x1, z1] = polyBounds(pd.poly);
    for (let k = 0; k < 40; k++) {
      const x = r.range(x0, x1), z = r.range(z0, z1);
      if (this.inside(pd, x, z)) return [x, z];
    }
    return [(x0 + x1) / 2, (z0 + z1) / 2];
  }
}
