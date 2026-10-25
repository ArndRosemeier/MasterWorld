/**
 * How a blow lands (plan 11.2, D13): the same rules for the hero and for every creature. The attacker's
 * skill against the defender's dodging decides a hit; a shield may block part of it; armour takes its
 * share off what gets through; now and then a blow finds a gap. Pure and seeded.
 */
import type { Rng } from '@futuremagic/core';
import type { DamageKind } from '../setting/contract';

/** A blow as it is thrown. */
export interface Blow {
  readonly damage: readonly [number, number];
  readonly kind: DamageKind;
  /** Aim (0..100, the skill behind it). */
  readonly skill: number;
  /** Damage as a share of a normal blow (an ability's power). */
  readonly power?: number;
  /** Extra chance to hit (an ability's aim). */
  readonly aim?: number;
}

/** What stands against it. */
export interface Guard {
  /** Dodging (0..100). */
  readonly defence: number;
  /** Damage taken off every blow. */
  readonly armour: number;
  /** Chance to catch it on a shield (0..1); shields skill makes it better. */
  readonly block?: number;
  /** Staggered, caught from behind or asleep: no dodging and no shield. */
  readonly open?: boolean;
}

export type Outcome = 'miss' | 'block' | 'hit' | 'crit';

export interface Strike {
  readonly outcome: Outcome;
  readonly damage: number;
}

/** Chance that a blow of `skill` lands on a guard of `defence` (before the shield). */
export function hitChance(skill: number, defence: number, aim = 0, open = false): number {
  const base = 0.58 + (skill - (open ? 0 : defence)) / 110 + aim;
  return Math.min(0.96, Math.max(0.08, base));
}

/** Throw a blow at a guard. */
export function strike(b: Blow, g: Guard, rng: Rng): Strike {
  if (!rng.chance(hitChance(b.skill, g.defence, b.aim, g.open))) return { outcome: 'miss', damage: 0 };
  const crit = rng.chance(0.04 + b.skill / 1200);
  const raw = rng.range(b.damage[0], b.damage[1]) * (1 + b.skill / 220) * (b.power ?? 1) * (crit ? 1.6 : 1);
  const blocked = !g.open && !crit && !!g.block && rng.chance(g.block);
  // Armour stops less of a sharp point or a great blow; what gets through is never nothing.
  const armour = g.armour * (b.kind === 'pierce' ? 0.6 : 1) * (crit ? 0.5 : 1);
  const dmg = Math.max(1, Math.round((raw - armour) * (blocked ? 0.3 : 1)));
  return { outcome: blocked ? 'block' : crit ? 'crit' : 'hit', damage: b.power === 0 ? 0 : dmg };
}

/** Threat of a foe (plan 4.1, 17.1: the target frame's ward colour) against the hero's power. */
export type Threat = 'trivial' | 'easy' | 'even' | 'hard' | 'deadly';

export function threatOf(danger: number, power: number): Threat {
  const r = danger / Math.max(1, power);
  return r < 0.4 ? 'trivial' : r < 0.8 ? 'easy' : r < 1.25 ? 'even' : r < 2 ? 'hard' : 'deadly';
}
