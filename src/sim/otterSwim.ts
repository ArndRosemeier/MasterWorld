/**
 * How the hero's otter form swims (game/birdForm.ts, S6, D60): fast along the surface, diving deep and swimming under
 * water, rising again; on reaching the shallows it can do no more and the hero stands up out of it. Pure: the game
 * steers it each frame, the renderer reads `doing` for the otter's clips.
 */
import { angleDiff, clamp, damp } from '@futuremagic/core';
import type { FlightIntent, FlightWorld } from './birdFlight';

/** What the otter does, for its clips: lying at the surface, paddling along it, diving, swimming under. */
export type OtterDoing = 'float' | 'paddle' | 'dive' | 'swim';

/** What the player asks of the otter this frame (the hero camera's keys): a bird's, `land` here coming up to turn back. */
export type SwimIntent = FlightIntent;

/** How an otter swims (m/s, rad/s, m). */
export const SWIM = {
  fast: 6.5, slow: 2.4, under: 5.5, accel: 3,
  dive: 2.6, rise: 2.2, turn: 2.6,
  /**
   * Its origin under the surface while it lies on it (the mink's surface clips hang the body some 0.24 m under its
   * origin and hold the head some 0.22 m over it: head out, body just under); clear of the bottom by `bottom`.
   */
  surface: 0.02, bottom: 0.35,
  /** Water shallower than this is the shallows (it stands up there). */
  shallows: 0.7,
} as const;

export class OtterSwim {
  readonly pos = { x: 0, y: 0, z: 0 };
  readonly vel = { x: 0, y: 0, z: 0 };
  yaw = 0;
  /** Nose up (rad), for drawing. */
  pitch = 0;
  doing: OtterDoing = 'float';
  /** Out of breath: it comes up whatever is pressed (game/breath.ts). */
  surfacing = false;
  /**
   * How far it is under its line at the surface (m, 0: lying on it). Kept rather than its height, so an otter at the
   * surface rides the waves as the surface rises and falls under it.
   */
  sunk = 0;

  constructor(private readonly world: FlightWorld) {}

  /** The water's surface over it (null: none). */
  private surfaceAt(x = this.pos.x, z = this.pos.z): number | null {
    return this.world.waterLevel(x, z);
  }

  /** How deep the water is where it is (0: none). */
  private depth(x = this.pos.x, z = this.pos.z): number {
    const l = this.surfaceAt(x, z);
    return l === null ? 0 : Math.max(0, l - this.world.height(x, z));
  }

  /** Lying at the surface. */
  get surfaced(): boolean {
    return this.sunk < 0.05;
  }

  /** Its head under water (holding its breath). */
  get under(): boolean {
    return this.sunk > 0.25;
  }

  /** In the shallows: too little water to swim (the hero stands up). */
  get shallow(): boolean {
    return this.depth() < SWIM.shallows;
  }

  /** Where it can turn back into the hero: at the surface or in the shallows. */
  get grounded(): boolean {
    return this.surfaced || this.shallow;
  }

  /** Becomes the otter at (x, z), lying at the surface, facing `yaw`. */
  slipIn(x: number, z: number, yaw: number): void {
    const l = this.surfaceAt(x, z) ?? this.world.height(x, z);
    Object.assign(this.pos, { x, y: l - SWIM.surface, z });
    Object.assign(this.vel, { x: 0, y: 0, z: 0 });
    this.sunk = 0;
    this.yaw = yaw;
    this.pitch = 0;
    this.doing = 'float';
  }

  steer(i: SwimIntent, dt: number): void {
    dt = Math.min(dt, 0.1);
    const p = this.pos, v = this.vel;
    this.yaw += clamp(angleDiff(this.yaw, i.heading), -SWIM.turn * dt, SWIM.turn * dt);
    const under = this.under;
    // Ahead: fast along the surface, a little slower under it, slow when asked.
    const want = Math.max(0, i.forward) * (i.walk ? SWIM.slow : under ? SWIM.under : SWIM.fast);
    const sh = Math.sin(this.yaw), ch = Math.cos(this.yaw), k = damp(SWIM.accel, dt);
    v.x += (-sh * want - v.x) * k;
    v.z += (-ch * want - v.z) * k;
    // Down by choice; up by choice, to turn back, or slowly by itself (an otter floats up when it stops swimming down).
    const up = i.up || i.land || this.surfacing;
    const vy = i.down && !up ? -SWIM.dive : up ? SWIM.rise : under ? 0.35 : 0;
    v.y += (vy - v.y) * damp(4, dt);
    let nx = p.x + v.x * dt, nz = p.z + v.z * dt;
    // Not up onto dry land: it stops at the water's edge.
    if (this.surfaceAt(nx, nz) === null || this.depth(nx, nz) < 0.2) { nx = p.x; nz = p.z; v.x = v.z = 0; }
    p.x = nx; p.z = nz;
    // Its line at the surface (which waves move) and the bed under it bound how far down it is.
    const lid = (this.surfaceAt() ?? p.y + SWIM.surface) - SWIM.surface, floor = this.world.height(p.x, p.z) + SWIM.bottom;
    this.sunk = clamp(this.sunk - v.y * dt, 0, Math.max(0, lid - floor));
    if (this.sunk <= 0 && v.y > 0) v.y = 0;
    p.y = lid - this.sunk;
    const flat = Math.hypot(v.x, v.z);
    this.pitch += (Math.atan2(v.y, Math.max(0.5, flat)) - this.pitch) * damp(5, dt);
    this.doing = this.surfaced ? (i.down ? 'dive' : flat > 0.6 ? 'paddle' : 'float') : 'swim';
  }
}
