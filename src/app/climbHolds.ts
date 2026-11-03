/**
 * Where a climber's hands and feet are on a rock face (D56): each sits on a hold, fixed in the world, while the body
 * climbs on past it, and lets go and reaches on to the next only when the body has left it far enough behind. A hand
 * and the foot across from it go together (the left hand with the right foot, then the right hand with the left),
 * the second pair only once the first has taken hold, so one pair is on the rock (the next lets go as the last takes hold). Pure (no three.js): the pose
 * (climbPose.ts) puts the bones on these.
 */

export interface V3 { x: number; y: number; z: number }
export type LimbKey = 'L' | 'R' | 'footL' | 'footR';

/**
 * A limb's measures (m, for a body with hips at SIZED_FOR): the hold's rest place against the walker (across the face,
 * up it from the walker's feet), how far in front of the face it is held, how far behind its rest place it may be left
 * before reaching on, how far past it it reaches, and how far it comes off the face on its way.
 */
export interface Sizes { across: number; up: number; off: number; lag: number; lead: number; lift: number }

/** The hips' height the sizes are for: a body's scale is its hips over this. */
export const SIZED_FOR = 0.89;
/** Hands and feet (a hand over the shoulder up to over the head, a foot where the knee is bent a little to a good deal: the legs and arms reach them). */
export const HAND: Sizes = { across: 0.22, up: 1.5, off: 0.03, lag: 0.17, lead: 0.17, lift: 0.07 };
export const FOOT: Sizes = { across: 0.13, up: 0.3, off: 0.13, lag: 0.17, lead: 0.17, lift: 0.09 };

export interface Limb {
  readonly key: LimbKey;
  readonly sizes: Sizes;
  /** Right (+1) or left (−1) of one facing the face. */
  readonly side: 1 | -1;
  /** The diagonal pair it reaches with. */
  readonly group: 0 | 1;
  /** Where it is held now (or on its way): the pose's goal. */
  readonly hold: V3;
  readonly from: V3;
  readonly to: V3;
}

/** The walker this frame. */
export interface Frame {
  /** The walker's place (feet), and the way into the face (a unit vector) with the face this far in front of the walker. */
  readonly p: V3;
  readonly nx: number;
  readonly nz: number;
  readonly face: number;
  /** The body's scale (its hips over SIZED_FOR). */
  readonly k: number;
  /** How fast it climbs, along the face to the right and up it (m/s). */
  readonly vs: number;
  readonly vu: number;
  readonly dt: number;
}

/** Slower than this (m/s) the climb is standing: no limb reaches on. */
export const STILL = 0.08;
/** How far a reach has got when the other pair may let go. */
const LANDED = 0.6;
export const ease = (t: number) => t * t * (3 - 2 * t);
const v3 = (): V3 => ({ x: 0, y: 0, z: 0 });

export class HoldSteps {
  readonly limbs: readonly Limb[];
  /** How far each pair's reach has got (0..1; null: on its holds), and the reaches done. */
  readonly reaching: [number | null, number | null] = [null, null];
  reached = 0;
  private started = false;

  constructor() {
    const limb = (key: LimbKey, sizes: Sizes, side: 1 | -1, group: 0 | 1): Limb => ({ key, sizes, side, group, hold: v3(), from: v3(), to: v3() });
    this.limbs = [limb('L', HAND, -1, 0), limb('footR', FOOT, 1, 0), limb('R', HAND, 1, 1), limb('footL', FOOT, -1, 1)];
  }

  /** Not on a face: the next frame takes hold afresh. */
  offFace(): void {
    this.started = false;
    this.reaching[0] = this.reaching[1] = null;
  }

  /** How far through the cycle of the climb the paces are (0..1): two reaches, one pair then the other, a cycle. */
  get phase(): number {
    return this.cycles % 1;
  }

  /** The cycles done, whole and partly (not wrapped). */
  get cycles(): number {
    return (this.reached + ease(this.reaching[0] ?? 0) + ease(this.reaching[1] ?? 0)) / 2;
  }

