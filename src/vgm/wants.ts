/**
 * What people want (D62, Q5): a task comes from what someone in the world simulation lacks, not from a table. The
 * household of a new place is looked at as the simulation has them, and each want calls for one kind of task:
 * a trader with a rival of the same trade in town suspects them when things go missing (`rival`: a thief, the
 * rival); the eldest, old now, wants back what is left of the ones before them (`elder`: a fetch); a grown-up
 * with a child in the house fears for them (`parent`: someone lost, the child); a devout one wants the
 * restless laid to rest (`pious`: a seal); a sociable one would rather it were talked out than fought (`peaceable`:
 * a parley). The want goes onto the ask in the log, so the task can be traced back to the person and why. Pure.
 */
import { OLD_AGE, type Person } from '../sim/people';
import type { DungeonDecision, PromiseWant } from '../world/decisions';

/** The verb each want asks for. */
export const WANT_VERB: Readonly<Record<PromiseWant['kind'], string>> = { rival: 'thief', elder: 'fetch', parent: 'lost', pious: 'seal', peaceable: 'parley' };

/** How devout and how sociable a grown-up must be to want a seal or a parley (0..1). */
const DEVOUT = 0.8, SOCIABLE = 0.8;

/** What the people of the household of place `d` want (the town's `people` as the simulation has them), in order. */
export function wantsOf(people: readonly Pick<Person, 'id' | 'home' | 'role' | 'trade' | 'age' | 'social' | 'pious'>[], d: DungeonDecision): PromiseWant[] {
  const house = people.filter((p) => p.home === d.building), grown = house.filter((p) => p.role !== 'child' && p.role !== 'traveller');
  const out: PromiseWant[] = [];
  const traders = people.filter((o) => o.role === 'trade' && o.trade);
  for (const p of traders) {
    if (p.home !== d.building) continue;
    const rival = traders.filter((o) => o.trade === p.trade && o.home !== d.building)[0];
    if (rival) out.push({ person: p.id, kind: 'rival', rival: rival.id });
  }
  const eldest = grown.reduce<(typeof grown)[number] | null>((a, p) => (!a || p.age > a.age ? p : a), null);
  if (eldest && eldest.age >= OLD_AGE) out.push({ person: eldest.id, kind: 'elder' });
  if (grown.length && house.some((p) => p.role === 'child')) out.push({ person: grown[0]!.id, kind: 'parent' });
  const devout = grown.find((p) => p.pious >= DEVOUT), sociable = grown.find((p) => p.social >= SOCIABLE);
  if (devout) out.push({ person: devout.id, kind: 'pious' });
  if (sociable) out.push({ person: sociable.id, kind: 'peaceable' });
  return out;
}
