/**
 * The hero seen climbing rock (D56, rule 11): hand over hand up, down and along a face while the walker is
 * on it (game/walker.ts, mode `climb`), and the pull-up over its top (`pull`). The body's sway is the motion-capture
 * cycle of CLIMB_CUTS (a ladder take of the CMU library, cut by `npm run packs`), stepped as the limbs take their paces;
 * the hands and feet are not the clip's but sit on holds on the face (climbHolds.ts), each fixed while the body climbs
 * on past it, a diagonal pair at a time reaching on to the next. The pull-up is @futuremagic/figure's ledge, its puppet.
 */
import { smoothstep } from '@futuremagic/core';
import { LadderClimb, type Climber, type LimbGoals } from '@futuremagic/figure';
import type { Walker } from '../game/walker';
import type { HeroPuppet } from '../render/hero/HeroView';
import { limbGoals } from '../render/hero/puppet';
import { CLIMB_CUTS } from '../render/hero/clips';
import { HoldSteps, SIZED_FOR, type LimbKey } from './climbHolds';

/** The face is this far in front of the walker's body (game/walker.ts OFF_FACE). */
const FACE = 0.35;
/** How far in front of the face the hips hang, hands and feet on it (m, for a body with hips at the pack's height). */
const HIPS = 0.42;
/** Seconds over which the speed of the climb the holds go by follows the body's (the walker moves in steps). */
const SMOOTH = 0.12;
/** Seconds to take hold of the face (the hands and feet onto it, the body in), and to let the ledge puppet's limbs take over. */
const GRAB = 0.25;
const HAND_OFF = 0.25;
/** The most cycles a second the body's sway turns at. */
const MAX_RATE = 1.6;
const KEYS: readonly LimbKey[] = ['L', 'R', 'footL', 'footR'];
/** The fingers' curl on a hold. */
const GRIP = 1.25;

type P3 = { x: number; y: number; z: number };

export class ClimbPose {
  private readonly climb = new LadderClimb();
  private readonly holds = new HoldSteps();
  private pulling = false;
  private last: P3 | null = null;
  /** The climb's velocity along the face (right) and up it (m/s), smoothed. */
  private vs = 0;
  private vu = 0;
  /** How far the grip has taken (0..1), and the seconds since the pull began. */
  private grip = 0;
  private pullT = 0;
  /** The cycles the clip has been shown at (the holds' cycles, kept to the most it may sway at). */
  private shown = 0;
  private readonly from: P3 = { x: 0, y: 0, z: 0 };
  private readonly at: P3 = { x: 0, y: 0, z: 0 };
  /** Where the body was drawn before taking hold (the walker's jump onto the face is eased from there), and the gap left to close. */
  private ground: P3 | null = null;
  private readonly grab: P3 = { x: 0, y: 0, z: 0 };
  /** The ledge puppet's first frame still to come, and the gap between where the climb left the body and where it starts. */
  private advanceFirst = false;
  private readonly gap: P3 = { x: 0, y: 0, z: 0 };
  /** The limbs on their holds, as the climb left them, and the mix of those and the ledge puppet's while it takes over. */
  private readonly goals: LimbGoals = limbGoals();
  private readonly leaving: LimbGoals = limbGoals();
  private readonly mixed: LimbGoals = limbGoals();
  /** The puppet for the cycle: the clip's sway at the phase of the paces, hands and feet on their holds. */
  private readonly puppet = { pose: null as HeroPuppet['pose'], limbs: this.goals as LimbGoals | null, clip: CLIMB_CUTS[0].clip as string, phase: 0 };
  /** The puppet for the pull-up: the ledge's pose, its limbs eased in from the holds. */
  private readonly pullPuppet = { pose: null as HeroPuppet['pose'], limbs: this.mixed as LimbGoals | null, clip: undefined as string | undefined };

  /** The body is on the ground (not on a face) at `p` this frame: where a grab starts from. */
  onGround(p: P3): void {
    this.grip = 0;
    this.ground = this.ground ?? { x: 0, y: 0, z: 0 };
    this.ground.x = p.x; this.ground.y = p.y; this.ground.z = p.z;
  }

