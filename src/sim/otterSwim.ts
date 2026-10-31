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
  /** The body's middle under the surface while it lies on it; clear of the bottom by this. */
  surface: 0.18, bottom: 0.35,
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
    const l = this.surfaceAt();
    return l !== null && this.pos.y >= l - SWIM.surface - 0.05;
  }

  /** Its head under water (holding its breath). */
  get under(): boolean {
    const l = this.surfaceAt();
    return l !== null && this.pos.y < l - SWIM.surface - 0.25;
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
    this.yaw = yaw;
    this.pitch = 0;
    this.doing = 'float';
  }

  steer(i: SwimIntent, dt: number): void {
    dt = Math.min(dt, 0.1);
    const p = this.pos, v = this.vel, l = this.surfaceAt();
    this.yaw += clamp(angleDiff(this.yaw, i.heading), -SWIM.turn * dt, SWIM.turn * dt);
    const under = this.under, top = (l ?? p.y) - SWIM.surface;
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
    const floor = this.world.height(p.x, p.z) + SWIM.bottom, lid = (this.surfaceAt() ?? top) - SWIM.surface;
    p.y = clamp(p.y + v.y * dt, Math.min(floor, lid), lid);
    if (p.y >= lid - 1e-3 && v.y > 0) v.y = 0;
    const flat = Math.hypot(v.x, v.z);
    this.pitch += (Math.atan2(v.y, Math.max(0.5, flat)) - this.pitch) * damp(5, dt);
    this.doing = this.surfaced ? (i.down ? 'dive' : flat > 0.6 ? 'paddle' : 'float') : 'swim';
  }
}
