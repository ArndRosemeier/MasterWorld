/**
 * A search played out, not told (render it, don't narrate it): G by the fallen or a chest, and the hero
 * steps up to it, turns to it and kneels; a chest's lid lifts meanwhile. What was found comes once the
 * hands are in (its cards), and the hero gets up again. The keys move nothing meanwhile (Player.puppet). The
 * same kneel, longer, sees to a hurt traveller's wound out on the land.
 */
import { smoothstep } from '@futuremagic/core';
import type { Puppet } from './player';
import { walkOn } from './walkTo';

/** The hero kneels this far from what they search (m): a body's middle, a chest's front. */
const KNEEL_AT = 0.75;
/** Walking pace up to it (m/s). */
const STEP = 1.3;
/** The kneel (s): down, the hands in, up again; what was found comes at FOUND_AT. */
const KNEEL_FOR = 1.5, FOUND_AT = 0.95;
/** The lid lifts over this part of the kneel (s). */
const LID_FROM = 0.3, LID_TO = 0.85;
/** How fast the hero turns to it (rad/s). */
const TURN = 7;

export class SearchKneel implements Puppet {
  readonly pose = null;
  readonly limbs = null;
  readonly shot = null;
  readonly pos: { x: number; y: number; z: number };
  readonly vel: [number, number, number] = [0, 0, 0];
  yaw: number;
  walking = true;
  clip: string | undefined = undefined;
  /** Its kneel has played (the puppet can go). */
  done = false;
  private t = -1;
  private found = false;
  private readonly to: { x: number; z: number };

  constructor(
    from: { readonly x: number; readonly y: number; readonly z: number },
    yaw: number,
    /** What is searched (its middle, on the floor). */
    private readonly at: { readonly x: number; readonly z: number },
    /** A chest's lid lifted by k (0 shut, 1 open); null: a body. */
    private readonly lid: ((k: number) => void) | null,
    /** The hands are in: take what is there. */
    private readonly onFound: () => void,
    /** Where to kneel (a chest's front); else on the line from the hero to it, KNEEL_AT short of it (where the hero is, if nearer). */
    kneelAt?: { readonly x: number; readonly z: number },
    /** How long the hands are busy (s; none: a search's quick look), and the ground out on the land (none: a level floor). */
    private readonly o: { readonly busy?: number; readonly ground?: (x: number, z: number) => number; readonly up?: () => void } = {},
  ) {
    this.pos = { x: from.x, y: from.y, z: from.z };
    this.yaw = yaw;
    const dx = at.x - from.x, dz = at.z - from.z, d = Math.hypot(dx, dz) || 1, k = Math.max(0, d - KNEEL_AT) / d;
    this.to = kneelAt ? { x: kneelAt.x, z: kneelAt.z } : { x: from.x + dx * k, z: from.z + dz * k };
  }

  step(dt: number): void {
    if (this.done) return;
    // Turn to it the whole while (a walker's yaw: forward is (-sin, -cos)).
    const want = Math.atan2(-(this.at.x - this.pos.x), -(this.at.z - this.pos.z));
    const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
    if (this.t < 0) {
      // Up to it at walking pace.
      const on = walkOn(this.pos, this.vel, this.to, STEP, dt);
      if (this.o.ground) this.pos.y = this.o.ground(this.pos.x, this.pos.z);
      if (on) return;
      this.t = 0;
      this.walking = false;
      this.clip = 'crouch';
    }
    this.t += dt;
    this.lid?.(smoothstep(LID_FROM, LID_TO, this.t));
    const busy = this.o.busy ?? KNEEL_FOR;
    if (!this.found && this.t >= busy - (KNEEL_FOR - FOUND_AT)) { this.found = true; this.onFound(); }
    if (this.t >= busy) { this.clip = undefined; this.done = true; this.o.up?.(); }
  }
}
