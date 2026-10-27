import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SearchKneel } from '../src/app/searchKneel';

test('search kneel: the hero walks up to a chest, faces it, kneels while its lid lifts, and finds once', () => {
  const lid: number[] = [];
  let found = 0;
  const k = new SearchKneel({ x: 0, y: 0, z: 0 }, 0, { x: 2, z: 0 }, (v) => lid.push(v), () => found++);
  let walked = false, knelt = false;
  for (let i = 0; i < 400 && !k.done; i++) {
    k.step(1 / 60);
    walked ||= k.walking && k.vel[0] > 0;
    knelt ||= k.clip === 'crouch';
  }
  assert.ok(k.done && walked && knelt);
  assert.equal(found, 1);
  assert.ok(Math.abs(Math.hypot(2 - k.pos.x, k.pos.z) - 0.75) < 0.05, 'kneels a short step from it');
  // Facing it: a walker's forward is (-sin yaw, -cos yaw).
  assert.ok(-Math.sin(k.yaw) > 0.99);
  assert.equal(lid[0], 0);
  assert.equal(lid[lid.length - 1], 1);
  for (let i = 1; i < lid.length; i++) assert.ok(lid[i] >= lid[i - 1], 'the lid only lifts');
  assert.equal(k.clip, undefined, 'up again');
});

test('search kneel: by a body already in reach it kneels where it stands, no lid', () => {
  let found = 0;
  const k = new SearchKneel({ x: 0, y: 0, z: 0 }, 0, { x: 0, z: -0.5 }, null, () => found++);
  k.step(1 / 60);
  assert.equal(k.walking, false);
  for (let i = 0; i < 200 && !k.done; i++) k.step(1 / 60);
  assert.ok(k.done && found === 1 && Math.hypot(k.pos.x, k.pos.z) < 1e-9);
});
