/**
 * A barrow as it stands on the land (pure): a long mound of turfed stones with a stone passage at its
 * front, three slabs and a dark way in, in the building mesh format so it draws with the town's one
 * building shader. Its own frame: the doorway at the origin, the way in towards −z (turn it by the site's
 * yaw), the ground at y 0. `inBarrowShape` says where the walker cannot go (the mound and the slabs).
 */
import { BuildingMat, MeshKit, type Tint } from './meshKit';
import type { BuildingMesh } from '@futuremagic/settlement';

/** The mound: radius and height (m), and how far behind the doorway its middle is. */
export const MOUND = { r: 7, h: 2.8, back: 9 } as const;
/** The stone passage: half its inner width, its height, and from where to where it runs along z (m). */
export const PASSAGE = { half: 0.6, h: 1.9, front: 0.6, end: -2.6 } as const;
/** Where in the passage the hero goes down (its frame). */
export const WAY_DOWN = { x: 0, z: -1.7 } as const;

const TURF: Tint = [86, 98, 64];
const STONE: Tint = [150, 146, 136];
const DARK: Tint = [14, 13, 12];

export function barrowMesh(): BuildingMesh {
  const k = new MeshKit();
  // The mound: rings of a flattened dome, then a skirt into the ground (the land is never quite level).
  const seg = 28, rings = 7;
  const ringPoint = (ring: number, s: number): number[] => {
    const phi = (ring / rings) * (Math.PI / 2), a = (s / seg) * Math.PI * 2;
    const r = ring > rings ? MOUND.r : MOUND.r * Math.sin(phi), y = ring > rings ? -2 : MOUND.h * Math.cos(phi);
    return [Math.cos(a) * r, y, -MOUND.back + Math.sin(a) * r];
  };
  for (let i = 0; i <= rings; i++) for (let s = 0; s < seg; s++) {
    const a = ringPoint(i, s), b = ringPoint(i + 1, s), c = ringPoint(i + 1, s + 1), d = ringPoint(i, s + 1);
    k.quad(a, d, c, b, [[a[0], a[2]], [d[0], d[2]], [c[0], c[2]], [b[0], b[2]]], BuildingMat.Rubble, TURF);
  }
  // The passage: two upright slabs and a capstone, and the dark way in at its back.
  const { half, h, front, end } = PASSAGE, len = front - end, mid = (front + end) / 2;
  k.box(-half - 0.25, -0.3, mid, 0.5, h + 0.3, len, 0, BuildingMat.Ashlar, STONE);
  k.box(half + 0.25, -0.3, mid, 0.5, h + 0.3, len, 0, BuildingMat.Ashlar, STONE);
  k.box(0, h, mid, half * 2 + 1.3, 0.45, len + 0.2, 0, BuildingMat.Ashlar, STONE);
  k.quad([-half, -0.2, end + 0.3], [half, -0.2, end + 0.3], [half, h, end + 0.3], [-half, h, end + 0.3], [[0, 0], [1, 0], [1, 1], [0, 1]], BuildingMat.Slate, DARK);
  return k.mesh();
}

/** Is a body of radius `r` at (x, z) of the barrow's own frame inside the mound or a slab? (The passage is open.) */
export function inBarrowShape(x: number, z: number, r: number): boolean {
  const { half, front, end } = PASSAGE;
  const inPassage = Math.abs(x) < half - r && z > end + 0.3 + r && z < front + 1;
  if (inPassage) return false;
  if (Math.abs(x) < half + 0.5 + r && z > end - r && z < front + r) return true;
  return Math.hypot(x, z + MOUND.back) < MOUND.r + r;
}
