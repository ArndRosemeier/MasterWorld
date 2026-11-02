/**
 * Who a townsperson is (D68, phase N1; docs/design/vgm.md reads these for a person's task, N3): a temperament with
 * its own voice, one or two pursuits, a time of life, all drawn from their seed, people, trade and age against the
 * setting's `persona` data (src/setting/classic/personas.ts), never from code. The same person always comes out the
 * same. Pure: no DOM, no three.js.
 */
import { Rng, deriveSeed, hash2f } from '@futuremagic/core';
import type { AgeGroup, PersonaDef, PursuitDef, Temperament, TemperamentDef } from '../setting/contract';
import { TEMPERAMENTS } from '../setting/contract';
import type { Person } from '../sim/people';

/** The parts of a person their persona is drawn from. */
export type PersonaSource = Pick<Person, 'seed' | 'role' | 'trade' | 'race' | 'age' | 'social' | 'diligent' | 'pious' | 'early'>;

export interface Persona {
  readonly temperament: Temperament;
  /** Pursuit ids (Conversations' profile), the first the one they speak of most. */
  readonly pursuits: readonly string[];
  readonly ageGroup: AgeGroup;
}

/** A person is a child, young, grown or old by their years against what their people live to. */
export function ageGroupOf(p: Pick<Person, 'age' | 'race' | 'role'>, def: PersonaDef): AgeGroup {
  if (p.role === 'child') return 'young';
  const long = def.long[p.race] ?? 1;
  return p.age < def.young * long ? 'young' : p.age >= def.elder * long ? 'elder' : 'adult';
}

/** The temperament of a person: a seeded roll weighted by their traits and years against each temperament's lean. */
export function temperamentOf(p: PersonaSource, def: PersonaDef, group: AgeGroup = ageGroupOf(p, def)): Temperament {
  const odds = TEMPERAMENTS.map((t) => {
    const l = def.temperaments[t].lean;
    return Math.max(0.05, l.base + l.social * p.social + l.diligent * p.diligent + l.pious * p.pious + l.early * p.early + (group === 'young' ? l.young : group === 'elder' ? l.old : 0));
  });
  return new Rng(deriveSeed(p.seed, 'persona', 'temperament')).weighted([...TEMPERAMENTS], (_, i) => odds[i]!);
}

/** Whether pursuit `d` is one a person might take up. */
function fits(d: PursuitDef, p: PersonaSource, group: AgeGroup): boolean {
  return (!d.trades || d.trades.includes(p.trade)) && (!d.roles || d.roles.includes(p.role)) && (!d.ages || d.ages.includes(group)) && (!d.races || d.races.includes(p.race));
}

/** The share of grown people with a second pursuit (children have one). */
const SECOND = 0.4;

/** One or two pursuits that fit a person, a seeded pick weighted by how common each is. */
export function pursuitsOf(p: PersonaSource, def: PersonaDef, group: AgeGroup = ageGroupOf(p, def)): string[] {
  const pool = def.pursuits.filter((d) => fits(d, p, group));
  const rng = new Rng(deriveSeed(p.seed, 'persona', 'pursuits'));
  const out: string[] = [];
  const want = p.role !== 'child' && rng.chance(SECOND) ? 2 : 1;
  while (out.length < want && pool.length > out.length) {
    const rest = pool.filter((d) => !out.includes(d.id));
    out.push(rng.weighted(rest, (d) => d.weight).id);
  }
  return out;
}

/** Who a person is. */
export function personaOf(p: PersonaSource, def: PersonaDef): Persona {
  const ageGroup = ageGroupOf(p, def);
  return { temperament: temperamentOf(p, def, ageGroup), pursuits: pursuitsOf(p, def, ageGroup), ageGroup };
}

/** A seeded pick from a list, for one of a person's own habits (`salt` names it: the same person always picks the same). */
export function pickFor<T>(p: Pick<Person, 'seed'>, salt: number, list: readonly T[]): T {
  return list[Math.floor(hash2f(p.seed, 0x70e5, salt) * list.length)]!;
}

/** The pursuit defs of a persona. */
export function pursuitDefs(def: PersonaDef, persona: Persona): PursuitDef[] {
  return persona.pursuits.flatMap((id) => def.pursuits.find((d) => d.id === id) ?? []);
}

/** The temperament's own words. */
export const voiceOf = (def: PersonaDef, persona: Persona): TemperamentDef => def.temperaments[persona.temperament];
