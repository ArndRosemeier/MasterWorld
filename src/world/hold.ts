/**
 * A people's hold on the land (plan 11.6, D34): where its gate stands and what the ground makes of it.
 * The VGM picks a hillside in a ring around the start town, facing down the slope; the ground before the
 * gate is levelled into a court, and behind the gate it rises into a rock face about FACE.h high, so the
 * gate always looks cut into the hill. The gate's own frame: the doorway's middle at the origin, out of the
 * gate towards +z (turned by the site's yaw, as a barrow's), the court's floor at y 0. Pure.
 */
import { hash2f, lerp, smoothstep } from '@futuremagic/core';
import type { HoldDef } from '../setting/contract';
import type { HoldDecision } from './decisions';
import { siteToWorld, worldToSite } from './site';

/** The level court: half its width and how far it reaches out from the gate's face (m). */
export const COURT = { half: 13, depth: 24 } as const;
/** How far the levelled ground blends back into the land around the court (m). */
const COURT_BLEND = 12;
/**
 * The rock face behind the gate: how high it rises above the court, how far behind the face line it
 * starts (the doorway's recess stays level), over how much ground, how far across it reaches at full
 * height and how far back before it fades into the land (m).
 */
export const FACE = { h: 17, foot: 3, run: 12, half: 26, back: 40 } as const;

/** The gate's front (m): its half width and height, and the doorway's half width, height and recess. */
export const GATE = { half: 11, h: 13.5, door: 2.6, doorH: 6.6, recess: 2.2 } as const;
/** The low walls along the court's sides: how far out they run and how high they stand (m). */
export const WALLS = { out: 18, h: 1.3, thick: 0.6 } as const;

/** The court's posts where the guards stand, in the gate's frame (x across, z out): two at the door, two at the walls' ends. */
export const POSTS: readonly (readonly [number, number])[] = [[-3.6, 2.4], [3.6, 2.4], [-COURT.half + 2, WALLS.out + 0.5], [COURT.half - 2, WALLS.out + 0.5]];

/** How far (m) a point of the gate's frame is outside the court (0 inside). */
function outsideCourt(u: number, v: number): number {
  const du = Math.max(0, Math.abs(u) - COURT.half), dv = Math.max(0, v - COURT.depth, -v - FACE.foot);
  return Math.hypot(du, dv);
}

/** The farthest any of the hold's shaping reaches from its middle (m): beyond it the land is as it was. */
export const HOLD_REACH = FACE.back + 40 + COURT.depth;

/**
 * The ground as the hold shapes it: `h` the land's own height at (x, z). The court is level, and behind
 * the gate the land rises to at least the face's height and only then gives way to the hill.
 */
export function holdGround(d: HoldDecision, x: number, z: number, h: number): number {
  if (Math.abs(x - d.x) > HOLD_REACH || Math.abs(z - d.z) > HOLD_REACH) return h;
  const [u, v] = worldToSite(d, x, z);
  const out = outsideCourt(u, v);
  let g = out < COURT_BLEND ? lerp(d.level, h, smoothstep(0, COURT_BLEND, out)) : h;
  if (v < 0) {
    const across = 1 - smoothstep(FACE.half, FACE.half + 18, Math.abs(u));
    const deep = 1 - smoothstep(FACE.back, FACE.back + 30, -v);
    // Not a ruled wall: its height wanders a little (84 .. 100 % of FACE.h) across and back.
    const face = d.level + FACE.h * smoothstep(FACE.foot, FACE.foot + FACE.run, -v) * (0.92 + 0.08 * Math.cos(u * 0.7 + v * 0.4));
    if (face > g) g = lerp(g, face, across * deep);
  }
  return g;
}

/** The court and the gate itself (in the gate's frame): nothing grows there. */
export function holdBare(d: HoldDecision, x: number, z: number): boolean {
  if (Math.abs(x - d.x) > HOLD_REACH || Math.abs(z - d.z) > HOLD_REACH) return false;
  const [u, v] = worldToSite(d, x, z);
  return outsideCourt(u, v) < 4 || (v < 0 && v > -FACE.foot - FACE.run - 2 && Math.abs(u) < FACE.half);
}

