/**
 * Fast travel (plan 4.4, 5.4, D37; C7): a seat on the cart from one town's inn to the inn of another town
 * the hero has been to. The ways and fares follow the setting's `travel`; taking a seat is a `journey`
 * decision in the log, so the VGM knows where the hero will be before they get there (a journey is a
 * promise too, 4.4). No cart goes to a settlement others hold (a take, C6). Pure.
 */
import type { TownPlan } from '@futuremagic/settlement';
import { coinText } from '../game/items';
import type { TravelDef } from '../setting/contract';
import { buildingOf } from '../sim/people';
import { cap, fill } from '../talk/folk';
import type { DecisionLog, JourneyDecision, TownDecision } from '../world/decisions';
import { compass } from './dungeons';
import { heldBy } from './events';

/** The game clock runs this many times faster than the hero's (D37: a day in 60 real minutes). */
export const CLOCK = 24;

/** A cart's way from one town to another: how far by road (m), how long in game hours, the fare (copper). */
export interface CartWay {
  readonly to: string;
  readonly metres: number;
  readonly hours: number;
  readonly fare: number;
  /** Where it goes, as the innkeeper says it ("the hamlet 2.3 km north"), and as it is called there ("the hamlet"). */
  readonly place: string;
  readonly name: string;
}

/** A town as the carts know it: where it is, and whether it has an inn for the cart to stop at. */
export interface CartTown {
  readonly decision: TownDecision;
  readonly plan: Pick<TownPlan, 'buildings'>;
}

/** The cart from `from` to `to`: its road, time and fare. */
export function cartWay(def: TravelDef, from: TownDecision, to: TownDecision): CartWay {
  const metres = Math.hypot(to.x - from.x, to.z - from.z) * def.road;
  const km = metres / 1000, name = `the ${to.size ?? 'town'}`;
  return {
    to: to.id, metres,
    hours: (metres / def.speed) * CLOCK / 3600,
    fare: Math.max(def.least, Math.round(km * def.perKm)),
    name,
    place: `${name} ${km < 1 ? `${Math.round(metres / 100) * 100} m` : `${km.toFixed(km < 10 ? 1 : 0)} km`} ${compass(to.x - from.x, to.z - from.z)}`,
  };
}

/**
 * Where the cart from `from` goes: the `offers` nearest towns the hero has `been` to that have an inn and
 * that nobody holds, nearest first.
 */
export function cartWays(def: TravelDef, log: DecisionLog, from: CartTown, towns: readonly CartTown[], been: (id: string) => boolean): CartWay[] {
  return towns
    .filter((t) => t.decision.id !== from.decision.id && been(t.decision.id) && !!buildingOf(t.plan, 'inn') && !heldBy(log, t.decision.id))
    .map((t) => cartWay(def, from.decision, t.decision))
    .sort((a, b) => a.metres - b.metres)
    .slice(0, def.offers);
}

/** The innkeeper's topic for a way. */
export function cartTopic(def: TravelDef, w: CartWay): string {
  return fill(def.words.topic, { place: w.place, price: coinText(w.fare) });
}

/** The note on arriving. */
export function cartArrived(def: TravelDef, w: CartWay): string {
  return arrivedNote(def.words.arrived, w);
}

/** A note on arriving somewhere (`words`: with `{place}` and `{hours}`), the hours on the way rounded. */
export function arrivedNote(words: string, w: { readonly name: string; readonly hours: number }): string {
  const h = Math.max(1, Math.round(w.hours));
  return cap(fill(words, { place: w.name, hours: `${h} hour${h === 1 ? '' : 's'}` }));
}

/** The journey a seat on the cart is (to append to the log): it sets out at `at` and arrives `w.hours` later. */
export function journeyOf(log: DecisionLog, from: string, w: CartWay, at: number): JourneyDecision {
  const n = log.filter((d) => d.kind === 'journey').length + 1;
  return { kind: 'journey', id: `journey-${n}`, from, to: w.to, fare: w.fare, at, arrive: at + w.hours };
}
