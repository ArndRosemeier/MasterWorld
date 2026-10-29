/**
 * The title's camera path (plan D46): a slow orbit over the start town that keeps high and far while only
 * the coarse land is built, and comes closer as the near detail is ready (`near`, 0..1). Then the dive:
 * from wherever the orbit is, down through the sky to the camera behind the hero. Pure numbers, no
 * three.js, so it is tested headless.
 */
import { clamp, damp, lerp, smootherstep, v3lerp, type Vec3 } from '@futuremagic/core';

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
/**
 * Ground checked this far around the camera, so no hill rises into the view; the farther, the less it counts
 * (CLEAR_FALL metres down per metre out), so the camera rises over a mesa's wall ahead of it in a slow climb,
 * not a jump (D56: the start lies in a mesa valley).
 */
const CLEAR = [0, 15, 30, 60, 100, 140, 220, 320, 440];
const CLEAR_FALL = 0.35;

/** The pose on the orbit `t` seconds in, `near` (0..1) of the way from far to close. */
export function orbitPose(o: Orbit, t: number, near: number): Pose {
  const n = smootherstep(0, 1, clamp(near, 0, 1));
  const a = o.angle + (o.turn * t * Math.PI * 2) / LAP;
  // The circle breathes a little, so a lap is not a perfect ring.
  const r = lerp(FAR.radius, NEAR.radius, n) * (1 + 0.12 * Math.sin(t * 0.045 + o.angle));
  const [cx, cy, cz] = o.centre;
  const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
  let ground = cy;
  for (const d of CLEAR) for (let k = 0, m = d ? 12 : 1; k < m; k++) {
    const b = (k / m) * Math.PI * 2;
    ground = Math.max(ground, o.ground(x + Math.cos(b) * d, z + Math.sin(b) * d) - d * CLEAR_FALL);
  }
  const y = ground + lerp(FAR.height, NEAR.height, n) * (1 + 0.15 * Math.sin(t * 0.07));
  // It looks at the town, wandering a little around it.
  const wander = lerp(50, 25, n);
  const look: Vec3 = [cx + Math.sin(t * 0.031) * wander, cy + 6, cz + Math.cos(t * 0.023) * wander];
  return { at: [x, y, z], look };
}

/** The camera never comes nearer the ground under it than this (m), however it eases (steadyHeight). */
const FLOOR_CLEAR = 30;

/**
 * The orbit's height eased over time (`prev` last frame's, null at first): the ground the orbit looks round
 * jumps where a mesa's wall comes into or leaves its reach, and the camera follows that in a glide, never
 * lower than FLOOR_CLEAR over the ground under it.
 */
export function steadyHeight(o: Orbit, pose: Pose, prev: number | null, dt: number): number {
  const floor = o.ground(pose.at[0], pose.at[2]) + FLOOR_CLEAR;
  if (prev === null) return Math.max(floor, pose.at[1]);
  return Math.max(floor, prev + (pose.at[1] - prev) * damp(0.8, dt));
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

/**
 * The giant's walk (title, a rare guest): across the camera's side of the town this far from its middle
 * (in front of the town as the camera sees it, below the logo), this long, this fast (m, m/s); in view
 * from about AT seconds into the flight.
 */
const GIANT = { off: 130, length: 600, speed: 9, at: 30 };

/**
 * Where the giant is `t` seconds in: pacing back and forth across the view past the town, on the ground,
 * in the middle of its line at GIANT.at. `yaw` is its facing (radians about +y; 0 walks towards −z).
 */
export function giantPose(o: Orbit, seed: number, t: number): { x: number; y: number; z: number; yaw: number } {
  // The camera's side of the town at GIANT.at (the camera circles on meanwhile).
  const side = o.angle + o.turn * ((GIANT.at * Math.PI * 2) / LAP) + ((seed % 7) - 3) * 0.05;
  const [cx, , cz] = o.centre;
  // The line's middle and its direction (across the view).
  const mx = cx + Math.sin(side) * GIANT.off, mz = cz + Math.cos(side) * GIANT.off;
  const dx = Math.cos(side), dz = -Math.sin(side);
  const lap = (2 * GIANT.length) / GIANT.speed;
  // A quarter lap in (half way out) at GIANT.at.
  const u = ((((t - GIANT.at) / lap + 0.25) % 1) + 1) % 1;
  const out = u < 0.5;
  const s = (out ? u * 2 : 2 - u * 2) * GIANT.length - GIANT.length / 2;
  const x = mx + dx * s, z = mz + dz * s;
  const sign = out ? 1 : -1;
  return { x, y: o.ground(x, z), z, yaw: Math.atan2(-dx * sign, -dz * sign) };
}

/** The giant's walking speed (m/s): its clip is paced to match. */
export const GIANT_SPEED = GIANT.speed;
