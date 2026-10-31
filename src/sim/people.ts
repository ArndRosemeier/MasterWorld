/**
 * The townsfolk (plan 9.2): who lives in which house, what each does for a living, and their day.
 * Households come from the town plan; the first of a house with a trade works it, the market's stalls
 * get traders, the temple a keeper, and the rest keep house, lend a hand at a trade or, as children,
 * play. Traits (sociable, diligent, pious, early riser) shift the day (routines.ts) and the choices. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { distToPoly, type TownPlan } from '@futuremagic/settlement';

/** Their people (D34; the setting's peoples, by Actors' race ids). */
export type Race = 'human' | 'dwarf' | 'halfling' | 'elf';

/** What a person does for a living. */
export type Role = 'trade' | 'trader' | 'keeper' | 'hand' | 'homemaker' | 'child' | 'traveller';

export interface Person {
  id: number;
  /** The building they live in. */
  home: number;
  /** The building they work at (-1: none, or the market's stalls for a trader). */
  work: number;
  role: Role;
  /** The building's trade for 'trade' and 'hand' ('smith', 'baker' ...); '' otherwise. */
  trade: string;
  /** Dressed for their calling rather than by role: a guild's master at arms, an old caravan hand. */
  dress?: 'fighter' | 'traveller';
  /** A traveller who comes and goes by sea (a harbour town's): the end of each visit is spent aboard, waiting to sail. */
  bySea?: boolean;
  /** 0..1 each. */
  social: number;
  diligent: number;
  pious: number;
  early: number;
  /** Walking speed, m/s. */
  speed: number;
  female: boolean;
  race: Race;
  /** Years. */
  age: number;
  seed: number;
}

/** Buildings whose whole household works there. */
const FAMILY_TRADES = new Set<string>(['inn', 'farmhouse']);

/** From this age people are old: they walk slower, by OLD_PACE (elves age slowly and never are). */
export const OLD_AGE = 58;
const OLD_PACE = 0.72;

