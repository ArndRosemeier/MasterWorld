/**
 * A blow's jolt: whoever is struck (the hero, the cellar's people, the beasts, rats and spiders) is knocked
 * back from it for a moment, on top of whatever clip plays, so a hit always shows, even in the middle of a
 * blow of its own. People bend back at the spine, the head snapping last, and give a step; beasts and the
 * small things are pushed back and tip away from it. Where the body is free, its hit clip (a flinch) plays
 * as well (render/dungeon/CreatureView.ts, render/hero/HeroView.ts).
 */
import { Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';

/** When it is strongest (s after the blow) and when it is over. */
const PEAK = 0.07;
export const JOLT_TIME = 0.5;

/** How strong a jolt is `t` seconds after the blow (0..1): up at once, strongest at PEAK, settled by JOLT_TIME. */
export function joltAt(t: number): number {
  if (!(t >= 0) || t >= JOLT_TIME) return 0;
  const u = t / PEAK;
  return u * Math.exp(1 - u);
}

/** How hard a blow jolts: a crit more, a blow caught on a shield less. */
export function joltOf(outcome: string): number {
  return outcome === 'crit' ? 1.5 : outcome === 'block' ? 0.5 : 1;
}

/** One body's jolt: the last blow's direction (away from whoever struck, on the ground), strength and age. */
export class Jolt {
  private t = JOLT_TIME;
  dx = 0;
  dz = 1;
  k = 0;
  /** Which way the body twists with it (turns about with every blow). */
  side = 1;

  /** Struck: pushed along (dx, dz) (away from the blow; any length, none keeps the last), `k` how hard (1 a plain blow). */
  hit(dx: number, dz: number, k = 1): void {
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) { this.dx = dx / l; this.dz = dz / l; }
    this.k = k;
    this.t = 0;
    this.side = -this.side;
  }

  step(dt: number): void { this.t += dt; }

  /** Now (0: still). */
  get amount(): number { return joltAt(this.t) * this.k; }
}

const UP = new Vector3(0, 1, 0);
const AXIS = new Vector3();
const TIP = new Quaternion();
const TWIST = new Quaternion();
const PARENT = new Quaternion();
const LOCAL = new Quaternion();

/** The axis a body tips about to lean along (dx, dz): level, across the push. */
function across(j: Jolt): Vector3 {
  return AXIS.set(j.dz, 0, -j.dx);
}

/**
 * The body knocked back, after it is placed this frame: `o` pushed `push` m along the jolt and tipped `tilt`
 * radians away from the blow, about its feet. Whoever places `o` sets its whole rotation every frame.
 */
export function joltRoot(o: Object3D, j: Jolt, push: number, tilt = 0): void {
  const a = j.amount;
  if (a <= 0) return;
  o.position.x += j.dx * push * a;
  o.position.z += j.dz * push * a;
  if (tilt) o.quaternion.premultiply(TIP.setFromAxisAngle(across(j), tilt * a));
}

/** Shares of a person's lean, up the spine (Actors' bones), and of the twist with it. */
const SPINE: readonly (readonly [string, number, number])[] = [
  ['spine_01', 0.2, 0.3], ['spine_02', 0.25, 0.4], ['spine_03', 0.25, 0.3], ['neck_01', 0.1, 0], ['head', 0.2, 0],
];

/**
 * An Actors person's upper body bent back from the blow, after the clip's pose this frame: `lean` radians in all
 * up the spine (the head snapping last), and turned `twist` radians with it. The clip sets these bones again
 * next frame.
 */
export function joltSpine(bones: readonly Bone[], names: readonly string[], j: Jolt, lean: number, twist = 0.35): void {
  const a = j.amount;
  if (a <= 0) return;
  for (const [name, share, turn] of SPINE) {
    const b = bones[names.indexOf(name)];
    if (!b?.parent) continue;
    // A turn about world axes, put into the bone's own (its parent's frame is fresh: bones above were turned first).
    TIP.setFromAxisAngle(across(j), lean * share * a).multiply(TWIST.setFromAxisAngle(UP, twist * turn * j.side * a));
    b.parent.getWorldQuaternion(PARENT);
    b.quaternion.premultiply(LOCAL.copy(PARENT).invert().multiply(TIP).multiply(PARENT));
  }
}
