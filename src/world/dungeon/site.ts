/**
 * A place out on the land and its own frame (pure): a dungeon's doorway (a barrow's passage, a cave's
 * mouth, a tower's door) at the origin, the way in towards −z, turned by the site's yaw (0 faces −z, as the
 * walker). Everything that stands on a site is made in this frame and turned onto the land with these.
 */

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
