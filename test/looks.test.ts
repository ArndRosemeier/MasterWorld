import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { townsfolk } from '../src/sim/people';
import { coveringLooks, lookOf, youthOf } from '../src/render/folk/looks';

test('looks: a few townsfolk wear between them everything the town wears (warmed before anyone is drawn)', () => {
  const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: () => 10 });
  const folk = townsfolk(plan, 5);
  const parts = (l: ReturnType<typeof lookOf>) => [...(l.outfit ?? []), `hair:${l.hair}`, `beard:${l.beard}`, `race:${l.race}`];
  const all = new Set(folk.map(lookOf).flatMap(parts));
  const few = coveringLooks(folk);
  const covered = new Set(few.flatMap(parts));
  for (const x of all) assert.ok(covered.has(x), `${x} not warmed`);
  assert.ok(few.length <= 24, `${few.length} looks`);
});

test('looks: children are Actors characters with child proportions, never anatomy or beards', () => {
  const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: () => 10 });
  const kids = townsfolk(plan, 5).filter((p) => p.role === 'child');
  assert.ok(kids.length > 0);
  for (const p of kids) {
    const l = lookOf(p), y = youthOf(p);
    assert.ok(y > 0 && y <= 1, `youth ${y} at ${p.age}`);
    assert.equal(l.youth, y);
    assert.equal(l.beard, 'none');
    assert.ok(l.outfit?.includes('briefs'), 'always clothed');
  }
  const young = kids.reduce((a, b) => (a.age < b.age ? a : b)), old = kids.reduce((a, b) => (a.age > b.age ? a : b));
  assert.ok(youthOf(young) >= youthOf(old));
  assert.equal(youthOf({ ...young, role: 'hand', age: 30 }), 0);
});

test('looks: everyone has the living face and a seeded face; children have no body sliders; the same person looks the same', () => {
  const plan = planTown({ seed: 5, x: 0, z: 0, radius: 72, height: () => 10 });
  const folk = townsfolk(plan, 5);
  const BODY = ['fat', 'fitness', 'shoulders', 'waist', 'belly', 'hips', 'legs', 'arms', 'neck'];
  for (const p of folk) {
    const l = lookOf(p);
    assert.equal(l.faceRig && l.faceAnimation && l.wrinkles, true);
    assert.deepEqual(l.shape, lookOf(p).shape);
    assert.ok(l.shape && 'jaw' in l.shape, 'a face of their own');
    for (const v of Object.values(l.shape ?? {})) assert.ok(Math.abs(v) <= 1.3, `slider ${v}`);
    if (p.role === 'child') for (const k of BODY) assert.ok(!(k in (l.shape ?? {})), `child with ${k}`);
  }
  assert.ok(new Set(folk.map((p) => lookOf(p).shape?.jaw)).size > folk.length / 2, 'faces differ');
});