  /** This frame's pose for a walker on a face (and where the body goes), or null when it is not on one. */
  onFace(w: Walker, body: Climber, dt: number): { readonly puppet: HeroPuppet; readonly pos: P3; readonly yaw: number } | null {
    const F = w.face, p = w.pos, k = (body.hipHeight || 0.52 * body.height) / SIZED_FOR;
    if (w.mode === 'climb') {
      this.pulling = false;
      if (this.grip === 0) {
        if (this.ground) { this.grab.x = this.ground.x - p.x; this.grab.y = this.ground.y - p.y; this.grab.z = this.ground.z - p.z; }
        this.holds.offFace();
        this.vs = this.vu = 0;
      }
      this.ground = null;
      this.grip = Math.min(1, this.grip + dt / GRAB);
      const e = smoothstep(0, 1, this.grip);
      // How fast it climbs now, along the face (right of one facing it) and up it, smoothed.
      const last = this.last;
      if (last && dt > 1e-4) {
        const f = 1 - Math.exp(-dt / SMOOTH);
        this.vs += (((p.x - last.x) * -F.nz + (p.z - last.z) * F.nx) / dt - this.vs) * f;
        this.vu += ((p.y - last.y) / dt - this.vu) * f;
      }
      this.last = { x: p.x, y: p.y, z: p.z };
      this.holds.stepHolds({ p, nx: F.nx, nz: F.nz, face: FACE, k, vs: this.vs, vu: this.vu, dt });
      // The sway of the clip follows the paces, but no quicker than a body can sway (a small body's paces are quick).
      const cycles = this.holds.cycles, step = MAX_RATE * dt;
      this.shown = this.grip < 1 / 60 / GRAB * 2 ? cycles : this.shown + Math.max(-step, Math.min(step, cycles - this.shown));
      this.puppet.phase = ((this.shown % 1) + 1) % 1;
      for (const l of this.holds.limbs) {
        const g = this.goals[l.key]!;
        g.p.set(l.hold.x, l.hold.y, l.hold.z);
        g.w = e;
        g.pole = l.key === 'L' || l.key === 'R' ? [0.7, -1, -0.3] : [0.2, 0.2, 1];
        const o = this.leaving[l.key]!;
        o.p.copy(g.p); o.w = g.w; o.pole = g.pole;
      }
      this.goals.curl = { L: GRIP, R: GRIP };
      this.goals.curlW = e;
      this.leaving.curlW = e;
      const back = (FACE - HIPS * k) * e;
      // The walker jumps onto the face at the grab (up, and in): the body comes from where it stood.
      const rest = 1 - e;
      this.from.x = p.x + F.nx * back + this.grab.x * rest; this.from.y = p.y + this.grab.y * rest; this.from.z = p.z + F.nz * back + this.grab.z * rest;
      return { puppet: this.puppet, pos: this.from, yaw: w.yaw };
    }
    this.grip = 0;
    this.last = null;
    this.vs = this.vu = 0;
    if (w.mode === 'pull') {
      const q = w.pull;
      if (!this.pulling) {
        this.pulling = true;
        this.pullT = 0;
        const ex = q.x0 + F.nx * FACE, ez = q.z0 + F.nz * FACE;
        this.climb.play([{ kind: 'ledge', ledge: { x: ex, z: ez, nx: F.nx, nz: F.nz, floor: q.y1 }, feet: q.y0 }], q.x0, q.y0, q.z0, w.yaw, body);
        // Where the climb left the body, to ease from.
        this.at.x = q.x0 + F.nx * (FACE - HIPS * k); this.at.y = q.y0; this.at.z = q.z0 + F.nz * (FACE - HIPS * k);
        this.advanceFirst = true;
      }
      this.climb.advance(dt);
      this.pullT += dt;
      if (this.climb.active) {
        const c = this.climb.pos;
        if (this.advanceFirst) { this.advanceFirst = false; this.gap.x = this.at.x - c.x; this.gap.y = this.at.y - c.y; this.gap.z = this.at.z - c.z; }
        const s = smoothstep(0, 1, Math.max(0, 1 - this.pullT / HAND_OFF));
        this.from.x = c.x + this.gap.x * s; this.from.y = c.y + this.gap.y * s; this.from.z = c.z + this.gap.z * s;
        this.pullPuppet.pose = this.climb.pose;
        this.pullPuppet.limbs = this.climb.limbs ? this.mix(this.climb.limbs, smoothstep(0, 1, Math.min(1, this.pullT / HAND_OFF))) : null;
        return { puppet: this.pullPuppet, pos: this.from, yaw: this.climb.yaw };
      }
    }
    this.pulling = false;
    return null;
  }

  /** The hands and feet as the climb left them, eased (`s`: 0 to 1) into the ledge puppet's: held where they were until it asks for them. */
  private mix(to: LimbGoals, s: number): LimbGoals {
    const m = this.mixed;
    for (const key of KEYS) {
      const a = this.leaving[key]!, b = to[key], o = m[key]!;
      const bw = b?.w ?? 0;
      if (b && bw > 0) o.p.lerpVectors(a.p, b.p, s); else o.p.copy(a.p);
      o.w = a.w + (bw - a.w) * s;
      o.pole = s > 0.5 && b?.pole ? b.pole : a.pole;
      o.flat = s > 0.5 ? b?.flat ?? null : null;
    }
    m.curl = { L: GRIP + ((to.curl?.L ?? GRIP) - GRIP) * s, R: GRIP + ((to.curl?.R ?? GRIP) - GRIP) * s };
    m.curlW = (this.leaving.curlW ?? 0) + ((to.curlW ?? 0) - (this.leaving.curlW ?? 0)) * s;
    return m;
  }
}
