import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Director, fittingPlace, warning, type Signals } from '../src/vgm/director';

const calm: Signals = { fighting: 0, pressure: 0, health: 1, talking: false, underground: false, inTown: false, leads: 0 };

test('director: needs grow with time, play meets them, the most overdue comes first', () => {
  const d = new Director(classic.director);
  for (let t = 0; t < 600; t++) d.observe(1, calm);
  assert.equal(d.overdue, 'purpose');
  d.observe(1, { ...calm, leads: 1 });
  assert.equal(d.needs.purpose, 0, 'a lead is a purpose');
  assert.equal(d.overdue, 'discovery');
  d.met('discovery');
  assert.ok(d.needs.discovery < 1);
  const back = new Director(classic.director, JSON.parse(JSON.stringify(d.snapshot())));
  assert.deepEqual(back.needs, d.needs);
});

test('director: a fight is the peak, relief after it, and the music follows', () => {
  const d = new Director(classic.director);
  d.observe(1, { ...calm, inTown: true });
  assert.equal(d.mood, 'town');
  for (let t = 0; t < 5; t++) d.observe(1, { ...calm, underground: true, fighting: 2, pressure: 1.2 });
  assert.equal(d.phase, 'peak');
  assert.equal(d.mood, 'fight');
  assert.ok(d.tension > 0.8);
  assert.equal(d.fair, false, 'no ambush in a fight');
  d.observe(1, { ...calm, underground: true });
  assert.equal(d.phase, 'relief');
  for (let t = 0; t < 120; t++) d.observe(1, calm);
  assert.equal(d.phase, 'calm');
  assert.ok(d.fair);
});

test('director: messages wait their turn, the important first, never twice', () => {
  const d = new Director(classic.director);
  d.observe(0.1, calm);
  d.queue('a', 1); d.queue('b', 5); d.queue('a', 1);
  assert.equal(d.next(), 'b');
  assert.equal(d.next(), null, 'a gap between messages');
  d.observe(3, calm);
  assert.equal(d.next(), 'a');
  d.observe(3, calm);
  assert.equal(d.next(), null);
});

test('director: dangerous places are signposted; there is a place at the hero\'s level', () => {
  assert.equal(warning(10, 15, 'the cellar'), null);
  assert.ok(warning(24, 15, 'the cellar')!.includes('hard fight'));
  assert.ok(warning(40, 15, 'the cellar')!.includes('turn back'));
  const places = [{ id: 'rats', danger: 10, done: false }, { id: 'dragon', danger: 90, done: false }, { id: 'goblins', danger: 16, done: true }];
  assert.equal(fittingPlace(places, 15), 'rats');
  assert.equal(fittingPlace(places, 60), 'dragon');
  assert.equal(fittingPlace(places, 30), null);
});

test('director: a place\'s danger is fixed by its distance from the start (D29)', async () => {
  const { dangerAt } = await import('../src/vgm/dungeons');
  const home = { x: 0, z: 0 };
  assert.equal(dangerAt({ decision: { x: 300, z: 0 } }, home), 18);
  assert.ok(dangerAt({ decision: { x: 5000, z: 0 } }, home) > 30);
});
