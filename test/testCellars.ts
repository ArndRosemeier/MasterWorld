import { classic } from '../src/setting/classic/index';
import { outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import type { DungeonTemplate } from '../src/world/decisions';

/**
 * The test cellars `outlineCellar(testDecision(i, 1, template), testHouse(i), classic.dungeons[template])`, each built
 * once per process, as the test files share it (tools/test/run.mjs): ten files ask for the same two dozen. They are
 * frozen, so a file that changes one fails at once instead of changing what another file sees.
 */
const made = new Map<string, Cellar>();

function freeze<T>(v: T, seen = new Set<unknown>()): T {
  if (v === null || typeof v !== 'object' || seen.has(v)) return v;
  seen.add(v);
  for (const k of Reflect.ownKeys(v)) freeze((v as Record<PropertyKey, unknown>)[k], seen);
  return Object.freeze(v);
}

/** The test cellar `i` of a template (a cellar under a house unless the template stands elsewhere: see `testPlace` in variety.ts for the sweep; the tests here use a house). */
export function testCellar(i: number, template: DungeonTemplate = 'cellar'): Cellar {
  const key = `${template}:${i}`;
  let c = made.get(key);
  if (!c) made.set(key, (c = freeze(outlineCellar(testDecision(i, 1, template), testHouse(i), classic.dungeons[template]!))));
  return c;
}

/** The first `n` test cellars of a template. */
export function testCellars(n: number, template: DungeonTemplate = 'cellar'): Cellar[] {
  return Array.from({ length: n }, (_, i) => testCellar(i, template));
}
