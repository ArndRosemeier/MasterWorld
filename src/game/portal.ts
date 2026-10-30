/**
 * Portals (pure): an opening at one place that is joined to an opening at another, so walking through the one
 * goes on out of the other, and looking through it shows what lies beyond the other (render/portal/PortalView.ts
 * draws that). A cave's mouth is joined to its first passage this way (the cave keeps its own frame, deep
 * below), and so can a spell's gate or any far place.
 *
 * Each side is a frame on its floor (x, y, z, yaw as a walker's: its -z is the way through, turned by yaw) in a
 * realm: 'land', or a place below that keeps its own frame (a cave, by its dungeon id). The opening stands on
 * the frame's floor across its x, up its y. The two sides are joined by the rigid step that takes one frame
 * onto the other: a point just beyond one opening is the same point just beyond the other. Either side can be
 * walked through either way.
 */
import { inFrame, onLand } from '../world/dungeon/site';

/** Where an opening stands: its floor's middle, and its facing (the way through is -z turned by yaw, as a walker's forward). */
export interface PortalFrame {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
}

/** One side: its frame, in its realm. */
export interface PortalSide {
  readonly realm: string;
  readonly frame: PortalFrame;
}

/** The opening's outline in its plane: an arch `halfWidth` either side of the middle, `height` up, its top rounded. */
export interface PortalShape {
  readonly halfWidth: number;
  readonly height: number;
}

export interface Portal {
  readonly id: string;
  readonly a: PortalSide;
  readonly b: PortalSide;
  readonly shape: PortalShape;
}

/** A point (or a direction with `w` 0). */
export interface P3 { x: number; y: number; z: number }

/** A point in the frame's own axes (x across, y up, z along the facing's back: the way through is -z). */
export function toFrame(f: PortalFrame, p: P3): P3 {
  // A walker's yaw turns -z towards -x (forward is (-sin, -cos)): the frame's axes are the world's turned by yaw round y, as a site's.
  const [x, z] = inFrame(f, p.x, p.z);
  return { x, y: p.y - f.y, z };
}

/** A point given in the frame's own axes, in the world. */
export function fromFrame(f: PortalFrame, q: P3): P3 {
  const [x, z] = onLand(f, q.x, q.z);
  return { x, y: f.y + q.y, z };
}

/** The point `p` near side `from` as seen near side `to` (the portal's step). */
export function stepPoint(from: PortalFrame, to: PortalFrame, p: P3): P3 {
  return fromFrame(to, toFrame(from, p));
}

/** A heading (a walker's yaw) carried through from one side to the other. */
export function stepYaw(from: PortalFrame, to: PortalFrame, yaw: number): number {
  return yaw + to.yaw - from.yaw;
}

/** A direction (velocity) carried through. */
export function stepDir(from: PortalFrame, to: PortalFrame, v: P3): P3 {
  const [x, z] = onLand({ x: 0, z: 0, yaw: to.yaw - from.yaw }, v.x, v.z);
  return { x, y: v.y, z };
}

/** How far the opening's feet reach below its floor: its bottom edge lies in the ground, never on it (a light seam). */
const FOOT = 0.3;

/** Is a point (in the frame's axes, on its plane) inside the opening, `margin` metres in from its edge? */
export function inOpening(shape: PortalShape, u: number, v: number, margin = 0): boolean {
  const w = shape.halfWidth - margin, top = shape.height - margin;
  if (v < -FOOT || v > top || Math.abs(u) > w) return false;
  // The rounded top: a half ellipse over the last `halfWidth` metres.
  const spring = top - w;
  if (v <= spring) return true;
  const e = (v - spring) / Math.max(1e-6, top - spring);
  return (u / w) ** 2 + e * e <= 1;
}

/** The opening's outline (in its plane: u across, v up), `n` points over its rounded top, round from the right foot. */
export function openingOutline(shape: PortalShape, n = 12): [number, number][] {
  const w = shape.halfWidth, spring = shape.height - w, out: [number, number][] = [[w, -FOOT]];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    out.push([Math.cos(a) * w, spring + Math.sin(a) * (shape.height - spring)]);
  }
  out.push([-w, -FOOT]);
  return out;
}

/**
 * Did the segment `p0`→`p1` (in `side`'s realm) pass through that side's opening? Either way through counts.
 * The crossing point must lie in the opening (`margin` in from its edge).
 */
export function passesThrough(side: PortalSide, shape: PortalShape, p0: P3, p1: P3, margin = 0): boolean {
  const a = toFrame(side.frame, p0), b = toFrame(side.frame, p1);
  if ((a.z >= 0) === (b.z >= 0)) return false;
  const t = a.z / (a.z - b.z);
  return inOpening(shape, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, margin);
}

/** The side of `portal` in `realm` and the one it is joined to (the first match: a portal within one realm is its `a`). */
export function sidesFrom(portal: Portal, realm: string): { here: PortalSide; there: PortalSide }[] {
  const out: { here: PortalSide; there: PortalSide }[] = [];
  if (portal.a.realm === realm) out.push({ here: portal.a, there: portal.b });
  if (portal.b.realm === realm) out.push({ here: portal.b, there: portal.a });
  return out;
}

/**
 * The first opening (in `realm`) that the segment `p0`→`p1` passes through, and the side it comes out at; null if
 * none. For a body walking (its middle last frame and now) or for the camera behind the hero's head.
 */
export function through(portals: Iterable<Portal>, realm: string, p0: P3, p1: P3, margin = 0): { portal: Portal; here: PortalSide; there: PortalSide } | null {
  let best: { portal: Portal; here: PortalSide; there: PortalSide } | null = null, near = Infinity;
  for (const portal of portals) for (const s of sidesFrom(portal, realm)) {
    if (!passesThrough(s.here, portal.shape, p0, p1, margin)) continue;
    // The nearest crossing to p0 wins (the camera's way back may cross two openings).
    const a = toFrame(s.here.frame, p0), b = toFrame(s.here.frame, p1), t = a.z / (a.z - b.z);
    if (t < near) { near = t; best = { portal, ...s }; }
  }
  return best;
}
