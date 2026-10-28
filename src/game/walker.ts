/**
 * The player's body in the world (pure, no three.js): walking on the height field and over rock volumes,
 * blocked by rock walls and slopes too steep to climb, jumping and falling, wading and swimming. The
 * input says where the player wants to go; the walker decides where the body ends up.
 *
 * Facing (`yaw`) follows the humanoid's convention: the model's −z turned by yaw about +y, so yaw 0 faces
 * north (−z) and yaw π/2 faces west (−x).
 */
import { clamp, damp } from '@futuremagic/core';

/** What the walker needs to know of the world around it. */
export interface WalkWorld {
  /** Height field ground, metres. */
  height(x: number, z: number): number;
  /** Rock volumes with their ground as a signed distance (positive in air); null away from them. */
  rockSurface(x: number, y: number, z: number): number | null;
  /** Calm water surface level here, or null where there is no water. */
  waterLevel(x: number, z: number): number | null;
  /** Built floors to stand on (steps, porches), world y, or null: climbed a step at a time, unlike a steep slope. */
  floor?(x: number, z: number): number | null;
  /** What the camera keeps clear of, if not `rockSurface` (a building one is in: its doorway shut too, so the camera stays in the room). */
  sightSurface?(x: number, y: number, z: number): number | null;
  /** Walls (buildings, furniture): does a body of radius `r` at (x, z), its feet at `y` (the storey it is on), touch one? */
  wall?(x: number, z: number, r: number, y?: number): boolean;
}

/** What the player wants this frame. */
export interface WalkIntent {
  /** Forward (+1) and back (−1), relative to `heading`. */
  forward: number;
  /** Right (+1) and left (−1). */
  strafe: number;
  /** Which way "forward" is (rad, the yaw convention above): usually the facing. */
  heading: number;
  /** Walk instead of run. */
  walk: boolean;
  /** Jump on land; rise while swimming. */
  up: boolean;
  /** Dive while swimming. */
  down: boolean;
  /** How much of its speed the ground lets it make (0..1; a horse off the road). Default 1. */
  pace?: number;
}

export type WalkMode = 'ground' | 'air' | 'swim';

/** Speeds (m/s) and the body of something that walks (the hero's, a horse's in game/horse.ts). */
export interface WalkSpec {
  run: number; walk: number; back: number; swim: number; swimSlow: number; jump: number; gravity: number;
  height: number; radius: number; step: number; snap: number; maxSlope: number;
  /** How quickly the speed answers the input on the ground (1/s). */
  grip: number;
}

/** The hero's. */
export const WALK: WalkSpec = {
  run: 5.2,
  walk: 1.7,
  /** Backwards is slower. */
  back: 0.6,
  swim: 2.3,
  swimSlow: 1.1,
  jump: 4.6,
  gravity: 9.81,
  /** Height of the body, metres (the hero sets its own). */
  height: 1.78,
  radius: 0.32,
  /** Steps up to this high are walked; drops up to `snap` are followed without falling. */
  step: 0.45,
  snap: 0.5,
  /** Ground steeper than this (rise over run) cannot be walked up. */
  maxSlope: 1.25,
  grip: 12,
};

export class Walker {
  readonly pos = { x: 0, y: 0, z: 0 };
  readonly vel = { x: 0, y: 0, z: 0 };
  /** Facing (rad). */
  yaw = 0;
  mode: WalkMode = 'ground';
  /** Body height, metres. */
  height: number;
  /** How long (s) the body has been asked to walk on the ground and has not got anywhere. */
  stuckFor = 0;

  constructor(private readonly world: WalkWorld, readonly spec: WalkSpec = WALK) {
    this.height = spec.height;
  }

  /** Stand at a point, on whatever ground is there (or float, in deep water). */
  place(x: number, z: number, y?: number): void {
    const g = this.support(x, z, y ?? 1e5);
    this.pos.x = x; this.pos.z = z; this.pos.y = y ?? g;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.stuckFor = 0;
    this.mode = this.pos.y > g + 0.05 ? 'air' : 'ground';
    this.settleInWater();
  }

