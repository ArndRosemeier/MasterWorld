/**
 * The void skeleton a former writes (D63, phase K2; docs/design/caves.md 3.2): what the carver turns into the rock field.
 * Conduits are centre lines whose points carry a cross-section, voids are collapse spaces, and the marks are what the
 * stages after the former need (the water's way, where it came in and went out, the levels).
 *
 * A point's section is a tube (an ellipse `A` wide and `B` high either side of the point) and a canyon (a slot `C`
 * wide either side, cut `D` metres down from the tube's bottom): a phreatic tube has no canyon, a vadose canyon has
 * a small tube above its slot, and a keyhole has both.
 */

import type { ThroatFrame } from '../dungeon/caveThroat';

export interface CondPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Tube half-width and half-height. */
  readonly A: number;
  readonly B: number;
  /** Canyon half-width, and how far it is cut below the tube's bottom (0: no canyon). */
  readonly C: number;
  readonly D: number;
  /** Share of the cave's water this point carries (1 at the springs). */
  readonly flow: number;
  /** How square the tube's section is cut (0 or none: an ellipse; 1: a box with rounded corners): a mine's drift. */
  readonly sq?: number;
}

/** What a conduit is. */
export type ConduitKind = 'passage' | 'shaft' | 'mouth';

export interface Conduit {
  readonly kind: ConduitKind;
  readonly points: readonly CondPoint[];
  /** The stage (level) it formed in: 0 is the oldest and highest. */
  readonly level: number;
  /** Does the water run in it today? */
  readonly active: boolean;
}

/** A collapse void: the ceiling fell in a dome over (x, z), up from the floor `floor`, and a heap of rubble lies under it. */
export interface Void {
  readonly x: number;
  readonly z: number;
  readonly floor: number;
  /** The dome's horizontal radii (rx along the direction `yaw`, rz across it) and its height above the floor. */
  readonly rx: number;
  readonly rz: number;
  readonly yaw: number;
  readonly height: number;
  /** The rubble heap's radius and height. */
  readonly heapR: number;
  readonly heapH: number;
  /** The dome breaks through to the land: a way in and a shaft of daylight. */
  readonly skylight: boolean;
  readonly seed: number;
}

/** What the later stages read off the former. */
export interface Skeleton {
  /** Where the first mouth's portal plane stands, once the carver has cut its throat (form.ts): the cave's way in from the land. */
  readonly throat?: ThroatFrame;
  /** How much of the usual wall scalloping the carver keeps (default 1): a mine's walls are tooled, not water-worn. */
  readonly rough?: number;
  readonly conduits: readonly Conduit[];
  readonly voids: readonly Void[];
  /** Where the water came in (the lattice nodes' positions) and went out. */
  readonly sinks: readonly (readonly [number, number, number])[];
  readonly springs: readonly (readonly [number, number, number])[];
  /** The heights the water table stood at, oldest first. */
  readonly tables: readonly number[];
  readonly stats: SkeletonStats;
}

export interface SkeletonStats {
  readonly nodes: number;
  readonly runs: number;
  /** Total length of the conduits, metres. */
  readonly length: number;
  readonly junctions: number;
  /** Independent loops of the network (edges minus nodes plus parts). */
  readonly loops: number;
  /** Milliseconds: lattice set-up, flow rounds, chains and sections. */
  readonly ms: { readonly prep: number; readonly flow: number; readonly chains: number };
}

/** The mouth of a passage that ends at the land: its last point run on out along `yaw`, level (`out`: metres from the point). */
export function mouthOf(p: CondPoint, yaw: number, out: readonly number[], level = 0): Conduit {
  return { kind: 'mouth', points: out.map((d) => ({ ...p, x: p.x + Math.cos(yaw) * d, z: p.z + Math.sin(yaw) * d })), level, active: false };
}
