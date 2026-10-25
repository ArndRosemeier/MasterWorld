/**
 * Who the townsfolk are to talk to (plan 9.1): a given name by their people, a family name their household
 * shares, and the house they live in as people call it ("the cottage of the Hollin family"). Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { TownPlan } from '@futuremagic/settlement';
import type { NamesDef, TalkDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { houseName } from '../world/dungeon/cellar';

export interface Folk {
  readonly person: Person;
  readonly given: string;
  readonly family: string;
  /** "Mara Hollin". */
  readonly name: string;
  /** Their home as people call it. */
  readonly house: string;
}

/** Fill a talk template's `{key}`s. */
export const fill = (text: string, values: Readonly<Record<string, string>>): string =>
  text.replace(/\{(\w+)\}/g, (m, k: string) => values[k] ?? m);

/** Names for a town's people: households keep one family name, no two households share one while names last. */
export function nameFolk(people: readonly Person[], plan: TownPlan, names: Readonly<Record<string, NamesDef>>, talk: TalkDef, seed: number): Folk[] {
  const rng = new Rng(deriveSeed(seed, 'folk', 'names'));
  const families = new Map<string, string[]>();
  const familyOf = new Map<string, string>();
  /** The house's own family (the first named there): the house is called after them. */
  const hosts = new Map<number, string>();
  const givenUsed = new Set<string>();
  return people.map((p) => {
    const n = names[p.race] ?? names.human;
    // A guest of another people (a traveller at the inn) keeps a family name of their own.
    const key = `${p.home}/${p.race}`;
    let family = familyOf.get(key);
    if (!family) {
      let left = families.get(p.race);
      if (!left?.length) families.set(p.race, (left = rng.shuffle([...n.family])));
      family = left.pop()!;
      familyOf.set(key, family);
      if (!hosts.has(p.home)) hosts.set(p.home, family);
    }
    const list = p.female ? n.female : n.male;
    // A given name not yet used in the household's family (two Maras in one house would confuse).
    let given = rng.pick(list);
    for (let k = 0; k < list.length && givenUsed.has(`${family}/${given}`); k++) given = list[(list.indexOf(given) + 1) % list.length];
    givenUsed.add(`${family}/${given}`);
    const house = fill(talk.house, { house: houseName(plan.buildings[p.home]), family: hosts.get(p.home)! });
    return { person: p, given, family, name: `${given} ${family}`, house };
  });
}
