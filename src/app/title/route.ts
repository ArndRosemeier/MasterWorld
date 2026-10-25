/**
 * The title's camera path (plan D46): a slow orbit over the start town that keeps high and far while only
 * the coarse land is built, and comes closer as the near detail is ready (`near`, 0..1). Then the dive:
 * from wherever the orbit is, down through the sky to the camera behind the hero. Pure numbers, no
 * three.js, so it is tested headless.
 */
import { clamp, lerp, smootherstep, v3lerp, type Vec3 } from '@futuremagic/core';

/** A camera pose: where it is and the point it looks at. */
export interface Pose {
  readonly at: Vec3;
  readonly look: Vec3;
}

export interface Orbit {
  /** The middle of the town (x, z) and the ground there (y). */
  readonly centre: Vec3;
  readonly turn: 1 | -1;
  /** Where on the circle the flight starts (radians). */
  readonly angle: number;
  /** Ground height. */
  readonly ground: (x: number, z: number) => number;
}

/** One full circle in this many seconds. */
const LAP = 260;
const FAR = { radius: 520, height: 130 };
// Close enough that the town (about 200 m across) fills much of the frame, high enough to clear its roofs.
const NEAR = { radius: 180, height: 55 };
/** Ground checked this far around the camera, so no hill rises into the view. */
const CLEAR = [0, 60, 140];

/** The pose on the orbit `t` seconds in, `near` (0..1) of the way from far to close. */
export function orbitPose(o: Orbit, t: number, near: number): Pose {
  const n = smootherstep(0, 1, clamp(near, 0, 1));
  const a = o.angle + (o.turn * t * Math.PI * 2) / LAP;
  // The circle breathes a little, so a lap is not a perfect ring.
  const r = lerp(FAR.radius, NEAR.radius, n) * (1 + 0.12 * Math.sin(t * 0.045 + o.angle));
  const [cx, cy, cz] = o.centre;
  const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
  let ground = cy;
  for (const d of CLEAR) for (let k = 0; k < 6; k++) {
    const b = (k / 6) * Math.PI * 2;
    ground = Math.max(ground, o.ground(x + Math.cos(b) * d, z + Math.sin(b) * d));
  }
  const y = ground + lerp(FAR.height, NEAR.height, n) * (1 + 0.15 * Math.sin(t * 0.07));
  // It looks at the town, wandering a little around it.
  const wander = lerp(50, 25, n);
  const look: Vec3 = [cx + Math.sin(t * 0.031) * wander, cy + 6, cz + Math.cos(t * 0.023) * wander];
  return { at: [x, y, z], look };
}

/** Seconds a dive takes. */
export const DIVE_SECONDS = 4.2;

/**
 * The dive at `u` (0..1): an arc that keeps the height at first and drops onto the target, so the camera
 * sweeps down over the roofs instead of sliding along a straight line through the hills.
 */
export function divePose(from: Pose, to: Pose, u: number): Pose {
  const s = smootherstep(0, 1, clamp(u, 0, 1));
  // Quadratic Bézier with its handle above the landing point, at the starting height.
  const handle: Vec3 = [to.at[0], Math.max(from.at[1], to.at[1]) * 0.85 + to.at[1] * 0.15, to.at[2]];
  const a = v3lerp(from.at, handle, s), b = v3lerp(handle, to.at, s);
  const at = v3lerp(a, b, s);
  // The gaze turns to the hero sooner than the body arrives.
  const look = v3lerp(from.look, to.look, smootherstep(0, 0.7, s));
  return { at, look };
}
