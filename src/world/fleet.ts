/**
 * A harbour town's ships and boats through the day (S2, the world simulation): the ships lie at their berths
 * (voyages come with S4), the fishing boats go out at dawn to their grounds off the coast, fish there and come
 * back in the early afternoon. Where each is follows from the seed and the hour alone, so it needs no state and
 * every view of it agrees. Pure.
 */
import { deriveSeed, Rng } from '@futuremagic/core';
import { harbourMoorings, type HarbourPlan, type Mooring } from '@futuremagic/settlement';

/** Where a ship or boat is at an hour: its middle, its heading (unit, bow first) and whether its sails are set. */
export interface Afloat {
  readonly x: number;
  readonly z: number;
  readonly ux: number;
  readonly uz: number;
  readonly sailing: boolean;
}

/** One of the harbour's vessels: its mooring, and for a fishing boat its day out. */
export interface Vessel {
  readonly mooring: Mooring;
  /** A fishing boat's way out (from its mooring) and the hours it leaves and turns back; none for a ship. */
  readonly trip: { readonly way: readonly number[]; readonly leave: number; readonly back: number } | null;
}

/** Boats sail at this speed (m/s; some 7 km/h), out to grounds this far off the harbour (m). */
const SPEED = 2;
const GROUND = [900, 1800] as const;
/** They leave at dawn and turn back in the early afternoon (hours of the day, before the seed's jitter). */
const LEAVE = 5.2, BACK = 13;

/** The harbour's vessels, seeded by the town's seed. `water(x, z)` > 0 at sea (its depth). */
export function fleetOf(h: HarbourPlan, seed: number, water: (x: number, z: number) => number): Vessel[] {
  return harbourMoorings(h, seed).map((m, i) => {
    if (m.plan.kind !== 'boat') return { mooring: m, trip: null };
    const r = new Rng(deriveSeed(seed, `boat-${i}`));
    // Out past the pier heads along the harbour's way to sea, then to a ground a turn either side of it.
    const n = h.edge.length >> 1, k = Math.min(n - 1, Math.max(0, Math.round(r.range(0.2, 0.8) * (n - 1))));
    const ox = h.out[k * 2], oz = h.out[k * 2 + 1];
    const mouth = [h.edge[k * 2] + ox * 90, h.edge[k * 2 + 1] + oz * 90];
    const turn = r.range(-0.6, 0.6), far = r.range(GROUND[0], GROUND[1]);
    const gx = Math.cos(turn) * ox - Math.sin(turn) * oz, gz = Math.sin(turn) * ox + Math.cos(turn) * oz;
    let ground = [mouth[0] + gx * far, mouth[1] + gz * far];
    // Not onto land (a headland across the way): back towards the mouth until at sea.
    for (let f = far; f > 100 && water(ground[0], ground[1]) < 3; f -= 100) ground = [mouth[0] + gx * f, mouth[1] + gz * f];
    // Off the quay first (alongside, it turns out from it), then the mouth, then the ground.
    const off = [m.x + ox * 12, m.z + oz * 12];
    return { mooring: m, trip: { way: [m.x, m.z, off[0], off[1], mouth[0], mouth[1], ground[0], ground[1]], leave: LEAVE + r.range(0, 1), back: BACK + r.range(0, 1.5) } };
  });
}

/** Where a vessel is at `hours` (the game's clock: day × 24 + hour). */
export function afloatAt(v: Vessel, hours: number): Afloat {
  const m = v.mooring, moored: Afloat = { x: m.x, z: m.z, ux: m.ux, uz: m.uz, sailing: false };
  if (!v.trip) return moored;
  const { way, leave, back } = v.trip, hour = ((hours % 24) + 24) % 24;
  const length = wayLength(way), trip = length / SPEED / 3600;
  // Out: from leaving until there; at the ground until turning back; home again the same way.
  if (hour < leave || hour > back + trip) return moored;
  const at = hour < leave + trip ? (hour - leave) * 3600 * SPEED : hour < back ? length : length - (hour - back) * 3600 * SPEED;
  const home = hour >= back;
  const p = alongWay(way, Math.max(0, Math.min(length, at)));
  // At the ground it lies head to the wind with its sails down; on the way it sails, bow along its course.
  if (hour >= leave + trip && hour < back) return { x: p.x, z: p.z, ux: p.dx, uz: p.dz, sailing: false };
  return { x: p.x, z: p.z, ux: home ? -p.dx : p.dx, uz: home ? -p.dz : p.dz, sailing: true };
}

/** The length of a way (x, z, ...), m. */
export function wayLength(w: readonly number[]): number {
  let s = 0;
  for (let i = 2; i < w.length; i += 2) s += Math.hypot(w[i] - w[i - 2], w[i + 1] - w[i - 1]);
  return s;
}

/** The point `d` metres along a way and its direction there. */
export function alongWay(w: readonly number[], d: number): { x: number; z: number; dx: number; dz: number } {
  for (let i = 2; i < w.length; i += 2) {
    const sx = w[i] - w[i - 2], sz = w[i + 1] - w[i - 1], L = Math.hypot(sx, sz);
    if (d <= L || i === w.length - 2) { const f = L > 0 ? Math.min(1, d / L) : 0; return { x: w[i - 2] + sx * f, z: w[i - 1] + sz * f, dx: sx / (L || 1), dz: sz / (L || 1) }; }
    d -= L;
  }
  return { x: w[0], z: w[1], dx: 1, dz: 0 };
}
