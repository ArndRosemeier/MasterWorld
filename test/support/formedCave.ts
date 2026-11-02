/**
 * A formed cave for tests (world/cave/): formed, carved, dressed and read on a block a little smaller than the smallest cave, to
 * keep within the time of `npm test`. Made once for each seed and rock, however many test files in a process ask for it.
 */
import { classic } from '../../src/setting/classic/index';
import { dressFormed, formCave, readFormed } from '../../src/world/cave/form';

export const caves = classic.caves!;
export const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };

/** A cave made fresh (a test of its being seeded makes two). */
function makeCave(seed: number, rock: string) {
  const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), d = dressFormed(c, caves);
  return { c, ...readFormed(c, caves, d) };
}

const made = new Map<string, ReturnType<typeof makeCave>>();
/** The cave of a seed and rock, made the first time it is asked for. */
export function formedCave(seed: number, rock: string): ReturnType<typeof makeCave> {
  const k = `${rock} ${seed}`;
  if (!made.has(k)) made.set(k, makeCave(seed, rock));
  return made.get(k)!;
}
