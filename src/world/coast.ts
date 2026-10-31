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

/** A river's mouth: where it meets the sea, the way it flows there (a unit vector) and its half width. */
export interface RiverMouth {
  readonly x: number;
  readonly z: number;
  readonly fx: number;
  readonly fz: number;
  readonly half: number;
}

/** A river's last point counts as its mouth while its level is this near the sea's (m). */
const MOUTH_LEVEL = 0.5;

/** The rivers' mouths within `within` metres of (x, z) (brooks have none worth a harbour), nearest first. */
export function riverMouths(t: Terrain, x: number, z: number, within: number): RiverMouth[] {
  const out: (RiverMouth & { d: number })[] = [];
  // Each river met near (x, z) once: its last point, if that is at the sea and within reach (the points the
  // rivers' lookup visits need not include the very last).
  const seen = new Set<object>();
  t.hydro.riverPoints(x, z, within, (r) => {
    if (seen.has(r)) return;
    seen.add(r);
    const n = r.level.length, k = n - 1;
    if (n < 2 || r.level[k] > MOUTH_LEVEL) return;
    const d = Math.hypot(r.xz[k * 2] - x, r.xz[k * 2 + 1] - z);
    if (d > within) return;
    const dx = r.xz[k * 2] - r.xz[k * 2 - 2], dz = r.xz[k * 2 + 1] - r.xz[k * 2 - 1], l = Math.hypot(dx, dz) || 1;
    out.push({ x: r.xz[k * 2], z: r.xz[k * 2 + 1], fx: dx / l, fz: dz / l, half: r.half[k], d });
  }, false);
  return out.sort((a, b) => a.d - b.d);
}

/** Where a harbour town by a river's mouth goes: its middle, and the shore its quay runs along (AssetGenerator HarbourSite). */
export interface HarbourSpot {
  readonly x: number;
  readonly z: number;
  readonly harbour: { readonly x: number; readonly z: number; readonly dx: number; readonly dz: number };
}

/**
 * The spots for a harbour town of radius `r` by a river's mouth (D50: the river is its fresh water, the sea its
 * harbour), on either bank: the quay on the coast beside the mouth, the town's middle inland of it, on dry ground at
 * least 1.5 m up. Those with more dry ground round the middle first.
 */
export function harbourSpots(t: Terrain, m: RiverMouth, r: number, along: readonly number[] = HARBOUR_ALONG): HarbourSpot[] {
  const [sx, sz] = seaward(t, m.x, m.z), out: (HarbourSpot & { dry: number })[] = [];
  for (const side of [1, -1]) for (const k of along) {
    // Along the coast, one way or the other from the mouth (the river's end lies a little out at sea), past its bank
    // (nearer or farther: a place must fit in its square); then inland to the shore.
    const tx = -sz * side, tz = sx * side, off = m.half + 15 + r * k;
    let hx = NaN, hz = NaN;
    for (let s = -60; s < 400; s += 4) {
      const x = m.x + tx * off - sx * s, z = m.z + tz * off - sz * s;
      if (t.waterDepth(x, z) <= 0) { hx = x; hz = z; break; }
    }
    if (Number.isNaN(hx)) continue;
    const cx = hx - sx * r * 0.6, cz = hz - sz * r * 0.6;
    if (t.height(cx, cz) < 1.5 || t.waterDepth(cx, cz) > 0) continue;
    // Dry ground round the middle, on its landward side (the sea before it is the harbour's).
    let dry = 0, all = 0;
    for (let a = 0; a < 8; a++) for (const q of [0.4, 0.8]) {
      const ox = Math.cos((a * Math.PI) / 4) * r * q, oz = Math.sin((a * Math.PI) / 4) * r * q;
      if (ox * sx + oz * sz > r * 0.3) continue;
      all++;
      if (t.waterDepth(cx + ox, cz + oz) <= 0 && t.height(cx + ox, cz + oz) > 0.8) dry++;
    }
    if (dry < all * 0.75) continue;
    out.push({ x: cx, z: cz, harbour: { x: hx, z: hz, dx: sx, dz: sz }, dry });
  }
  return out.sort((a, b) => b.dry - a.dry).map(({ x, z, harbour }) => ({ x, z, harbour }));
}

/** How far along the coast from a river's mouth a harbour town's quay may be centred, in town radii past the bank. */
const HARBOUR_ALONG = [0.45, 0.9, 1.4];
