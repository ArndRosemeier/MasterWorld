/**
 * Simple aggro and con (D69, phase Z1): how near a hero may come to a foe before it attacks, and the colour its name is shown in. The
 * radius is the kind's at the hero's level, wider for a foe above the hero and narrower for one below, and none at all for a foe so far
 * below that it starts nothing (grey). A foe's level is the hero level its danger is an even fight for (`levelOfDanger`, as the target
 * plate shows it). Pure.
 */
import type { AggroDef, CreatureDef, GrowthDef, Tier } from '../setting/contract';
import { levelOfDanger } from '../game/growth';

/** What a den needs to weigh a foe against the hero: the setting's aggro and its levels. */
export interface AggroRules {
  readonly aggro: AggroDef;
  readonly growth: GrowthDef;
}

/**
 * A den played without a setting's rules (the town's own fights, bare checks): every foe as at the hero's level. The classic setting
 * gives the same numbers (setting/classic/aggro.ts).
 */
export const PLAIN_AGGRO: AggroDef = { even: 10, up: 1.5, down: 1, min: 5, max: 20, grey: 5, link: 12, leash: 40, chase: 25, con: { green: 3, blue: 1, red: 3 } };

/** The level of a foe of kind `def` (the level whose even fight it is). */
export const foeLevel = (g: GrowthDef, def: Pick<CreatureDef, 'danger'>): number => levelOfDanger(g, def.danger);

/** The aggro radius (m) of a foe of `def` at level `foe` against a hero of level `hero`; 0 when it starts nothing (grey). */
export function aggroRadius(a: AggroDef, def: Pick<CreatureDef, 'aggro'>, foe: number, hero: number): number {
  const diff = foe - hero;
  if (diff <= -a.grey) return 0;
  const base = def.aggro ?? a.even;
  return Math.min(a.max, Math.max(a.min, diff >= 0 ? base + a.up * diff : base - a.down * -diff));
}

/** How a foe's level stands against the hero's, as the old games coloured its name. */
export const CONS = ['grey', 'green', 'blue', 'white', 'yellow', 'red'] as const;
export type Con = (typeof CONS)[number];

/** The con of a foe at level `foe` for a hero at level `hero`. */
export function conOf(a: AggroDef, foe: number, hero: number): Con {
  const diff = foe - hero;
  return diff <= -a.grey ? 'grey' : diff <= -a.con.green ? 'green' : diff <= -a.con.blue ? 'blue' : diff === 0 ? 'white' : diff < a.con.red ? 'yellow' : 'red';
}

/** Does a faction that sees the hero as `tier` attack them (D65: everyone short of a friend)? */
export const hostileTier = (tier: Tier): boolean => tier !== 'friend' && tier !== 'honoured';