/** Is a body of radius `r` at (u, v) of the gate's frame in the gate's stone or the court's walls? */
export function inHoldShape(u: number, v: number, r: number): boolean {
  // The gate's front and the closed doors in their recess.
  if (v < 0.25 + r && Math.abs(u) < GATE.half + 0.8 + r) {
    const inRecess = Math.abs(u) < GATE.door - r && v > -GATE.recess + 0.2 + r;
    if (!inRecess) return true;
  }
  // The pillars by the door and the statues before them.
  for (const side of [-1, 1]) {
    if (Math.abs(u - side * 4.4) < 1.2 + r && v < 1.6 + r) return true;
    if (Math.hypot(u - side * 7.6, v - 2.6) < 1.1 + r) return true;
  }
  // The side walls and the braziers at their ends.
  if (Math.abs(Math.abs(u) - COURT.half - WALLS.thick / 2) < WALLS.thick / 2 + r && v > -0.5 && v < WALLS.out + 0.5 + r) return true;
  return false;
}

/** How a terrain is asked for a site (the bare land, before anything is settled on it). */
export interface HoldLand {
  height(x: number, z: number): number;
  waterDepth(x: number, z: number): number;
}

/**
 * The hold of a people near the start town (plan 11.6): on a hillside within the hold's ring, its court on
 * dry ground and as little cutting as can be, the hill rising behind it. The gate faces down the slope;
 * on level land it faces the town. Null if the setting gives the people no hold.
 */
export function holdSite(land: HoldLand, town: { readonly x: number; readonly z: number }, people: string, def: HoldDef | undefined, seed: number): HoldDecision | null {
  if (!def) return null;
  let best: { x: number; z: number; yaw: number; level: number; score: number } | null = null;
  for (let k = 0; k < 120; k++) {
    const d = def.ring[0] + (def.ring[1] - def.ring[0]) * hash2f(seed, k, 1), a = hash2f(seed, k, 2) * Math.PI * 2;
    const x = town.x + Math.cos(a) * d, z = town.z + Math.sin(a) * d;
    const h = land.height(x, z);
    if (h < 8 || land.waterDepth(x, z) > 0) continue;
    // Down the slope (out of the gate); on level land towards the town.
    const gx = land.height(x + 8, z) - land.height(x - 8, z), gz = land.height(x, z + 8) - land.height(x, z - 8);
    const yaw = Math.hypot(gx, gz) > 0.8 ? Math.atan2(-gx, -gz) : Math.atan2(town.x - x, town.z - z);
    const site = { x, z, yaw };
    const sample = (u: number, v: number) => { const [px, pz] = siteToWorld(site, u, v); return { h: land.height(px, pz), wet: land.waterDepth(px, pz) > 0 }; };
    // The court: dry, and its mean height is where it is levelled.
    const court = [[0, 2], [-COURT.half, 4], [COURT.half, 4], [0, COURT.depth / 2], [-COURT.half, COURT.depth], [COURT.half, COURT.depth], [0, COURT.depth]].map(([u, v]) => sample(u, v));
    if (court.some((c) => c.wet)) continue;
    const level = court.reduce((s, c) => s + c.h, 0) / court.length;
    const cut = court.reduce((s, c) => Math.max(s, Math.abs(c.h - level)), 0);
    // The hill behind: higher is better, up to the face's height and a little more.
    const rise = (sample(0, -25).h + sample(-12, -20).h + sample(12, -20).h) / 3 - level;
    const score = Math.min(rise, FACE.h + 6) / FACE.h - cut / 6 + hash2f(seed, k, 3) * 0.1;
    if (!best || score > best.score) best = { x, z, yaw, level, score };
  }
  if (!best) return null;
  return { kind: 'hold', id: `hold-${people}`, people, x: best.x, z: best.z, yaw: best.yaw, level: Math.max(2, best.level) };
}
