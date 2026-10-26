/**
 * Something standing on the land in its own frame (a barrow, a hold's gate): its origin at (x, z) and
 * turned by yaw about +y, as the walker's yaw (its own +z points along (sin yaw, cos yaw)). Pure.
 */
export interface Site {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
}

/** A point of a site's own frame (x, z) on the land. */
export function siteToWorld(m: Site, x: number, z: number): [number, number] {
  const c = Math.cos(m.yaw), s = Math.sin(m.yaw);
  return [m.x + x * c + z * s, m.z - x * s + z * c];
}

/** A point of the land in a site's own frame (the inverse of siteToWorld). */
export function worldToSite(m: Site, x: number, z: number): [number, number] {
  const dx = x - m.x, dz = z - m.z, c = Math.cos(m.yaw), s = Math.sin(m.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}
