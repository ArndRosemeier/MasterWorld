/**
 * Passage by sea (S4, plan 5.4, D60): a harbour master sells a berth aboard a ship to another harbour town along the
 * coast. The way is found over deep water from off one harbour's mouth to off the other's, and kept in the log with
 * the voyage, so the ship sails the same way on every replay. When no harbour lies within the setting's reach, the
 * VGM opens one at a river's mouth along the coast (`farHarbourFor`), before the ship gets there: the Builder builds
 * it as the frontier's towns are built. Taking passage is a `journey` decision `by: 'sea'` (plan 4.4: the VGM knows
 * where the hero will be). Pure.
 */
import { routeRoad } from '@futuremagic/settlement';
import { coinText } from '../game/items';
import type { VoyageDef } from '../setting/contract';
import { fill } from '../talk/folk';
import { riverMouths } from '../world/coast';
import { settlementOf, type DecisionLog, type HarbourAt, type JourneyDecision, type RegionDecision, type TownDecision } from '../world/decisions';
import { wayLength, type Voyage } from '../world/fleet';
import { compass } from './dungeons';
import { heldBy } from './events';
import { harbourRegion, type FrontierContext } from './frontier';
import { CLOCK, arrivedNote, journeyOf } from './journeys';

/** A ship needs this much water under her (m): her draft and some to spare. */
export const SEA_DEPTH = 4.5;
/** The way's grid cell and the spacing of its points (m). */
const CELL = 40, SPACING = 25;
/** How far out from a harbour's shore its way starts at most (m): past the piers, where the water is deep. */
const OFF_SHORE = 700;

/** A ship's way from one harbour town to another: over the water (x, z, ...), how far, how long (game hours), the fare. */
export interface SeaWay {
  readonly to: string;
  readonly route: readonly number[];
  readonly metres: number;
  readonly hours: number;
  readonly fare: number;
  /** Where it goes, as the harbour master says it ("the village 4.6 km west"), and as it is called there. */
  readonly place: string;
  readonly name: string;
  /** To an island (S7): the harbour master tells what sailors say of it. */
  readonly isle?: true;
}

/** Off a harbour's shore, out along its way to sea, where a ship has water enough (null: none within OFF_SHORE). */
export function offShore(h: HarbourAt, water: (x: number, z: number) => number): { x: number; z: number } | null {
  for (let d = 60; d <= OFF_SHORE; d += 20) {
    const x = h.x + h.dx * d, z = h.z + h.dz * d;
    // (Some room round it too: the ship turns there.)
    if (water(x, z) >= SEA_DEPTH && water(x + h.dx * 40, z + h.dz * 40) >= SEA_DEPTH) return { x, z };
  }
  return null;
}

/** The way over deep water from off harbour `a` to off harbour `b` (x, z, ...), or null where the sea does not join them. */
export function seaRoute(seed: number, water: (x: number, z: number) => number, a: HarbourAt, b: HarbourAt): number[] | null {
  const from = offShore(a, water), to = offShore(b, water);
  if (!from || !to) return null;
  // The road finder over a flat sea, where anything shallower than a ship's need is solid ground.
  const r = routeRoad({ seed, height: () => 0, blocked: (x, z) => water(x, z) < SEA_DEPTH }, [from.x, from.z], [to.x, to.z], { cell: CELL, ford: 0, spacing: SPACING });
  return r ? r.pts : null;
}

/** The voyage from `from` to `to` along `route`: its length, time and fare. */
export function seaWay(def: VoyageDef, from: TownDecision, to: TownDecision, route: readonly number[]): SeaWay {
  const metres = wayLength(route), km = Math.hypot(to.x - from.x, to.z - from.z) / 1000, name = to.isle ? 'the island' : `the ${to.size ?? 'town'}`;
  return {
    to: to.id, route, metres, ...(to.isle ? { isle: true as const } : {}),
    hours: (metres / def.speed) * CLOCK / 3600,
    fare: Math.max(def.least, Math.round((metres / 1000) * def.perKm)),
    name,
    place: `${name} ${km.toFixed(km < 10 ? 1 : 0)} km ${compass(to.x - from.x, to.z - from.z)}`,
  };
}