  /**
   * The ground under a point: the height field, or the top of rock found going down from a step above
   * `y` (so the walker can stand on an arch and walk under it).
   */
  support(x: number, z: number, y: number): number {
    const h = Math.max(this.world.height(x, z), this.world.floor?.(x, z) ?? -Infinity);
    let s = y + this.spec.step;
    if (s <= h) return h;
    for (let i = 0; i < 48; i++) {
      const d = this.world.rockSurface(x, s, z);
      if (d === null) return h;
      if (d < 0.03) return Math.max(h, s - d);
      s -= Math.max(0.03, d * 0.9);
      if (s <= h) return h;
    }
    return Math.max(h, s);
  }

  /** Whether a built floor at (x, z) stands over the height field there (one walks on it, not on the land below). */
  private onFloor(x: number, z: number): boolean {
    const f = this.world.floor?.(x, z) ?? null;
    return f !== null && f >= this.world.height(x, z);
  }

  /** Whether the body would be in rock at (x, z) with its feet at y. */
  private blocked(x: number, y: number, z: number): boolean {
    const r = this.spec.radius;
    if (this.world.wall?.(x, z, r, y)) return true;
    for (const k of [0.75, 1.3, this.height - r]) {
      const d = this.world.rockSurface(x, y + k, z);
      if (d !== null && d < r) return true;
    }
    return false;
  }

  /** Where the water surface is, if the body is in it deep enough to swim; else null. */
  private swimLevel(x: number, z: number, feet: number): number | null {
    const w = this.world.waterLevel(x, z);
    return w !== null && w > feet + this.height * 0.6 ? w : null;
  }

  /** The feet's height when floating at the surface (treading water, the head out; swimming, the back at the surface). */
  private floatAt(level: number): number {
    return level - this.height * 0.56;
  }

  private settleInWater(): void {
    const w = this.swimLevel(this.pos.x, this.pos.z, this.pos.y);
    if (w !== null) {
      this.mode = 'swim';
      this.pos.y = Math.max(this.pos.y, this.floatAt(w));
    }
  }

