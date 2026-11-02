/**
 * A vessel's crew at work (S3, D60; the world simulation): a ship's master and hands, a fishing boat's fishers, and
 * where each stands and what they do as the vessel lies at its berth, sails, or lies at its fishing ground. At the
 * berth the hands work cargo at the hatch and the master watches it come in; under way the helmsman holds the wheel, the
 * lookout stands at the bow and the hands work the lines at the masts' feet; a boat's fishers sail her, then haul
 * and mend their nets. Posts are in the vessel's own frame (a along it, bow +a; h up from the waterline; b across,
 * port +b), so they ride with it. Seeded and pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { hullHalf, type ShipPlan } from '@futuremagic/settlement';
import type { Person } from './people';
import type { ActivityKind } from './spots';

/** What a vessel is doing: at its mooring, under sail, or lying at its fishing ground with its sails down. */
export type VesselState = 'moored' | 'sailing' | 'lying';

/** A crew member's place in the vessel's frame, the way they face there (radians, atan2 of (b, a)) and what they do. */
export interface CrewPost {
  readonly a: number;
  readonly h: number;
  readonly b: number;
  readonly dir: number;
  readonly act: ActivityKind;
  /** A hand on a line: where the line goes up to from their hands (the vessel's frame), by way of `via` if given. */
  readonly line?: { readonly a: number; readonly h: number; readonly b: number; readonly via?: { readonly a: number; readonly h: number; readonly b: number } };
}

/** One of the crew: who, and their job aboard. */
export interface Hand {
  readonly person: Person;
  readonly job: 'master' | 'helm' | 'lookout' | 'lines' | 'fisher';
}

/** Crew ids sit far above any town's people (they are no town's: nobody keeps a talk with them by id). */
const CREW_IDS = 1_000_000;
/** How far a hand stands off a mast (m), so neither body is in the other. */
const OFF_MAST = 0.75;

/** The crew of the vessel `id` (a ship: its master, a helmsman, a lookout, hands on the lines; a boat: two fishers). */
export function crewOf(plan: ShipPlan, seed: number, id: string): Hand[] {
  const s = deriveSeed(seed, `crew:${id}`), r = new Rng(s);
  const jobs: Hand['job'][] = plan.kind === 'boat' ? ['fisher', 'fisher'] : ['master', 'helm', 'lookout', ...Array.from({ length: Math.min(4, plan.masts.length * 2) }, () => 'lines' as const)];
  return jobs.map((job, k) => {
    const ps = deriveSeed(s, 'hand', k), pr = new Rng(ps);
    // Sea folk: grown, mostly men, now and then a woman; the master older.
    const age = Math.round(job === 'master' ? pr.range(38, 62) : pr.range(18, 50));
    const person: Person = {
      id: CREW_IDS + (r.int(0, 1 << 20) << 4) + k, home: -1, work: -1, role: 'hand', trade: plan.kind === 'boat' ? 'fisher' : 'sailor',
      social: pr.float(), diligent: pr.float(), pious: pr.float(), early: pr.float(), speed: pr.range(1.1, 1.45),
      female: pr.chance(0.15), race: pr.chance(0.1) ? 'dwarf' : 'human', age, seed: ps,
    };
    return { person, job };
  });
}

