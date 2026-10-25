/**
 * The townsfolk (plan 9.2): who lives in which house, what each does for a living, and their day.
 * Households come from the town plan; the first of a house with a trade works it, the market's stalls
 * get traders, the temple a keeper, and the rest keep house, lend a hand at a trade or, as children,
 * play. Traits (sociable, diligent, pious, early riser) shift the day and the choices. Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { distToPoly, type TownPlan } from '@futuremagic/settlement';

/** What a person does for a living. */
export type Role = 'trade' | 'trader' | 'keeper' | 'hand' | 'homemaker' | 'child';

export interface Person {
  id: number;
  /** The building they live in. */
  home: number;
  /** The building they work at (-1: none, or the market's stalls for a trader). */
  work: number;
  role: Role;
  /** The building's trade for 'trade' and 'hand' ('smith', 'baker' ...); '' otherwise. */
  trade: string;
  /** 0..1 each. */
  social: number;
  diligent: number;
  pious: number;
  early: number;
  /** Walking speed, m/s. */
  speed: number;
  female: boolean;
  /** Years. */
  age: number;
  seed: number;
}

/** The parts of a day (each person's own hours). */
export type Block = 'sleep' | 'morning' | 'work' | 'meal' | 'evening';

/** Everyone living in a town. */
export function townsfolk(plan: TownPlan, seed: number): Person[] {
  const r = new Rng(deriveSeed(seed, 'townsfolk'));
  const people: Person[] = [];
  const houseOne = (home: number, work: number, role: Role, trade: string) => {
    const id = people.length, s = deriveSeed(seed, 'person', id), pr = new Rng(s);
    const child = role === 'child';
    const traits = { social: pr.float(), diligent: pr.float(), pious: pr.float(), early: pr.float(), speed: child ? pr.range(1.4, 1.8) : pr.range(1.1, 1.45) };
    people.push({ id, home, work, role, trade, ...traits, female: pr.chance(0.5), age: Math.round(child ? pr.range(4, 15) : pr.range(18, 68)), seed: s });
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
        // Some lend a hand at a trade in town, most keep house.
        if (trades.length && r.chance(0.3)) { const t = r.pick(trades); houseOne(b.id, t.id, 'hand', t.trade); } else houseOne(b.id, -1, 'homemaker', '');
      } else houseOne(b.id, -1, 'child', '');
    }
  }
  // Traders for the stalls, from the houses nearest the market.
  const stalls = plan.fixtures.filter((f) => f.kind === 'stall').length;
  const byMarket = people.filter((p) => p.role === 'homemaker')
    .sort((a, b) => marketDist(plan, a.home) - marketDist(plan, b.home));
  for (const p of byMarket.slice(0, stalls)) p.role = 'trader';
  // The temple's keeper lives nearest to it.
  const temple = plan.buildings.find((b) => b.kind === 'temple');
  if (temple) {
    const near = people.filter((p) => p.role === 'homemaker')
      .sort((a, b) => dist(plan, a.home, temple.cx, temple.cz) - dist(plan, b.home, temple.cx, temple.cz))[0];
    if (near) { near.role = 'keeper'; near.work = temple.id; near.trade = 'keeper'; }
  }
  return people;
}

const marketDist = (plan: TownPlan, home: number) => {
  const b = plan.buildings[home];
  return distToPoly(plan.market, b.door[0], b.door[1]);
};
const dist = (plan: TownPlan, home: number, x: number, z: number) => Math.hypot(plan.buildings[home].cx - x, plan.buildings[home].cz - z);

/** Which part of their day a person is in at `hour` (0..24). */
export function blockAt(p: Person, hour: number): Block {
  const h = ((hour % 24) + 24) % 24;
  const wake = 5.5 + p.early * 1.5, bed = p.role === 'child' ? 20 + p.early * 0.5 : 21 + p.social * 1.5;
  if (h < wake || h >= bed) return 'sleep';
  if (h < wake + 1) return 'morning';
  if (h >= 12 - p.diligent * 0.25 && h < 13 - p.diligent * 0.25) return 'meal';
  if (h < 17 + p.diligent * 0.75) return 'work';
  return 'evening';
}
