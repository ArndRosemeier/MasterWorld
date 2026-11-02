import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Creature } from '../src/sim/creatures';
import { foeGroup } from '../src/game/foeGroup';
import { healthCss } from '../src/sim/aura';

/** A creature with only what the group panel reads. */
const foe = (id: number, x: number, health: number, state: Creature['state'] = 'fight'): Creature => ({ id, x, y: 0, z: 0, health, state, def: { health: 20, name: 'goblin' } }) as unknown as Creature;
const hero = { x: 0, y: 0, z: 0 };

test('foe group: rows by id with health share and distance, the target marked', () => {
  const a = foe(1, 9, 20), b = foe(2, 3, 5), c = foe(3, 6, 10);
  const g = foeGroup([c, a, b], b, hero);
  assert.deepEqual(g.rows.map((r) => r.creature.id), [1, 2, 3], 'id order, not distance');
  assert.deepEqual(g.rows.map((r) => r.frac), [1, 0.25, 0.5]);
  assert.deepEqual(g.rows.map((r) => r.dist), [9, 3, 6]);
  assert.deepEqual(g.rows.map((r) => r.target), [false, true, false]);
  assert.equal(g.more, 0);
});

test('foe group: a target that does not hunt yet is listed; the dead are not', () => {
  const a = foe(1, 4, 20), idle = foe(2, 5, 20, 'idle'), dead = foe(3, 2, 0, 'dead');
  assert.deepEqual(foeGroup([a, dead], idle, hero).rows.map((r) => r.creature.id), [1, 2]);
  assert.deepEqual(foeGroup([a, dead], dead, hero).rows.map((r) => r.creature.id), [1]);
  assert.equal(foeGroup([], null, hero).rows.length, 0);
});

test('foe group: past the rows the target and the nearest stay, the rest are counted', () => {
  const many = Array.from({ length: 12 }, (_, i) => foe(i + 1, 30 - i, 20));
  const far = many[0]!;
  const g = foeGroup(many, far, hero, 5);
  assert.equal(g.rows.length, 5);
  assert.equal(g.more, 7);
  assert.ok(g.rows.some((r) => r.target), 'the target stays although it is the farthest');
  assert.ok(g.rows.some((r) => r.creature.id === 12), 'the nearest stays');
  assert.deepEqual(g.rows.map((r) => r.creature.id), [...g.rows.map((r) => r.creature.id)].sort((x, y) => x - y));
});

test('foe group: the bar colour is green when well and red when nearly spent', () => {
  const rgb = (s: string) => s.match(/\d+/g)!.map(Number) as [number, number, number];
  const well = rgb(healthCss(1)), low = rgb(healthCss(0.1));
  assert.ok(well[1] > well[0] && well[1] > well[2]);
  assert.ok(low[0] > low[1] && low[0] > low[2]);
});
