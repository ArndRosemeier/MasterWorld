/**
 * Who in town knows of a promised cellar (plan 4.2, 9.1): the household above has seen and heard it
 * themselves; one of them has told the innkeeper and a neighbour or two, who pass it on as hearsay ("I
 * heard it from Mara Hollin"). Plain data the talk layer plants as facts and testimony. Pure.
 */
import type { TownPlan } from '@futuremagic/settlement';
import type { Person } from '../sim/people';
import type { CellarSketch } from '../world/dungeon/cellar';

export interface CellarHint {
  /** The dungeon decision's id. */
  readonly cellar: string;
  /** The building above (index into the town plan's buildings). */
  readonly building: number;
  /** Who knows it first-hand: the grown-ups of the household. */
  readonly knowers: readonly number[];
  /** Who told whom (person ids): hearsay that leads the player to the house. */
  readonly told: readonly { readonly from: number; readonly to: number }[];
}

/** Neighbours who heard of it, besides the innkeeper. */
const NEIGHBOURS = 2;

export function cellarHint(sketch: CellarSketch, people: readonly Person[], plan: TownPlan): CellarHint {
  const b = sketch.knownBy.building;
  // Grown locals: children and travellers passing through hear nothing of the house's troubles.
  const grown = (p: Person) => p.role !== 'child' && p.role !== 'traveller';
  const household = people.filter((p) => p.home === b);
  const knowers = household.filter(grown).map((p) => p.id);
  // The talker of the house tells the others.
  const teller = household.filter(grown).sort((x, y) => y.social - x.social || x.id - y.id)[0];
  const told: { from: number; to: number }[] = [];
  if (teller) {
    const house = plan.buildings[b];
    const inn = people.filter((p) => p.home !== b && plan.buildings[p.home].kind === 'inn' && p.role === 'trade');
    const near = people
      .filter((p) => p.home !== b && grown(p) && !inn.includes(p))
      .map((p) => ({ p, d: Math.hypot(plan.buildings[p.home].cx - house.cx, plan.buildings[p.home].cz - house.cz) }))
      .sort((x, y) => x.d - y.d || x.p.id - y.p.id)
      // The chattiest of the nearest few households.
      .slice(0, 8).sort((x, y) => y.p.social - x.p.social || x.p.id - y.p.id)
      .slice(0, NEIGHBOURS).map(({ p }) => p);
    for (const p of [...inn, ...near]) told.push({ from: teller.id, to: p.id });
  }
  return { cellar: sketch.decision.id, building: b, knowers, told };
}
