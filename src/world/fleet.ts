/**
 * A harbour town's ships and boats through the day (S2, the world simulation): the ships lie at their berths
 * (voyages come with S4), the fishing boats go out at dawn to their grounds off the coast, fish there and come
 * back in the early afternoon. Where each is follows from the seed and the hour alone, so it needs no state and
 * every view of it agrees. Pure.
 */
import { deriveSeed, Rng } from '@futuremagic/core';
import { berthMooring, freeBerths, harbourMoorings, planShip, type HarbourPlan, type Mooring, type ShipPlan } from '@futuremagic/settlement';

/** Where a ship or boat is at an hour: its middle, its heading (unit, bow first) and whether its sails are set. */
export interface Afloat {
  readonly x: number;
  readonly z: number;
  readonly ux: number;
  readonly uz: number;
  readonly sailing: boolean;
  /** Lying at a berth not her own (a voyage's far quay): that berth as she lies there, for her gangplank. */
  readonly berth?: Mooring;
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

/** A voyage as the fleet knows it (a journey by sea in the log): when the ship sails, when she comes in, her way over the sea. */
export interface Voyage {
  readonly at: number;
  readonly arrive: number;
  readonly route: readonly number[];
}

/** How long a ship lies at the far quay before she sails home (game hours). */
export const LIE_OVER = 6;
/**
 * Out at sea, away from both harbours, the clock runs this many times faster aboard (plan S4: the crossing goes by
 * quicker, as a day at sea does); from OPEN_SEA off either end of the way, rising to it over RAMP (m).
 */
export const SEA_PACE = 3;
const OPEN_SEA = 400, RAMP = 500;
/** Leaving or coming to a berth, a ship runs this far straight out past it (m) before she turns onto her way. */
const CLEAR_BERTH = 60;

/** A voyage's whole way: out from her berth `from` bow first, her way over the sea, in to the berth `to` (bow in). */
/** The voyage of `voyages` that ship `ship` (`town/i`) is under way on at `hours`, cast off and not yet in (null: none). */
export function underWay<T extends { readonly from: string; readonly v: Voyage }>(voyages: readonly T[], ship: string, hours: number): T | null {
  return voyages.find((o) => ship.startsWith(`${o.from}/`) && o.v.at <= hours && hours < o.v.arrive) ?? null;
}

/** How fast the clock runs (times the land's) for someone aboard a ship at (x, z) on voyage `v` at `hours`. */
export function seaPace(v: Voyage, hours: number, x: number, z: number): number {
  const r = v.route, n = r.length;
  if (hours < v.at || hours >= v.arrive || n < 2) return 1;
  const off = Math.min(Math.hypot(x - r[0], z - r[1]), Math.hypot(x - r[n - 2], z - r[n - 1]));
  return 1 + (SEA_PACE - 1) * Math.min(1, Math.max(0, (off - OPEN_SEA) / RAMP));
}

export function voyageWay(v: Voyage, from: Mooring, to: Mooring): number[] {
  return [from.x, from.z, from.x + from.ux * CLEAR_BERTH, from.z + from.uz * CLEAR_BERTH, ...v.route, to.x + to.ux * CLEAR_BERTH, to.z + to.uz * CLEAR_BERTH, to.x, to.z];
}

/**
 * Where the ship of voyage `v` is at `hours` (her own berth `from`, the far harbour's free berth `to`): sailing her
 * way until she comes in, lying at the far quay for LIE_OVER hours, then sailing home the same way. Null: she lies
 * at home (before she sails, and once back).
 */
export function voyageAfloat(v: Voyage, from: Mooring, to: Mooring, hours: number): Afloat | null {
  if (hours < v.at) return null;
  const way = voyageWay(v, from, to), length = wayLength(way), span = Math.max(1e-6, v.arrive - v.at);
  if (hours < v.arrive) {
    const p = alongWay(way, (length * (hours - v.at)) / span);
    return { x: p.x, z: p.z, ux: p.dx, uz: p.dz, sailing: true };
  }
  // In bow first: she lies the other way round to her berth's own heading, her land side the other side.
  if (hours < v.arrive + LIE_OVER) return { x: to.x, z: to.z, ux: -to.ux, uz: -to.uz, sailing: false, berth: { ...to, ux: -to.ux, uz: -to.uz, side: to.side === 1 ? -1 : 1 } };
  const back = hours - v.arrive - LIE_OVER;
  if (back >= span) return null;
  const p = alongWay(way, length * (1 - back / span));
  return { x: p.x, z: p.z, ux: -p.dx, uz: -p.dz, sailing: true };
}

/** The ship of a harbour's fleet that takes passengers (S4): its first ship (none: the harbour has no ship). */
export function passageShip(fleet: readonly Vessel[]): Vessel | null {
  return fleet.find((v) => v.mooring.plan.kind === 'ship' && !v.trip) ?? null;
}

/** A ship from elsewhere may lie this much longer than a berth (m): her bow or stern a little past its end. */
const OVERHANG = 2;
/** Water under her keel at a far berth, at the least (m). */
const KEEL = 0.1;

/**
 * Where ship `plan` comes in at harbour `h` (its town's `seed`): the first berth its own ships leave free that takes
 * her (water enough under her keel, the berth about her length).
 */
export function farBerth(h: HarbourPlan, seed: number, plan: ShipPlan): Mooring | null {
  const i = freeBerths(h, seed).find((k) => h.berths[k].length >= plan.length - OVERHANG && h.berths[k].depth >= plan.draft + KEEL);
  return i === undefined ? null : berthMooring(h, i, plan);
}

/**
 * A wreck on the sea bed (S8, `vgm/wrecks.ts`): her plan and how she lies, from the decision alone. On her side (a
 * seeded list either way, her masts laid over towards the bed), bow a little up or down, sunk into the bed `bed` (its height there) to half her draft.
 */
export function wreckLying(d: { readonly x: number; readonly z: number; readonly yaw: number; readonly seed: number }, bed: number): { plan: ShipPlan; pose: { x: number; y: number; z: number; ux: number; uz: number; pitch: number; roll: number } } {
  const r = new Rng(deriveSeed(d.seed, 'wreck')), plan = planShip(d.seed, 'ship');
  const roll = r.range(WRECK_LIST[0], WRECK_LIST[1]) * (r.chance(0.5) ? 1 : -1), pitch = r.range(-0.06, 0.06);
  return { plan, pose: { x: d.x, y: bed + plan.draft * 0.5, z: d.z, ux: Math.sin(d.yaw), uz: Math.cos(d.yaw), pitch, roll } };
}
/** How far a wreck lies over on her side (rad), least and most. */
const WRECK_LIST: readonly [number, number] = [1.0, 1.35];
