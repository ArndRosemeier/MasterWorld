import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Fallen, LIE_FOR } from '../src/app/fallen';

/** The log as plain strings (an assertion on it narrows its type). */
const seen = (log: string[]): string[] => log;

/** A hero and a host that record what the fall did. */
function rig(wake: () => string | null) {
  const hero = { alive: true }, log: string[] = [];
  const fallen = new Fallen(
    { wake: () => { log.push('wake'); const w = wake(); if (w !== null) hero.alive = true; return w; }, still: (on) => log.push(on ? 'still' : 'free') },
    { fallen: (on) => log.push(on ? 'dark' : 'light') },
    { say: (t) => log.push(`say:${t}`) },
    (c) => log.push(`cue:${c.kind}`),
  );
  return { hero, log, fallen };
}

test('fallen: a hero at no health is stilled, then wakes after the lie, whichever fight struck the blow', () => {
  const { hero, log, fallen } = rig(() => 'You wake.');
  fallen.seeTo(0.1, hero);
  assert.deepEqual(log, [], 'on their feet: nothing');
  hero.alive = false;
  fallen.seeTo(0.1, hero);
  assert.deepEqual(log, ['dark', 'still']);
  fallen.seeTo(LIE_FOR - 0.2, hero);
  assert.ok(!seen(log).includes('wake'), 'not before the lie is over');
  fallen.seeTo(0.2, hero);
  assert.deepEqual(log, ['dark', 'still', 'wake', 'light', 'free', 'cue:woke', 'say:You wake.']);
  assert.ok(!fallen.lying);
});

test('fallen: stilled once however long they lie, and a second fall is met as the first was', () => {
  const { hero, log, fallen } = rig(() => 'You wake.');
  hero.alive = false;
  for (let i = 0; i < 10; i++) fallen.seeTo(0.1, hero);
  assert.equal(log.filter((l) => l === 'still').length, 1);
  fallen.seeTo(LIE_FOR, hero);
  hero.alive = false; // struck down again while being carried off
  fallen.seeTo(0.1, hero);
  fallen.seeTo(LIE_FOR, hero);
  assert.equal(log.filter((l) => l === 'wake').length, 2);
  assert.equal(log.filter((l) => l === 'still').length, 2);
  assert.equal(log.filter((l) => l === 'free').length, 2, 'every stilling let go');
});

test('fallen: a roguelike hero stays down for good', () => {
  const { hero, log, fallen } = rig(() => null);
  hero.alive = false;
  fallen.seeTo(LIE_FOR + 1, hero);
  fallen.seeTo(LIE_FOR + 1, hero);
  assert.equal(log.filter((l) => l === 'wake').length, 1);
  assert.ok(!log.includes('free') && fallen.lying);
});

test('fallen: up by other means, the stillness lifts', () => {
  const { hero, log, fallen } = rig(() => 'x');
  hero.alive = false;
  fallen.seeTo(1, hero);
  hero.alive = true;
  fallen.seeTo(0.1, hero);
  assert.deepEqual(log, ['dark', 'still', 'light', 'free']);
});