  step(intent: WalkIntent, dt: number): void {
    dt = Math.min(dt, 0.1);
    const p = this.pos, v = this.vel;
    const swim = this.mode === 'swim';
    // What the input asks for, in world xz.
    const sh = Math.sin(intent.heading), ch = Math.cos(intent.heading);
    let fx = -sh * intent.forward + ch * intent.strafe, fz = -ch * intent.forward - sh * intent.strafe;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const speed = (swim ? (intent.walk ? this.spec.swimSlow : this.spec.swim) : intent.walk ? this.spec.walk : this.spec.run) * (intent.forward < 0 ? this.spec.back : 1) * (intent.pace ?? 1);
    // Quick to answer on the ground, slow to change course in the air, smooth in the water.
    const a = damp(this.mode === 'ground' ? this.spec.grip : swim ? 3.5 : 1.2, dt);
    v.x += (fx * speed - v.x) * a;
    v.z += (fz * speed - v.z) * a;

    // Across: blocked by rock (try each axis alone, to slide along a wall) and by too steep a slope. A body
    // already in something (placed against a tree) may move, so it can walk out.
    const stuck = this.blocked(p.x, p.y, p.z);
    const tryMove = (nx: number, nz: number): boolean => {
      // Going down a step the body sinks as it moves on, so the head is tested at the lower floor too
      // (else a tall body under a low edge climbs a stair it can never come down again).
      if (!stuck && this.blocked(nx, p.y, nz)) {
        // The floor a body's width ahead: the step down it is about to take.
        const run = Math.hypot(nx - p.x, nz - p.z), k = run > 1e-6 ? this.spec.radius / run : 0;
        const ahead = this.mode === 'ground' ? this.support(nx + (nx - p.x) * k, nz + (nz - p.z) * k, p.y) : p.y;
        if (ahead >= p.y - 1e-3) return false;
        // Sinking up to a step (not into the step ahead's own block, nor deeper than the floor ahead).
        const low = Math.max(ahead, p.y - this.spec.step);
        if ([this.support(nx, nz, p.y), (p.y + low) / 2, low].every((y) => y >= p.y - 1e-3 || this.blocked(nx, y, nz))) return false;
      }
      if (this.mode === 'ground') {
        const run = Math.hypot(nx - p.x, nz - p.z);
        const rise = this.support(nx, nz, p.y) - p.y;
        if (run > 1e-6 && rise > this.spec.step && rise / run > this.spec.maxSlope) return false;
        // The height field alone is too steep here (a step up of slope, not a ledge), unless a floor stands
        // over it (a bridge's deck over a brook's steep bank).
        const hf = this.world.height(nx, nz) - this.world.height(p.x, p.z);
        if (run > 1e-6 && hf > 0 && hf / run > this.spec.maxSlope && this.world.rockSurface(nx, p.y, nz) === null && !this.onFloor(nx, nz)) return false;
      }
      p.x = nx; p.z = nz;
      return true;
    };
    const nx = p.x + v.x * dt, nz = p.z + v.z * dt, x0 = p.x, z0 = p.z;
    if (!tryMove(nx, nz)) {
      if (tryMove(nx, p.z)) v.z = 0;
      else if (tryMove(p.x, nz)) v.x = 0;
      else { v.x = 0; v.z = 0; }
    }
    const asked = this.mode === 'ground' && len > 0.3;
    this.stuckFor = asked && Math.hypot(p.x - x0, p.z - z0) < speed * len * dt * 0.1 ? this.stuckFor + dt : 0;

    // Up and down.
    const ground = this.support(p.x, p.z, p.y);
    if (this.mode === 'ground') {
      if (intent.up) { v.y = this.spec.jump; this.mode = 'air'; }
      else if (ground >= p.y - this.spec.snap) { p.y = ground; v.y = 0; }
      else this.mode = 'air';
    }
    if (this.mode === 'air') {
      v.y -= this.spec.gravity * dt;
      const ny = p.y + v.y * dt;
      // The head stops at rock above.
      const above = this.world.rockSurface(p.x, ny + this.height, p.z);
      if (v.y > 0 && above !== null && above < 0.1) v.y = 0;
      else p.y = ny;
      if (p.y <= ground) { p.y = ground; v.y = 0; this.mode = 'ground'; }
    }
    const level = this.world.waterLevel(p.x, p.z);
    if (this.mode !== 'swim') {
      const w = this.swimLevel(p.x, p.z, p.y);
      if (w !== null) { this.mode = 'swim'; v.y *= 0.3; }
    } else {
      const top = level === null ? -Infinity : this.floatAt(level);
      // Up and down by choice; otherwise the body floats up to the surface.
      const want = intent.up ? 1.4 : intent.down ? -1.4 : p.y < top - 0.05 ? 0.8 : 0;
      v.y += (want - v.y) * damp(4, dt);
      p.y = Math.min(top, p.y + v.y * dt);
      if (p.y <= ground) { p.y = ground; v.y = Math.max(0, v.y); }
      // Out of the water once the ground is high enough to wade.
      if (level === null || ground > level - this.height * 0.55) { this.mode = 'ground'; p.y = Math.max(p.y, ground); v.y = 0; }
    }
    v.y = clamp(v.y, -50, 20);
  }

  /** The gait for the animator. */
  /** Speed over the ground, m/s. */
  get groundSpeed(): number { return Math.hypot(this.vel.x, this.vel.z); }

  get gait(): 'idle' | 'walk' | 'run' | 'swim' | 'jump' | 'fall' {
    if (this.mode === 'swim') return 'swim';
    if (this.mode === 'air') return this.vel.y > 0 ? 'jump' : 'fall';
    const hs = Math.hypot(this.vel.x, this.vel.z);
    return hs < 0.15 ? 'idle' : hs < 2.6 ? 'walk' : 'run';
  }
}
