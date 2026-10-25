import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { townsfolk } from '../src/sim/people';

test('people: a small, mostly human town with dwarves at the smithy and halflings at the inn', () => {
  const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const folk = townsfolk(plan, 3);
  const count = (race: string) => folk.filter((p) => p.race === race).length;
  assert.ok(folk.length >= 70 && folk.length <= 150, `${folk.length} people`);
  assert.ok(count('human') > folk.length * 0.7, `${count('human')} humans`);
  const smith = folk.find((p) => plan.buildings[p.home].kind === 'smithy');
  const inn = folk.find((p) => plan.buildings[p.home].kind === 'inn');
  assert.equal(smith?.race, 'dwarf');
  assert.equal(inn?.race, 'halfling');
  assert.ok(count('dwarf') > (smith ? folk.filter((p) => p.home === smith.home).length : 0), 'a second dwarf family');
  // The same seed, the same people.
  assert.deepEqual(townsfolk(plan, 3).map((p) => [p.race, p.female, p.age]), folk.map((p) => [p.race, p.female, p.age]));
});
