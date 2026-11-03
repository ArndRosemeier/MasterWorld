/**
 * The hero seen climbing rock (D56, rule 11): hand over hand up, down and along a face while the walker is
 * on it (game/walker.ts, mode `climb`), and the pull-up over its top (`pull`). The climb is a motion-capture cycle
 * (CLIMB_CUTS: a ladder take of the CMU library, cut by `npm run packs`) played as fast as the body rises, backwards
 * going down, so a foot stays on its hold; the rock has no rungs, so hands and feet are laid on the face (the clip
 * climbs a leaning ladder). The pull-up is @futuremagic/figure's ledge, its puppet.
 */
import { LadderClimb, type Climber } from '@futuremagic/figure';
import type { Walker } from '../game/walker';
import type { HeroPuppet } from '../render/hero/HeroView';
import { CLIMB_CUTS } from '../render/hero/clips';

/** The face is this far in front of the walker's body (game/walker.ts OFF_FACE). */
const FACE = 0.35;
/** How far in front of the face the hips hang, hands and feet on it (m, for a body with hips at the pack's height). */
const HIPS = 0.36;
/** How far in front of the face the hands and the feet (their ankles) are held (m, for the same body). */
const HAND = 0.03;
const FOOT = 0.13;
/** The pack body's hip height (m): the cycle's measures are scaled from it to the hero's. */
const PACK_HIP = 0.89;
/** A body shorter in the hips than this climbs as if it had them so (m): a halfling's steps are not a quarter of a rung. */
const MIN_HIP = 0.65;
/** Seconds over which the speed the cycle is played at follows the body's (the walker moves in steps). */
const SMOOTH = 0.08;
/** Along the face counts this much of its length as climbing (a shuffle sideways, hand over hand). */
const ALONG = 0.3;
/** Seconds to take hold of the face (the hands and feet onto it, the body in) and to let the ledge puppet take over. */
const GRAB = 0.25;
const HAND_OFF = 0.3;

type P3 = { x: number; y: number; z: number };

export class ClimbPose {
  private readonly climb = new LadderClimb();
  private pulling = false;
  private last: P3 | null = null;
  private v = 0;
  /** How far the grip has taken (0..1), and the seconds since the pull began. */
  private grip = 0;
  private pullT = 0;
  private readonly from: P3 = { x: 0, y: 0, z: 0 };
  private readonly at: P3 = { x: 0, y: 0, z: 0 };
  /** Where the body was drawn before taking hold (the walker's jump onto the face is eased from there), and the gap left to close. */
  private ground: P3 | null = null;
  private readonly grab: P3 = { x: 0, y: 0, z: 0 };
  /** The ledge puppet's first frame still to come, and the gap between where the climb left the body and where it starts. */
  private advanceFirst = false;
  private readonly gap: P3 = { x: 0, y: 0, z: 0 };
  private readonly cycle = { v: 0, rise: 1 };
  private readonly wall = { x: 0, z: 0, nx: 0, nz: 0, w: 0, hand: HAND, foot: FOOT };
  /** The puppet for the cycle: no pose over the clip, hands and feet laid on the wall; the clip is the climb. */
  private readonly puppet: HeroPuppet = { pose: null, limbs: null, clip: CLIMB_CUTS[0].clip, climbRate: this.cycle, wall: this.wall };

  /** The body is on the ground (not on a face) at `p` this frame: where a grab starts from. */
  onGround(p: P3): void {
    this.ground = this.ground ?? { x: 0, y: 0, z: 0 };
    this.ground.x = p.x; this.ground.y = p.y; this.ground.z = p.z;
  }

  /** This frame's pose for a walker on a face (and where the body goes), or null when it is not on one. */
  onFace(w: Walker, body: Climber, dt: number): { readonly puppet: HeroPuppet; readonly pos: P3; readonly yaw: number } | null {
    const F = w.face, p = w.pos;
    if (w.mode === 'climb') {
      this.pulling = false;
      if (this.grip === 0 && this.ground) { this.grab.x = this.ground.x - p.x; this.grab.y = this.ground.y - p.y; this.grab.z = this.ground.z - p.z; }
      this.ground = null;
      this.grip = Math.min(1, this.grip + dt / GRAB);
      const e = this.grip * this.grip * (3 - 2 * this.grip);
      // How fast it climbs now (up: positive), smoothed, along the face counted in part.
      const last = this.last;
      if (last && dt > 1e-4) {
        const along = Math.abs((p.x - last.x) * -F.nz + (p.z - last.z) * F.nx);
        const v = ((p.y - last.y) + along * ALONG * Math.sign(p.y - last.y || 1)) / dt;
        this.v += (v - this.v) * (1 - Math.exp(-dt / SMOOTH));
      }
      this.last = { x: p.x, y: p.y, z: p.z };
      // The cycle's metres: its rise in hip heights, for this body's hips.
      this.cycle.v = this.v;
      this.cycle.rise = CLIMB_CUTS[0].rise * Math.max(body.hipHeight, MIN_HIP);
      const k = body.hipHeight / PACK_HIP, back = (FACE - HIPS * k) * e;
      const wall = this.wall;
      wall.x = p.x + F.nx * FACE; wall.z = p.z + F.nz * FACE; wall.nx = F.nx; wall.nz = F.nz; wall.w = e;
      // The walker jumps onto the face at the grab (up, and in): the body comes from where it stood.
      const rest = 1 - e;
      this.from.x = p.x + F.nx * back + this.grab.x * rest; this.from.y = p.y + this.grab.y * rest; this.from.z = p.z + F.nz * back + this.grab.z * rest;
      return { puppet: this.puppet, pos: this.from, yaw: w.yaw };
    }
    this.grip = 0;
    this.last = null;
    this.v = 0;
    if (w.mode === 'pull') {
      const q = w.pull;
      if (!this.pulling) {
        this.pulling = true;
        this.pullT = 0;
        const ex = q.x0 + F.nx * FACE, ez = q.z0 + F.nz * FACE;
        this.climb.play([{ kind: 'ledge', ledge: { x: ex, z: ez, nx: F.nx, nz: F.nz, floor: q.y1 }, feet: q.y0 }], q.x0, q.y0, q.z0, w.yaw, body);
        // Where the climb left the body, to ease from.
        const k = body.hipHeight / PACK_HIP;
        this.at.x = q.x0 + F.nx * (FACE - HIPS * k); this.at.y = q.y0; this.at.z = q.z0 + F.nz * (FACE - HIPS * k);
        this.advanceFirst = true;
      }
      this.climb.advance(dt);
      this.pullT += dt;
      if (this.climb.active) {
        const c = this.climb.pos;
        if (this.advanceFirst) { this.advanceFirst = false; this.gap.x = this.at.x - c.x; this.gap.y = this.at.y - c.y; this.gap.z = this.at.z - c.z; }
        const e = Math.max(0, 1 - this.pullT / HAND_OFF), s = e * e * (3 - 2 * e);
        this.from.x = c.x + this.gap.x * s; this.from.y = c.y + this.gap.y * s; this.from.z = c.z + this.gap.z * s;
        return { puppet: this.climb, pos: this.from, yaw: this.climb.yaw };
      }
    }
    this.pulling = false;
    return null;
  }
}
