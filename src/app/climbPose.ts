/**
 * The hero seen climbing rock (D56, rule 11): hand over hand up, down and along a face while the walker is
 * on it (game/walker.ts, mode `climb`), and the pull-up over its top (`pull`). The holds are
 * @futuremagic/figure's ladder rungs laid on the face, leaning back with it; the body is its puppet.
 */
import { LadderClimb, type Climber, type Ladder } from '@futuremagic/figure';
import type { Walker } from '../game/walker';
import type { HeroPuppet } from '../render/hero/HeroView';

/** Where the holds are: the face is this far in front of the walker's body (game/walker.ts OFF_FACE). */
const FACE = 0.35;

export class ClimbPose {
  private readonly climb = new LadderClimb();
  private pulling = false;
  private lastY = 0;
  private readonly face: Ladder = { x: 0, z: 0, nx: 0, nz: 1, lo: 0, hi: 0, floor: 0, halfWidth: 0.3, rim: false };

  constructor(private readonly height: (x: number, z: number) => number) {}

  /** This frame's pose for a walker on a face (and where the body goes), or null when it is not on one. */
  onFace(w: Walker, body: Climber, dt: number): { readonly puppet: HeroPuppet; readonly pos: { x: number; y: number; z: number }; readonly yaw: number } | null {
    const F = w.face, p = w.pos;
    if (w.mode === 'climb') {
      this.pulling = false;
      // The face at the feet, and how far it leans back (a metre up it is that much further in).
      const fx = p.x + F.nx * FACE, fz = p.z + F.nz * FACE;
      const rise = this.height(fx + F.nx * 0.5, fz + F.nz * 0.5) - this.height(fx - F.nx * 0.5, fz - F.nz * 0.5);
      const lean = rise > 0.2 ? Math.min(0.6, 1 / rise) : 0.6, h = p.y - F.from;
      const l = this.face;
      l.nx = F.nx; l.nz = F.nz;
      // The rungs' line at the climb's foot, so the face leans through the feet now.
      l.x = fx - F.nx * lean * h; l.z = fz - F.nz * lean * h;
      l.lean = lean; l.floor = l.lo = F.from; l.hi = p.y + 3;
      this.climb.cling(l, h, p.y >= this.lastY - 1e-4, body);
      this.lastY = p.y;
      return { puppet: this.climb, pos: this.climb.pos, yaw: this.climb.yaw };
    }
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
