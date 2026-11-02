/**
 * Who the townsfolk are to talk to (plan 9.1): a given name by their people, a family name their household
 * shares, and the house they live in as people call it ("the cottage of the Hollin family"). Pure.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { TownPlan } from '@futuremagic/settlement';
import type { NamesDef, TalkDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { houseName } from '../world/dungeon/cellar';
import { personaOf, pickFor, pursuitDefs, voiceOf, type Persona } from './persona';

export interface Folk {
  readonly person: Person;
  readonly given: string;
  readonly family: string;
  /** "Mara Hollin". */
  readonly name: string;
  /** Their home as people call it. */
  readonly house: string;
  /** Who they are (D68): temperament, pursuits, years. */
  readonly persona: Persona;
}

/** The first letter upper case. */
export const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

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
    return { person: p, given, family, name: `${given} ${family}`, house, persona: personaOf(p, talk.persona) };
  });
}

/**
 * What a person says when asked who they are: their calling (the setting's identity line for their role and trade),
 * how they give their name, then what they do with their free hours and a word on their years. A calling of its own
 * (the ruler, a traveller by sea: a key with a colon) is said as it is. Different people say different things.
 */
export function selfOf(p: Pick<Person, 'seed' | 'role' | 'trade' | 'age' | 'bySea'>, persona: Persona, name: string, house: string, talk: TalkDef): string {
  const def = talk.persona, id = talk.identity;
  const key = p.bySea ? 'traveller:sea' : id[`${p.role}:${p.trade}`] ? `${p.role}:${p.trade}` : id[p.role] ? p.role : 'homemaker';
  const calling = id[key]!;
  const values = { name, house, trade: p.trade, age: String(p.age), intro: fill(pickFor(p, 1, voiceOf(def, persona).intro), { name }) };
  const base = fill(calling, values);
  // A calling of its own says nothing of free hours.
  if (key.includes(':')) return base;
  const hobby = pursuitDefs(def, persona)[0];
  const parts = [base];
  if (hobby) parts.push(pickFor(p, 2, hobby.self));
  parts.push(fill(pickFor(p, 3, def.ages[persona.ageGroup]), values));
  return parts.join(' ');
}