  /** Where the limb would be held with the walker where it is now (`out`): its rest place. */
  restOf(l: Limb, f: Frame, out: V3): V3 {
    const s = l.sizes, o = f.face - s.off * f.k, a = l.side * s.across * f.k;
    out.x = f.p.x + f.nx * o - f.nz * a;
    out.y = f.p.y + s.up * f.k;
    out.z = f.p.z + f.nz * o + f.nx * a;
    return out;
  }

  /** This frame: the pair furthest behind reaches on once it is further than it may lag; the others stay on their holds. */
  step(f: Frame): void {
    const rest = v3(), speed = Math.hypot(f.vs, f.vu);
    if (!this.started) {
      for (const l of this.limbs) this.restOf(l, f, l.hold);
      this.reaching[0] = this.reaching[1] = null;
      this.reached = 0;
      this.started = true;
    }
    // The way it is going, along the face (right) and up it, as a unit vector in the world.
    const dx = speed > STILL ? (-f.nz * f.vs) / speed : 0, dy = speed > STILL ? f.vu / speed : 0, dz = speed > STILL ? (f.nx * f.vs) / speed : 0;
    // Quick enough that the other pair can go as soon as the body has left its holds, slow as the climb is slow.
    const sw = Math.min(0.5, Math.max(0.15, (0.3 * (FOOT.lag + FOOT.lead) * f.k) / Math.max(speed, 0.2)));
    // The pair furthest behind goes once it is further than it may lag, and the other pair is (all but) in its holds.
    if (speed > STILL) {
      const far: [number, number] = [0, 0];
      for (const l of this.limbs) {
        this.restOf(l, f, rest);
        const ox = l.hold.x - rest.x, oy = l.hold.y - rest.y, oz = l.hold.z - rest.z;
        // Behind where it will be (along the way it goes), or just too far off it any way.
        const d = Math.max(-(ox * dx + oy * dy + oz * dz) / (l.sizes.lag * f.k), Math.hypot(ox, oy, oz) / ((l.sizes.lag + l.sizes.lead) * f.k));
        far[l.group] = Math.max(far[l.group], d);
      }
      for (const g of far[0] >= far[1] ? [0, 1] as const : [1, 0] as const) {
        const other = this.reaching[g === 0 ? 1 : 0];
        if (this.reaching[g] !== null || far[g] <= 1 || (other !== null && other < LANDED)) continue;
        this.reaching[g] = 0;
        for (const l of this.limbs) {
          if (l.group !== g) continue;
          l.from.x = l.hold.x; l.from.y = l.hold.y; l.from.z = l.hold.z;
          this.restOf(l, f, l.to);
          // Past where its rest place will be when it gets there.
          const lead = l.sizes.lead * f.k + speed * sw;
          l.to.x += dx * lead; l.to.y += dy * lead; l.to.z += dz * lead;
        }
      }
    }
    for (const g of [0, 1] as const) { const r = this.reaching[g]; if (r !== null) this.reaching[g] = Math.min(1, r + f.dt / sw); }
    for (const l of this.limbs) {
      const h = l.hold, r = this.reaching[l.group];
      if (r !== null) {
        const t = ease(r), lift = l.sizes.lift * f.k * Math.sin(Math.PI * t);
        h.x = l.from.x + (l.to.x - l.from.x) * t - f.nx * lift;
        h.y = l.from.y + (l.to.y - l.from.y) * t;
        h.z = l.from.z + (l.to.z - l.from.z) * t - f.nz * lift;
      } else {
        // On its hold: where it is, but as far in front of the face as a limb of its kind is held (the face curves).
        const want = f.face - l.sizes.off * f.k, d = want - ((h.x - f.p.x) * f.nx + (h.z - f.p.z) * f.nz);
        h.x += f.nx * d; h.z += f.nz * d;
      }
    }
    for (const g of [0, 1] as const) if (this.reaching[g] === 1) { this.reaching[g] = null; this.reached++; }
  }
}
