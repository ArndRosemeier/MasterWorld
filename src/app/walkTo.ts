/**
 * The hero walks a few steps on their own (render it, don't narrate it): into a barrow's dark passage before
 * the screen goes dark, and out of it onto the forecourt after. The keys move nothing meanwhile (Player.puppet).
 */
import { Vector3 } from 'three/webgpu';
import type { Shot } from './heroCamera';
import type { Puppet } from './player';

/** Walking pace (m/s). */
const PACE = 1.4;
/** The held shot looks at the hero's chest, this far over the feet (m). */
const CHEST = 1.2;

/**
 * One frame of walking `pos` up to `to` at `pace` (m/s; `vel` set to it): false once there (`vel` zeroed).
 * Shared by every scene that walks the hero somewhere (WalkTo, SearchKneel).
 */
export function walkOn(pos: { x: number; z: number }, vel: [number, number, number], to: { readonly x: number; readonly z: number }, pace: number, dt: number): boolean {
  const dx = to.x - pos.x, dz = to.z - pos.z, left = Math.hypot(dx, dz), s = Math.min(left, pace * dt);
  if (left <= 0.02) { vel[0] = 0; vel[1] = 0; vel[2] = 0; return false; }
  pos.x += (dx / left) * s; pos.z += (dz / left) * s;
  vel[0] = (dx / left) * pace; vel[1] = 0; vel[2] = (dz / left) * pace;
  return true;
}

export class WalkTo implements Puppet {
  readonly pose = null;
  readonly limbs = null;
  /** Seen from out in front of the doorway (null: the camera trails the hero as ever). */
  readonly shot: Shot | null;
  readonly clip = undefined;
  readonly pos: { x: number; y: number; z: number };
  readonly vel: [number, number, number] = [0, 0, 0];
  readonly yaw: number;
  walking = true;
  /** It has got there (the puppet can go). */
  done = false;

  constructor(
    from: { readonly x: number; readonly y: number; readonly z: number },
    private readonly to: { readonly x: number; readonly z: number },
    /** The ground's height (null: level, at `from`'s). */
    private readonly ground: ((x: number, z: number) => number) | null,
    /** Got there. */
    private readonly onThere: () => void,
    /** A held shot round this spot (a doorway's forecourt, world), from out in front (`front`: its unit facing). */
    seen: { readonly round: { readonly x: number; readonly y: number; readonly z: number }; readonly front: readonly [number, number] } | null = null,
  ) {
    this.pos = { x: from.x, y: from.y, z: from.z };
    const [fx, fz] = seen?.front ?? [0, 0];
    // Seen from the front: the further round behind the doorway (into the mound or rock), the worse.
    this.shot = seen && { round: new Vector3(seen.round.x, seen.round.y, seen.round.z), at: new Vector3(from.x, from.y + CHEST, from.z), cost: (dx, dz) => (1 - (dx * fx + dz * fz)) * 4 };
    // Facing where it goes (a walker's yaw: forward is (-sin, -cos)).
    this.yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
  }

  step(dt: number): void {
    if (this.done) return;
    if (walkOn(this.pos, this.vel, this.to, PACE, dt)) {
      if (this.ground) this.pos.y = this.ground(this.pos.x, this.pos.z);
      this.shot?.at.set(this.pos.x, this.pos.y + CHEST, this.pos.z);
      return;
    }
    this.walking = false;
    this.done = true;
    this.onThere();
  }
}