/** Everyone living in a town. */
export function townsfolk(plan: TownPlan, seed: number): Person[] {
  const r = new Rng(deriveSeed(seed, 'townsfolk'));
  const people: Person[] = [];
  const houseOne = (home: number, work: number, role: Role, trade: string) => {
    const id = people.length, s = deriveSeed(seed, 'person', id), pr = new Rng(s);
    const child = role === 'child';
    const traits = { social: pr.float(), diligent: pr.float(), pious: pr.float(), early: pr.float(), speed: child ? pr.range(1.4, 1.8) : pr.range(1.1, 1.45) };
    const female = pr.chance(0.5), age = Math.round(child ? pr.range(4, 15) : pr.range(18, 68));
    // The old walk slower (and are drawn with an old walk: render/folk/gaits.ts).
    if (age >= OLD_AGE) traits.speed *= OLD_PACE;
    people.push({ id, home, work, role, trade, ...traits, female, race: 'human', age, seed: s });
    return people[id];
  };
  const trades = plan.buildings.filter((b) => b.trade && b.kind !== 'temple');
  for (const b of plan.buildings) {
    if (b.household <= 0) continue;
    let adults = 0;
    for (let k = 0; k < b.household; k++) {
      if (k === 0 && b.trade) { houseOne(b.id, b.id, 'trade', b.trade); adults++; continue; }
      if (adults < 2 || r.chance(0.15)) {
        adults++;
        // A household that lives by its own place (the inn, a farm) all work it; elsewhere some lend a
        // hand at a trade in town, most keep house.
        if (b.trade && FAMILY_TRADES.has(b.kind)) houseOne(b.id, b.id, 'hand', b.trade);
        else if (trades.length && r.chance(0.3)) { const t = r.pick(trades); houseOne(b.id, t.id, 'hand', t.trade); } else houseOne(b.id, -1, 'homemaker', '');
      } else houseOne(b.id, -1, 'child', '');
    }
  }
  // Traders for the stalls, from the houses nearest the market.
  const stalls = plan.fixtures.filter((f) => f.kind === 'stall').length;
  const byMarket = people.filter((p) => p.role === 'homemaker')
    .sort((a, b) => marketDist(plan, a.home) - marketDist(plan, b.home));
  for (const p of byMarket.slice(0, stalls)) p.role = 'trader';
  // The temple's keeper lives nearest to it.
  const temple = buildingOf(plan, 'temple');
  if (temple) {
    const near = people.filter((p) => p.role === 'homemaker')
      .sort((a, b) => dist(plan, a.home, temple.cx, temple.cz) - dist(plan, b.home, temple.cx, temple.cz))[0];
    if (near) { near.role = 'keeper'; near.work = temple.id; near.trade = 'keeper'; }
  }
  // Peoples (plan 12.1): the start town is mostly human; dwarves keep the smithy and one more house (a
  // miner family, the one farthest out), a halfling family runs the inn.
  const houses = plan.buildings.filter((b) => b.kind === 'house' && b.household > 0);
  const miners = houses.sort((a, b) => marketDist(plan, b.id) - marketDist(plan, a.id))[0];
  for (const p of people) {
    const b = plan.buildings[p.home];
    if (b.kind === 'smithy' || b === miners) p.race = 'dwarf';
    else if (b.kind === 'inn') p.race = 'halfling';
  }
  // The odd elf passing through, lodging at the inn while in town (away()).
  const inn = buildingOf(plan, 'inn');
  if (inn) {
    const elf = houseOne(inn.id, -1, 'traveller', '');
    elf.race = 'elf';
    elf.age = Math.round(new Rng(deriveSeed(elf.seed, 'age')).range(90, 400));
    // A harbour's inn lodges travellers by sea too (S3), passengers aboard its ships before they sail.
    if (plan.harbour) for (let k = 0; k < SEA_TRAVELLERS; k++) {
      const p = houseOne(inn.id, -1, 'traveller', ''), pr = new Rng(deriveSeed(p.seed, 'sea'));
      p.bySea = true;
      p.race = pr.chance(0.15) ? 'dwarf' : pr.chance(0.1) ? 'halfling' : 'human';
    }
  }
  return people;
}

/** The town's first building of a kind (its inn, its temple), if it has one. */
export const buildingOf = (plan: Pick<TownPlan, 'buildings'>, kind: string) => plan.buildings.find((b) => b.kind === kind);

const marketDist = (plan: TownPlan, home: number) => {
  const b = plan.buildings[home];
  return distToPoly(plan.market, b.door[0], b.door[1]);
};
const dist = (plan: TownPlan, home: number, x: number, z: number) => Math.hypot(plan.buildings[home].cx - x, plan.buildings[home].cz - z);

/** A traveller's visits come round every this many game hours. */
const VISIT = 72;
/** A harbour inn's travellers by sea, and the hours before each visit's end they are aboard their ship. */
const SEA_TRAVELLERS = 3, ABOARD = 4;

/**
 * Whether a traveller is out of town at `hours` game hours since the start (day × 24 + hour): each visit
 * begins late in the morning, lasts the night at the inn and ends about the next noon. Others never are.
 */
export function away(p: Person, hours: number): boolean {
  if (p.role !== 'traveller') return false;
  const { t, from, to } = visitOf(p, hours);
  return t < from || t >= to || aboardAt(p, hours);
}

/** Whether a traveller by sea is aboard their ship at `hours`: the last ABOARD hours of each visit (S3). */
export function aboardAt(p: Person, hours: number): boolean {
  if (!p.bySea) return false;
  const { t, from, to } = visitOf(p, hours);
  return t >= Math.max(from, to - ABOARD) && t < to;
}

/** Where `hours` falls in a traveller's round of visits: hours into it, and the visit's start and end then. */
function visitOf(p: Person, hours: number): { t: number; from: number; to: number } {
  const k = Math.floor(hours / VISIT), r = new Rng(deriveSeed(p.seed, 'visit', k));
  return { t: hours - k * VISIT, from: r.range(9, 15), to: 24 + r.range(10, 15) };
}
