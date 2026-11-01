/**
 * Holds in a cave's rock (D56), as one function the walker (game/walker.ts) and the cave reader (world/cave/reader.ts) both
 * ask: at (x, z), with the feet at y, is there rock close at the chest and standing as a wall (not a floor nor a roof)?
 * `sdf` is the rock as a signed distance (positive in air). Returns the way into the face (a unit vector), or null.
 */
export function caveHolds(sdf: (x: number, y: number, z: number) => number, x: number, z: number, y: number): { nx: number; nz: number } | null {
  const e = 0.15, h = y + 1;
  if (sdf(x, h, z) > 0.6) return null;
  const gx = sdf(x + e, h, z) - sdf(x - e, h, z), gy = sdf(x, h + e, z) - sdf(x, h - e, z), gz = sdf(x, h, z + e) - sdf(x, h, z - e);
  const across = Math.hypot(gx, gz);
  if (across < 1e-6 || across < 0.7 * Math.hypot(gx, gy, gz)) return null;
  return { nx: -gx / across, nz: -gz / across };
}
