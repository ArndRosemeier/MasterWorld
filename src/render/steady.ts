/**
 * Anti-jitter for every body a sim moves (Arnd 2026-10-28: creatures and townsfolk alike). The sims may step a
 * body back and forth by a hand's breadth (pushed apart, closing to reach, turning to the hero each step); what
 * is drawn follows them smoothly: the place and the facing eased, the pace an eased speed, and a new loop clip
 * shown only once the sim has wanted it a moment (a blow, a flinch or a fall show at once). Pure.
 */
import { damp, lerpAngle } from '@futuremagic/core';

/** How fast the drawn body catches up (1/s): the place, the height (stairs, a hop) and the facing. */
const FOLLOW = { place: 22, height: 30, turn: 12 } as const;
/** A jump farther than this (m) is a new place (a load, a door), not a step: it is taken at once. */
const SNAP = 3;
/** The pace is eased this fast (1/s). */
const PACE = 7;
/** A loop clip shows once wanted this long (s). */
const HOLD = 0.2;

export class Steady {
  x = 0;
  y = 0;
  z = 0;
  yaw = 0;
  /** The eased velocity (m/s) of what is drawn, and its speed. */
  vx = 0;
  vz = 0;
  get pace(): number { return Math.hypot(this.vx, this.vz); }
  private on = false;

  /** Follow the sim's body at (x, y, z) facing `yaw` for `dt` seconds. */
  ease(dt: number, x: number, y: number, z: number, yaw: number): this {
    if (!this.on || dt <= 0 || Math.hypot(x - this.x, z - this.z) > SNAP) {
      this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.vx = 0; this.vz = 0;
      this.on = true;
      return this;
    }
    const px = this.x, pz = this.z, k = damp(FOLLOW.place, dt);
    this.x += (x - this.x) * k;
    this.z += (z - this.z) * k;
    this.y += (y - this.y) * damp(FOLLOW.height, dt);
    this.yaw = lerpAngle(this.yaw, yaw, damp(FOLLOW.turn, dt));
    const kp = damp(PACE, dt);
    this.vx += ((this.x - px) / dt - this.vx) * kp;
    this.vz += ((this.z - pz) / dt - this.vz) * kp;
    return this;
  }
}

/** A clip (or any look) that changes only once the new one has been wanted HOLD seconds, unless `now`. */
export class Held<T> {
  private want: T;
  private since = 0;

  constructor(public shown: T) { this.want = shown; }

  pick(dt: number, want: T, now = false): T {
    if (now || want === this.shown) { this.shown = want; this.want = want; this.since = 0; return want; }
    if (want !== this.want) { this.want = want; this.since = 0; }
    this.since += dt;
    if (this.since >= HOLD) this.shown = want;
    return this.shown;
  }
}
