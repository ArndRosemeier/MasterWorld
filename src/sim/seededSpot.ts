/** A seeded spot inside a polygon where `ok` holds (a paddock's grass, a yard's open ground). Pure. */
import type { Rng } from '@futuremagic/core';
import { polyBounds, type Poly } from '@futuremagic/settlement';

/** Up to `tries` seeded points in `poly`'s bounds; the first where `ok` holds, or null. */
export function seededSpot(poly: Poly, ok: (x: number, z: number) => boolean, r: Rng, tries = 40): [number, number] | null {
  const [x0, z0, x1, z1] = polyBounds(poly);
  for (let k = 0; k < tries; k++) {
    const x = r.range(x0, x1), z = r.range(z0, z1);
    if (ok(x, z)) return [x, z];
  }
  return null;
}
