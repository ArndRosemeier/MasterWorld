import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { away, townsfolk } from '../src/sim/people';

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

test('people: an elf passes through, lodging at the inn, about a day in every three', () => {
  const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const elves = townsfolk(plan, 3).filter((p) => p.race === 'elf');
  assert.equal(elves.length, 1);
  const [elf] = elves;
  assert.equal(elf.role, 'traveller');
  assert.equal(plan.buildings[elf.home].kind, 'inn');
  let here = 0, visits = 0, was = true;
  for (let h = 0; h < 72 * 10; h += 0.25) {
    const gone = away(elf, h);
    if (!gone) here++;
    if (was && !gone) visits++;
    was = gone;
  }
  assert.equal(visits, 10, 'one visit in every three days');
  assert.ok(here * 0.25 > 10 * 18 && here * 0.25 < 10 * 30, `${here * 0.25} hours in town`);
});
