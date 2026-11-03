/**
 * The hero seen climbing rock (D56, rule 11): hand over hand up, down and along a face while the walker is
 * on it (game/walker.ts, mode `climb`), and the pull-up over its top (`pull`). The climb is a motion-capture cycle
 * (CLIMB_CUTS: a ladder take of the CMU library, cut by `npm run packs`) played as fast as the body rises, backwards
 * going down, so a foot stays on its hold; the pull-up is @futuremagic/figure's ledge, its puppet.
 */
import { LadderClimb, type Climber } from '@futuremagic/figure';
import type { Walker } from '../game/walker';
import type { HeroPuppet } from '../render/hero/HeroView';
import { CLIMB_CUTS } from '../render/hero/clips';

/** Where the holds are: the face is this far in front of the walker's body (game/walker.ts OFF_FACE). */
const FACE = 0.35;
/** How far in front of its hips the cycle's hands take hold (m, for the pack's body: hip height 0.89), as the pack step measures. */
const HANDS = 0.5;
/** The pack body's hip height (m): the cycle's measures are scaled from it to the hero's. */
const PACK_HIP = 0.89;
/** Seconds over which the speed the cycle is played at follows the body's (the walker moves in steps). */
const SMOOTH = 0.08;
/** Sideways along the face counts this much of its length as climbing (a shuffle along it, hand over hand). */
const ALONG = 0.5;

export class ClimbPose {
  private readonly climb = new LadderClimb();
  private pulling = false;
  private last: { x: number; y: number; z: number } | null = null;
  private v = 0;
  private readonly cycle = { v: 0, rise: 1 };
  /** The puppet for the cycle: no pose over the clip, no limbs put anywhere; the clip is the climb. */
  private readonly puppet: HeroPuppet = { pose: null, limbs: null, clip: CLIMB_CUTS[0].clip, climbRate: this.cycle };

  /** This frame's pose for a walker on a face (and where the body goes), or null when it is not on one. */
  onFace(w: Walker, body: Climber, dt: number): { readonly puppet: HeroPuppet; readonly pos: { x: number; y: number; z: number }; readonly yaw: number } | null {
    const F = w.face, p = w.pos;
    if (w.mode === 'climb') {
      this.pulling = false;
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
      this.cycle.rise = CLIMB_CUTS[0].rise * body.hipHeight;
      // The body is placed so its hands, in front of its hips, meet the face.
      const back = FACE - HANDS * (body.hipHeight / PACK_HIP);
      return { puppet: this.puppet, pos: { x: p.x + F.nx * back, y: p.y, z: p.z + F.nz * back }, yaw: w.yaw };
    }
    this.last = null;
    this.v = 0;
    if (w.mode === 'pull') {
      const q = w.pull;
      if (!this.pulling) {
        this.pulling = true;
        const ex = q.x0 + F.nx * FACE, ez = q.z0 + F.nz * FACE;
        this.climb.play([{ kind: 'ledge', ledge: { x: ex, z: ez, nx: F.nx, nz: F.nz, floor: q.y1 }, feet: q.y0 }], q.x0, q.y0, q.z0, w.yaw, body);
      }
      this.climb.advance(dt);
      if (this.climb.active) return { puppet: this.climb, pos: this.climb.pos, yaw: this.climb.yaw };
    }
    this.pulling = false;
    return null;
  }
}
