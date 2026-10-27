/**
 * How the hero's bird form moves (game/birdForm.ts, plan 10): it walks and runs on the ground, takes off with a
 * leap, flaps on, glides and sinks, dives, banks into turns and lands on dry ground (over water it skims along).
 * Pure: the game steers it each frame, the renderer reads `doing` for the bird's clips.
 */
import { angleDiff, clamp, damp } from '@futuremagic/core';

/** What the player asks of the bird this frame (from the hero camera's keys and mouse). */
export interface FlightIntent {
  /** Forward (+1), slow (−1). */
  readonly forward: number;
  /** Which way to head (rad, the walker's yaw: 0 faces −z). */
  readonly heading: number;
  /** Climb (on the ground: take off). */
  readonly up: boolean;
  /** Dive. */
  readonly down: boolean;
  /** Walk (on the ground, instead of running). */
  readonly walk: boolean;
  /** Glide down to land (turning back). */
  readonly land: boolean;
}

/** The land under the bird. */
export interface FlightWorld {
  height(x: number, z: number): number;
  waterLevel(x: number, z: number): number | null;
  /** Walls (buildings): does a body of radius `r` at (x, z) touch one? */
  wall?(x: number, z: number, r: number): boolean;
}

/** What the bird does, for its clips. */
export type BirdDoing = 'idle' | 'walk' | 'run' | 'takeoff' | 'flap' | 'glide' | 'dive' | 'land';

/** How a bird flies (m/s, m/s², rad/s, m). */
export const FLIGHT = {
  walk: 1.2, run: 3.2,
  /** Speeds in the air: flapping ahead, gliding, held back. */
  fast: 15, glide: 10, slow: 6,
  accel: 5,
  /** Climbing, sinking in a glide, diving, coming down to land. */
  climb: 5, sink: 1.4, dive: 10, settle: 3.5,
  turn: 1.8, groundTurn: 4,
  /** Highest above the ground, lowest above water; a take-off's first leap. */
  ceiling: 260, overWater: 0.6, leap: 4,
  /** The bird's radius against walls. */
  radius: 0.3,
  /** Seconds a take-off and a landing show. */
  takeoff: 0.9, touch: 0.8,
} as const;

export class BirdFlight {
  readonly pos = { x: 0, y: 0, z: 0 };
  /** Velocity, world m/s. */
  readonly vel = { x: 0, y: 0, z: 0 };
  yaw = 0;
  /** Banked into a turn (rad, + to the right), and nose up (rad), for drawing. */
  bank = 0;
  pitch = 0;
  grounded = true;
  doing: BirdDoing = 'idle';
  /** Seconds left of a take-off or a landing's show. */
  private hold = 0;
  private speed = 0;

  constructor(private readonly world: FlightWorld) {}

  /** Stand on the ground at (x, z), facing `yaw`. */
  perch(x: number, z: number, yaw: number): void {
    this.pos.x = x; this.pos.z = z;
    this.pos.y = this.floor(x, z);
    this.yaw = yaw;
    this.grounded = true;
    this.speed = 0;
    this.vel.x = this.vel.y = this.vel.z = 0;
    this.doing = 'idle';
    this.hold = 0;
  }

  /** The ground (or water) the bird would stand on at (x, z). */
  floor(x: number, z: number): number {
    const g = this.world.height(x, z), w = this.world.waterLevel(x, z);
    return w !== null && w > g ? w + FLIGHT.overWater : g;
  }

  /** Over water (it cannot land there). */
  private wet(x: number, z: number): boolean {
    const w = this.world.waterLevel(x, z);
    return w !== null && w > this.world.height(x, z);
  }

  get overGround(): number { return Math.hypot(this.vel.x, this.vel.z); }

  steer(i: FlightIntent, dt: number): void {
    this.hold = Math.max(0, this.hold - dt);
    const turnRate = this.grounded ? FLIGHT.groundTurn : FLIGHT.turn;
    const d = angleDiff(this.yaw, i.heading), turn = clamp(d, -turnRate * dt, turnRate * dt);
    this.yaw += turn;
    if (this.grounded) this.afoot(i, dt);
    else this.airborne(i, dt, turn / Math.max(dt, 1e-4));
    // Walls (buildings): the move is undone, along each axis on its own so the bird slides past.
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const walled = (x: number, z: number) => !!this.world.wall && this.pos.y < this.world.height(x, z) + 12 && this.world.wall(x, z, FLIGHT.radius);
    if (!walled(nx, this.pos.z)) this.pos.x = nx; else this.vel.x = 0;
    if (!walled(this.pos.x, nz)) this.pos.z = nz; else this.vel.z = 0;
    const floor = this.floor(this.pos.x, this.pos.z);
    if (this.grounded) { this.pos.y = floor; return; }
    this.pos.y = Math.min(this.pos.y + this.vel.y * dt, floor + FLIGHT.ceiling);
    if (this.pos.y > floor) return;
    this.pos.y = floor;
    // Down on dry ground (and not climbing away): it lands. Over water it skims along.
    if (!this.wet(this.pos.x, this.pos.z) && !i.up) {
      this.grounded = true;
      this.vel.y = 0;
      this.speed = Math.min(this.speed, FLIGHT.run);
      this.doing = 'land';
      this.hold = FLIGHT.touch;
    } else this.vel.y = Math.max(0, this.vel.y);
  }

  private afoot(i: FlightIntent, dt: number): void {
    if (i.up && !i.land) {
      // Off the ground: a leap and the first beats.
      this.grounded = false;
      this.vel.y = FLIGHT.leap;
      this.speed = Math.max(this.speed, FLIGHT.slow);
      this.doing = 'takeoff';
      this.hold = FLIGHT.takeoff;
      this.ahead();
      return;
    }
    const want = i.forward > 0 ? (i.walk ? FLIGHT.walk : FLIGHT.run) : i.forward < 0 ? -FLIGHT.walk * 0.6 : 0;
    this.speed += (want - this.speed) * damp(8, dt);
    this.ahead();
    this.vel.y = 0;
    this.bank = this.pitch = 0;
    if (this.hold > 0) return;
    const s = Math.abs(this.speed);
    this.doing = s < 0.15 ? 'idle' : s > (FLIGHT.walk + FLIGHT.run) / 2 ? 'run' : 'walk';
  }

  private airborne(i: FlightIntent, dt: number, turning: number): void {
    const want = i.land ? FLIGHT.slow : i.forward > 0 ? FLIGHT.fast : i.forward < 0 ? FLIGHT.slow : FLIGHT.glide;
    this.speed += clamp(want - this.speed, -FLIGHT.accel * dt, FLIGHT.accel * dt);
    this.ahead();
    const up = i.land ? -FLIGHT.settle : i.up ? FLIGHT.climb : i.down ? -FLIGHT.dive : i.forward > 0 ? 0 : -FLIGHT.sink;
    this.vel.y += (up - this.vel.y) * damp(3, dt);
    this.bank += (clamp(-turning * 0.35, -0.7, 0.7) - this.bank) * damp(4, dt);
    this.pitch = Math.atan2(this.vel.y, Math.max(1, this.speed)) * 0.8;
    if (this.hold > 0) return;
    this.doing = i.down && !i.land ? 'dive' : i.up || i.forward > 0 || this.vel.y > 0.5 ? 'flap' : 'glide';
  }

  private ahead(): void {
    this.vel.x = -Math.sin(this.yaw) * this.speed;
    this.vel.z = -Math.cos(this.yaw) * this.speed;
  }
}
