/**
 * Finding the coast near a point (phase D, S1): the nearest beach, the nearest sea cliff, and a spot under the sea
 * off that beach. For shots and checks (`coast=` in the URL, the F1 sea part), so the same places come back for a
 * seed without coordinates written into the scripts.
 */
import type { Terrain } from './terrain';
import { spiralFind } from './spiral';

export type CoastKind = 'beach' | 'cliff' | 'under';

/** A spot by the sea: where to stand and the way out to sea from there (a unit vector). */
export interface CoastSpot {
  readonly kind: CoastKind;
  readonly x: number;
  readonly z: number;
  /** Ground height there (under the sea for `under`: the bed). */
  readonly y: number;
  readonly seaX: number;
  readonly seaZ: number;
}

/** Furthest from the waterline (m) a point counts as on it. */
const ON_SHORE = 20;
/** A beach: the land 60 m and 120 m in stays under these heights (m), so it is a strand, not a cliff's foot. */
const BEACH_RISE = [4, 8] as const;
/** A sea cliff: the land this far in (m) stands at least CLIFF_TOP high. */
const CLIFF_IN = 60, CLIFF_TOP = 25;
/** Under the sea: the first spot out from the beach at least this deep (m). */
const UNDER_DEPTH = 5;

/** The way out to sea at (x, z): down the continent field's slope, over 30 m. */
function seaward(t: Terrain, x: number, z: number): [number, number] {
  const sk = t.skeleton, D = 30;
  const gx = sk.continent(x - D, z) - sk.continent(x + D, z), gz = sk.continent(x, z - D) - sk.continent(x, z + D);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

/**
 * The nearest coast spot of a kind from (x, z), along a spiral out to some 30 km; null if none is met. A beach and
 * a cliff stand on land just in from the waterline, facing the sea; `under` is off the nearest beach, on the bed.
 */
export function nearestCoast(t: Terrain, kind: CoastKind, x: number, z: number): CoastSpot | null {
  const sk = t.skeleton;
  const want = kind === 'under' ? 'beach' : kind;
  const shore = spiralFind(x, z, (px, pz) => {
    sk.elevation(px, pz);
    if (!(Math.abs(sk.lastShore) <= ON_SHORE)) return null;
    const [sx, sz] = seaward(t, px, pz), h = t.height(px, pz);
    const inAt = (m: number) => t.height(px - sx * m, pz - sz * m);
    if (want === 'beach' && Math.abs(h) < 1.5 && inAt(60) < BEACH_RISE[0] && inAt(120) < BEACH_RISE[1]) return { px, pz, sx, sz };
    if (want === 'cliff' && inAt(CLIFF_IN) > CLIFF_TOP) return { px, pz, sx, sz };
    return null;
  }, 500, 1000, 100, 40000);
  if (!shore) return null;
  const { px, pz, sx, sz } = shore;
  if (kind === 'under') {
    for (let m = 5; m < 600; m += 5) {
      const ux = px + sx * m, uz = pz + sz * m, y = t.height(ux, uz);
      if (-y >= UNDER_DEPTH) return { kind, x: ux, z: uz, y, seaX: sx, seaZ: sz };
    }
    return null;
  }
  // A beach: a few metres up the sand from the water. A cliff: on its top, a little back from the edge.
  let back = 8;
  if (kind === 'cliff') {
    // Out from 60 m in towards the edge while the top holds (within a fifth of its height), then 6 m back from it.
    const top = t.height(px - sx * CLIFF_IN, pz - sz * CLIFF_IN);
    back = CLIFF_IN;
    while (back > 6 && t.height(px - sx * (back - 2), pz - sz * (back - 2)) > top * 0.8) back -= 2;
    back += 6;
  }
  const bx = px - sx * back, bz = pz - sz * back;
  return { kind, x: bx, z: bz, y: t.height(bx, bz), seaX: sx, seaZ: sz };
}
