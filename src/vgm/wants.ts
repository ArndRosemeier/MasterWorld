/**
 * What people want (D62, Q5): a task comes from what someone in the world simulation lacks, not from a table. The
 * household of a new place is looked at as the simulation has them: someone living alone in their later years wants
 * back what is left of their life together (a fetch), a trader with a rival of the same trade in town suspects them
 * when things go missing (a thief, the rival). The want goes onto the ask in the log, so the task can be traced back
 * to the person and why. Pure.
 */
import type { Person } from '../sim/people';
import type { DungeonDecision, PromiseWant } from '../world/decisions';

/** From this age someone living alone is taken to have outlived their partner (years). */
const LONE_AGE = 45;

/** The verb each want asks for. */
export const WANT_VERB: Readonly<Record<PromiseWant['kind'], string>> = { lone: 'fetch', rival: 'thief' };

/** What the household of place `d` wants, if anything (a rival first, else someone alone). */
export function wantOf(people: readonly Pick<Person, 'id' | 'home' | 'role' | 'trade' | 'age'>[], d: DungeonDecision): PromiseWant | null {
  const grown = people.filter((p) => p.home === d.building && p.role !== 'child' && p.role !== 'traveller');
  const traders = people.filter((o) => o.role === 'trade' && o.trade);
  for (const p of traders) {
    if (p.home !== d.building) continue;
    const rival = traders.filter((o) => o.trade === p.trade && o.home !== d.building)[0];
    if (rival) return { person: p.id, kind: 'rival', rival: rival.id };
  }
  const one = grown.length === 1 ? grown[0]! : null;
  return one && one.age >= LONE_AGE ? { person: one.id, kind: 'lone' } : null;
}
