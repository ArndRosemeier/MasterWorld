/**
 * A hero's past in town (plan 11.4): who already knows them. Pure.
 */
import type { BackgroundDef } from '../setting/contract';
import type { Person } from '../sim/people';

/** Someone in town who knows the hero, and how they greet them. */
export interface Acquaintance {
  readonly person: Person;
  /** The greeting with the names filled in by the caller ({hero}, {name}). */
  readonly line: string;
}

/**
 * The townsfolk a hero with this past knows: for each trade the background names, the one who runs it
 * (or else one who lends a hand there), up to two people, in the background's order.
 */
export function acquaintances(bg: BackgroundDef, people: readonly Person[]): Acquaintance[] {
  const out: Acquaintance[] = [];
  for (const k of bg.known) {
    if (out.length >= 2) break;
    const at = people.filter((p) => p.trade === k.trade && (p.role === 'trade' || p.role === 'keeper' || p.role === 'hand'));
    const who = at.find((p) => p.role !== 'hand') ?? at[0];
    if (who && !out.some((a) => a.person === who)) out.push({ person: who, line: k.line });
  }
  return out;
}
