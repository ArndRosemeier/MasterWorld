import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown, pointInPoly } from '@futuremagic/settlement';
import { Poultry } from '../src/sim/poultry';
import { classic } from '../src/setting/classic';

const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: (x, z) => 30 + 2 * Math.sin(x / 70) + 1.5 * Math.cos(z / 50) });
const def = classic.world.poultry!;
const yardOf = (x: number, z: number): boolean => plan.farms.some((f) => pointInPoly(f.yard, x, z)) || plan.yards.some((y) => pointInPoly(y.outer, x, z));

test('hens: a flock with a cock in every farmyard, more in back yards; they keep to their yards', () => {
  const p = new Poultry(plan, 5, def);
  assert.ok(plan.farms.length > 0);
  const flocks = new Set(p.hens.map((h) => h.flock));
  assert.ok(flocks.size > plan.farms.length, `${flocks.size} flocks`);
  assert.ok(p.hens.filter((h) => h.cock).length >= plan.farms.length);
  let walked = 0, clucks = 0;
  for (let i = 0; i < 600; i++) {
    p.step(0.1, 10, def, null);
    clucks += p.heard.filter((e) => e.kind === 'cluck').length;
    for (const h of p.hens) if (h.act === 'walk') walked++;
  }
  assert.ok(walked > 0 && clucks > 0);
  for (const h of p.hens) assert.ok(yardOf(h.x, h.z), `hen ${h.id} out of its yard`);
});

test('hens: deterministic; they scatter from someone close, sit at night, and the cock crows of a morning', () => {
  const a = new Poultry(plan, 5, def), b = new Poultry(plan, 5, def);
  for (let i = 0; i < 100; i++) { a.step(0.1, 10, def, null); b.step(0.1, 10, def, null); }
  assert.deepEqual(a.hens.map((h) => [h.x, h.z, h.act]), b.hens.map((h) => [h.x, h.z, h.act]));
  const hen = a.hens.find((h) => !h.cock)!;
  a.step(0.1, 10, def, { x: hen.x + 0.5, z: hen.z });
  assert.ok(hen.act === 'run' && a.heard.some((e) => e.kind === 'squawk'));
  for (let i = 0; i < 900; i++) a.step(0.1, 23, def, null);
  assert.ok(a.hens.every((h) => h.act === 'roost'));
  let crows = 0;
  for (let i = 0; i < 3000; i++) { a.step(0.1, 6.5, def, null); crows += a.heard.filter((e) => e.kind === 'crow').length; }
  assert.ok(crows > 0);
});

test('hens: a flock first met at night is already sitting', () => {
  const p = new Poultry(plan, 5, def);
  p.step(0.1, 23, def, null);
  assert.ok(p.hens.every((h) => h.act === 'roost'));
});