/**
 * Where ships from `from` sail: the `offers` nearest other harbour towns in reach that nobody holds and the sea joins
 * to it, nearest first.
 */
export function seaWays(def: VoyageDef, seed: number, log: DecisionLog, from: TownDecision, towns: readonly TownDecision[], water: (x: number, z: number) => number): SeaWay[] {
  if (!from.harbour) return [];
  const out: SeaWay[] = [];
  const near = towns
    .filter((t) => t.id !== from.id && t.harbour && !heldBy(log, t.id) && Math.hypot(t.x - from.x, t.z - from.z) <= def.reach[1])
    .sort((a, b) => Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z));
  for (const t of near) {
    if (out.length >= def.offers) break;
    const route = seaRoute(seed, water, from.harbour, t.harbour!);
    if (route) out.push(seaWay(def, from, t, route));
  }
  return out;
}

/**
 * The VGM's far harbour (S4): when no harbour town lies within the setting's reach of `from`, one opened at the
 * nearest river's mouth along the coast that lies in reach and that the sea joins to `from`'s harbour (its region,
 * to append to the log; the Builder builds its town before the ship comes in). Null: a harbour is in reach already,
 * or the coast has no mouth that fits.
 */
export function farHarbourFor(def: VoyageDef, c: FrontierContext, from: TownDecision, towns: readonly TownDecision[], water: (x: number, z: number) => number): RegionDecision | null {
  if (!from.harbour) return null;
  if (decided(c, towns).some((t) => t.id !== from.id && t.harbour && Math.hypot(t.x - from.x, t.z - from.z) <= def.reach[1])) return null;
  const fromHome = (m: { x: number; z: number }) => Math.hypot(m.x - from.x, m.z - from.z);
  const mouths = riverMouths(c.terrain, from.x, from.z, def.reach[1]).filter((m) => fromHome(m) >= def.reach[0]).sort((a, b) => fromHome(a) - fromHome(b));
  for (const m of mouths) {
    const r = harbourRegion(c, { x: m.x, z: m.z });
    const at = r?.site?.harbour;
    if (r && at && seaRoute(c.seed, water, from.harbour, at)) return r;
  }
  return null;
}

/**
 * The towns known so far and those only decided in the log (a region opened but not built yet): a town asked for
 * again before it stands is not founded twice.
 */
export function decided(c: Pick<FrontierContext, 'log' | 'regions'>, towns: readonly TownDecision[]): TownDecision[] {
  const out = [...towns];
  for (const d of c.log) {
    const t = d.kind === 'region' ? settlementOf(d, c.regions.fills) : null;
    if (t && !out.some((o) => o.id === t.id)) out.push(t);
  }
  return out;
}

/** The harbour master's topic for a way. */
export function voyageTopic(def: VoyageDef, w: SeaWay): string {
  return fill(w.isle ? def.words.island : def.words.topic, { place: w.place, price: coinText(w.fare) });
}

/** The note on coming in. */
export function voyageArrived(def: VoyageDef, w: { name: string; hours: number }): string {
  return arrivedNote(def.words.arrived, w);
}

/** The voyage passage is (to append to the log): it sails at `at`, along its way, and comes in `w.hours` later. */
export function voyageOf(log: DecisionLog, from: string, w: SeaWay, at: number): JourneyDecision {
  return { ...journeyOf(log, from, w, at), by: 'sea', route: [...w.route] };
}

/** The voyages in the log (journeys by sea): from which harbour town's ship to which, when and along which way. */
export function voyagesIn(log: DecisionLog): { readonly id: string; readonly from: string; readonly to: string; readonly v: Voyage }[] {
  const out: { id: string; from: string; to: string; v: Voyage }[] = [];
  for (const d of log) if (d.kind === 'journey' && d.by === 'sea' && d.route) out.push({ id: d.id, from: d.from, to: d.to, v: { at: d.at, arrive: d.arrive, route: d.route } });
  return out;
}
