import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown, pointInPoly } from '@futuremagic/settlement';
import { townsfolk } from '../src/sim/people';
import { townSpots, FIELD_WORK } from '../src/sim/spots';
import { Herds } from '../src/sim/livestock';

const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: (x, z) => 30 + 2 * Math.sin(x / 70) + 1.5 * Math.cos(z / 50) });

test('farms: farm households work their own farm, and its fields offer work by their crop', () => {
  const people = townsfolk(plan, 5);
  const spots = townSpots(plan);
  for (const fm of plan.farms) {
    const folk = people.filter((p) => p.home === fm.house && p.role !== 'child' && p.role !== 'traveller');
    assert.ok(folk.length >= 2, `farm ${fm.id}: ${folk.length} adults`);
    for (const p of folk) assert.ok(p.trade === 'farmer' && p.work === fm.house, `farm ${fm.id}: ${p.role} ${p.trade} works at ${p.work}`);
    const work = spots.filter((s) => s.building === fm.house && s.use === 'work');
    assert.ok(work.some((s) => s.activity === 'tendStock') && work.some((s) => s.activity === 'muckOut'), 'paddock and stable work');
    const field = work.filter((s) => ['plough', 'sow', 'hoe', 'reap'].includes(s.activity));
    assert.ok(field.length >= 2, `farm ${fm.id}: ${field.length} places in the fields`);
  }
  for (const f of plan.fixtures.filter((f) => f.kind === 'field')) {
    const field = plan.fields.find((x) => x.paddock < 0 && pointInPoly(x.poly, f.x, f.z))!;
    assert.ok(spots.some((s) => Math.hypot(s.x - f.x, s.z - f.z) < 1.5 && s.activity === FIELD_WORK[field.crop]));
  }
});

test('farms: the animals graze and wander, always inside their paddock', () => {
  const herds = new Herds(plan, 5);
  assert.equal(herds.animals.length, plan.paddocks.reduce((n, p) => n + p.animals, 0));
  const start = herds.animals.map((a) => [a.x, a.z]);
  const acts = new Set<string>();
  for (let i = 0; i < 3000; i++) {
    herds.step(0.2);
    for (const a of herds.animals) { acts.add(a.act); assert.ok(pointInPoly(plan.paddocks[a.paddock].poly, a.x, a.z), 'inside the fence'); }
  }
  assert.ok(acts.has('walk') && acts.has('eat'), [...acts].join());
  assert.ok(herds.animals.some((a, i) => Math.hypot(a.x - start[i][0], a.z - start[i][1]) > 2), 'they move about');
  const again = new Herds(plan, 5);
  for (let i = 0; i < 3000; i++) again.step(0.2);
  assert.deepEqual(again.animals.map((a) => [a.x, a.z]), herds.animals.map((a) => [a.x, a.z]), 'deterministic');
});
