/**
 * A place out on the land and its own frame (pure): a dungeon's doorway (a barrow's passage, a cave's
 * mouth, a tower's door) at the origin, the way in towards −z, turned by the site's yaw (0 faces −z, as the
 * walker). Everything that stands on a site is made in this frame and turned onto the land with these.
 */

import type { DungeonTemplate } from '../decisions';

export interface Site { readonly x: number; readonly z: number; readonly yaw: number }

/** A point of the site's frame (x, z) on the land. */
export function onLand(s: Site, x: number, z: number): [number, number] {
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  return [s.x + x * c + z * n, s.z - x * n + z * c];
}

/** A point of the land in the site's frame (the inverse of `onLand`). */
export function inFrame(s: Site, x: number, z: number): [number, number] {
  const dx = x - s.x, dz = z - s.z, c = Math.cos(s.yaw), n = Math.sin(s.yaw);
  return [dx * c - dz * n, dx * n + dz * c];
}

/** Ground kept free of trees round a place on the land (a circle, metres): its piece stands in the open, seen from afar. */
export interface Clearing { readonly x: number; readonly z: number; readonly r: number }

/**
 * Each kind's clearing in its own frame: its middle (behind the doorway, where the piece stands) and how
 * far the trees keep off. A tower is a landmark and stands widest in the open.
 */
const CLEARINGS: Partial<Record<DungeonTemplate, { readonly back: number; readonly r: number }>> = {
  tower: { back: 9, r: 24 },
  cave: { back: 6, r: 17 },
  barrow: { back: 4, r: 13 },
};

/** The clearing round a place of this kind at its site, none for kinds that do not stand out on the land. */
export function clearingOf(kind: DungeonTemplate, s: Site): Clearing | null {
  const c = CLEARINGS[kind];
  if (!c) return null;
  const [x, z] = onLand(s, 0, -c.back);
  return { x, z, r: c.r };
}