/** Where `hand` (the k-th of the crew) stands and what they do while the vessel is `state`. */
export function crewPost(plan: ShipPlan, hand: Hand, k: number, state: VesselState): CrewPost {
  const fwd = 0, aft = Math.PI, toPort = Math.PI / 2, toStar = -Math.PI / 2;
  const deck = plan.deckY + 0.02;
  if (plan.kind === 'boat') {
    const half = plan.length / 2;
    // Under sail one at the tiller aft, one by the mast at the sheet; at the ground both work the nets over the side.
    if (state === 'sailing') return k === 0 ? { a: -half * 0.6, h: deck, b: 0, dir: fwd, act: 'haul' } : { a: plan.masts[0].a - OFF_MAST, h: deck, b: 0.15, dir: fwd, act: 'haul' };
    if (state === 'lying') return { a: (k === 0 ? -0.35 : 0.55) * half, h: deck, b: 0, dir: k === 0 ? toPort : toStar, act: k === 0 ? 'carry' : 'mendNets' };
    return { a: (k === 0 ? -0.4 : 0.55) * half, h: deck, b: 0, dir: k === 0 ? toPort : toStar, act: 'mendNets' };
  }
  const main = plan.masts[0], fore = plan.masts[1] ?? main, castle = plan.aft, bow = plan.fore;
  switch (hand.job) {
    case 'master':
      // On the sterncastle by the helm, watching the deck (at the berth, on the main deck abaft the mainmast, watching
      // the cargo come in).
      if (state === 'moored') return { a: main.a - 3.8, h: deck, b: 1.3, dir: fwd, act: 'wait' };
      return castle ? { a: castle.a1 - 0.7, h: castle.y + 0.02, b: 1.1, dir: fwd, act: 'wait' } : { a: 0, h: deck, b: 0, dir: fwd, act: 'wait' };
    case 'helm':
      // At the wheel (its post 1.6 m aft of the castle's front); at the berth, coiling down on the main deck.
      if (state === 'moored' || !castle) return { a: (castle?.a1 ?? 0) + 1.2, h: deck, b: 1.4, dir: toPort, act: 'mendNets' };
      // (A little to the side of it, a hand on its spokes: a big ship has its mizzen mast close behind the wheel.)
      return { a: castle.a1 - 1.6 - 0.25, h: castle.y + 0.02, b: 0.55, dir: fwd, act: 'haul' };
    case 'lookout':
      // Up on the forecastle near the bow, looking ahead; at the berth he lends a hand at the hatch.
      if (state === 'moored' && plan.hatch) return { a: plan.hatch.a1 + 0.6, h: deck, b: 0.5, dir: aft, act: 'carry' };
      return bow ? { a: bow.a0 + (bow.a1 - bow.a0) * 0.55, h: bow.y + 0.02, b: 0, dir: fwd, act: 'wait' } : { a: plan.length * 0.4, h: deck, b: 0, dir: fwd, act: 'wait' };
    default: {
      // The hands on the lines: at the masts' feet, port and starboard, hauling (at the berth: at the hatch, the cargo).
      const n = k - 3, side = n % 2 === 0 ? 1 : -1, m = n < 2 ? main : fore;
      // (At the hatch the cargo comes up on a whip from the main yard; at sea the hand hauls the yard's brace, up to
      // its arm over that side.)
      if (state === 'moored' && plan.hatch) {
        const h = plan.hatch, yard = main.yards[0];
        return { a: h.a0 + (h.a1 - h.a0) * (n < 2 ? 0.3 : 0.7), h: deck, b: side * (h.half + 0.45), dir: side > 0 ? toStar : toPort, act: 'haul', line: { a: main.a, h: yard.y, b: 0 } };
      }
      // (Belayed at the rail, it goes up outside the sail to the yard's arm.)
      const yard = m.yards[0], rail = { a: m.a, h: plan.railY + 0.1, b: side * (hullHalf(plan, m.a, plan.railY) - 0.12) };
      return { a: m.a + (n < 2 ? -OFF_MAST : OFF_MAST), h: deck, b: side * 0.9, dir: side > 0 ? toPort : toStar, act: 'haul', line: { a: m.a, h: yard.y, b: side * yard.half, via: rail } };
    }
  }
}

/** How many passengers a ship has room for on deck (more wait ashore). */
export const PASSENGER_POSTS = 3;

/**
 * Where the k-th passenger aboard a ship stands (k < PASSENGER_POSTS): at the rail looking out, forward of the
 * hatch and abaft the mainmast, and on the sterncastle looking astern (clear of the crew's posts and the ways).
 */
export function passengerPost(plan: ShipPlan, k: number): CrewPost {
  const deck = plan.deckY + 0.02, rail = (a: number, h: number) => hullHalf(plan, a, h + 0.3) - 0.18 - 0.5;
  const main = plan.masts[0];
  if (k === 0) { const a = (plan.hatch?.a1 ?? main.a + 2) + 1.6; return { a, h: deck, b: -rail(a, plan.deckY), dir: -Math.PI / 2, act: 'wait' }; }
  if (k === 1 && plan.aft) { const a = plan.aft.a0 + 1.4; return { a, h: plan.aft.y + 0.02, b: -0.6, dir: Math.PI, act: 'wait' }; }
  const a = main.a - 1.8;
  return { a, h: deck, b: -rail(a, plan.deckY), dir: -Math.PI / 2, act: 'wait' };
}
