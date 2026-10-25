import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { townsfolk } from '../src/sim/people';
import { coveringLooks, drawn, lookOf } from '../src/render/folk/looks';

test('looks: a few townsfolk wear between them everything the town wears (warmed before anyone is drawn)', () => {
  const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: () => 10 });
  const folk = townsfolk(plan, 5);
  const parts = (l: ReturnType<typeof lookOf>) => [...(l.outfit ?? []), `hair:${l.hair}`, `beard:${l.beard}`, `race:${l.race}`];
  const all = new Set(folk.filter(drawn).map(lookOf).flatMap(parts));
  const few = coveringLooks(folk);
  const covered = new Set(few.flatMap(parts));
  for (const x of all) assert.ok(covered.has(x), `${x} not warmed`);
  assert.ok(few.length <= 24, `${few.length} looks`);
});
