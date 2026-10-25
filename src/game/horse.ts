/**
 * Horses (pure, no three.js): a horse's body is a walker of its own (faster, wider, no jumping), which
 * the hero steers while riding and which stands, grazes and waits where it was left otherwise. Mounting
 * and dismounting are instant; the rider gets off on the horse's left, or wherever there is room.
 *
 * Plan 4.4/D: horses at about 12 m/s (milestone 5 travel). Yaw as the walker's: 0 faces north (−z).
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { Walker, type WalkIntent, type WalkSpec, type WalkWorld } from './walker';

/** A horse's body: gallop 12 m/s, walk 1.8 m/s; slow to speed up and to stop (it has weight). */
export const HORSE: WalkSpec = {
  run: 12,
  walk: 1.8,
  back: 0.25,
  swim: 1.6,
  swimSlow: 1,
  jump: 0,
  gravity: 9.81,
  height: 1.6,
  radius: 0.55,
  step: 0.5,
  snap: 0.6,
  maxSlope: 1.0,
  grip: 1.6,
};

/** How far from a horse (m, its middle to the hero's feet) the hero can get on. */
export const MOUNT_REACH = 2.6;
/** Turn rate (rad/s): quick at a walk, wider at a gallop. */
const TURN_SLOW = 2.4, TURN_FAST = 1.3;

export type HorseGait = 'idle' | 'walk' | 'trot' | 'gallop';

/** The gait that shows a ground speed (m/s). */
export function horseGait(speed: number): HorseGait {
  return speed < 0.2 ? 'idle' : speed < 2.6 ? 'walk' : speed < 6.5 ? 'trot' : 'gallop';
}

/** Whether (x, z) has room for a body of radius r (no wall, no water to swim in). */
export type FreeFn = (x: number, z: number, r: number) => boolean;

export class Steed {
  readonly walker: Walker;
  /** Ridden by the hero. */
  ridden = false;
  /** What it does standing (seeded): grazing or waiting. */
  readonly rest: 'idle' | 'eat';

  constructor(world: WalkWorld, readonly id: number, seed: number) {
    this.walker = new Walker(world, HORSE);
    this.rest = new Rng(deriveSeed(seed, `horse:${id}`)).chance(0.5) ? 'eat' : 'idle';
  }

  get pos(): { x: number; y: number; z: number } { return this.walker.pos; }
  get yaw(): number { return this.walker.yaw; }

  /** Ground speed (m/s). */
  get speed(): number { return Math.hypot(this.walker.vel.x, this.walker.vel.z); }

  /** What the body shows: its gait, or standing as it likes. */
  get gait(): HorseGait | 'eat' {
    const g = horseGait(this.speed);
    return g === 'idle' && !this.ridden ? this.rest : g;
  }

  /**
   * One step. Ridden, `intent` is the rider's (strafing turns the horse instead; it never jumps) and
   * `facing` where the rider wants to face: the horse turns toward it at its own rate. Otherwise it stands.
   */
  travel(dt: number, intent?: WalkIntent, facing?: number): void {
    const w = this.walker;
    if (!intent || !this.ridden) {
      w.step({ forward: 0, strafe: 0, heading: w.yaw, walk: true, up: false, down: false }, dt);
      return;
    }
    const rate = TURN_SLOW + (TURN_FAST - TURN_SLOW) * Math.min(1, this.speed / HORSE.run);
    let want = facing ?? w.yaw;
    want -= intent.strafe * rate * dt;
    let d = Math.atan2(Math.sin(want - w.yaw), Math.cos(want - w.yaw));
    d = Math.max(-rate * dt, Math.min(rate * dt, d));
    w.yaw += d;
    w.step({ forward: intent.forward, strafe: 0, heading: w.yaw, walk: intent.walk, up: false, down: false }, dt);
  }

  /** Where the rider stands after getting off: on the left, else the right, behind or in front. */
  dismountSpot(free: FreeFn): { x: number; z: number } {
    const { x, z } = this.pos, s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // The horse's left is (−cos, sin) in xz, forward (−sin, −cos).
    const tries: [number, number][] = [[-c * 1.3, s * 1.3], [c * 1.3, -s * 1.3], [s * 2, c * 2], [-s * 2.2, -c * 2.2], [-c * 2, s * 2], [c * 2, -s * 2]];
    for (const [dx, dz] of tries) if (free(x + dx, z + dz, 0.35)) return { x: x + dx, z: z + dz };
    return { x: x - c * 1.3, z: z + s * 1.3 };
  }
}

/** The horse nearest (x, z) within reach that nobody rides, or null. */
export function nearestSteed(steeds: readonly Steed[], x: number, z: number, reach = MOUNT_REACH): Steed | null {
  let best: Steed | null = null, bd = reach;
  for (const s of steeds) {
    if (s.ridden) continue;
    const d = Math.hypot(s.pos.x - x, s.pos.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/**
 * Where `count` horses wait near a point (the hero's start): side by side to its right, a few metres off,
 * all facing the same way, each where there is room (tried further out otherwise).
 */
export function horseSpots(x: number, z: number, yaw: number, count: number, free: FreeFn): { x: number; z: number; yaw: number }[] {
  const out: { x: number; z: number; yaw: number }[] = [];
  const s = Math.sin(yaw), c = Math.cos(yaw);
  // Right (cos, −sin), forward (−sin, −cos).
  for (let i = 0, k = 0; out.length < count && k < 40; k++) {
    const side = 5 + 2.2 * (k % 6), ahead = 2 + 3.2 * Math.floor(k / 6);
    const px = x + c * side - s * ahead, pz = z - s * side - c * ahead;
    if (!free(px, pz, HORSE.radius + 0.6)) continue;
    if (out.some((o) => Math.hypot(o.x - px, o.z - pz) < 2.6)) continue;
    // Standing across the hero's view, so the saddle shows.
    out.push({ x: px, z: pz, yaw: yaw + Math.PI / 2 + (i++ % 2) * 0.25 });
  }
  return out;
}
