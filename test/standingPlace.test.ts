import { test } from 'node:test';
import assert from 'node:assert/strict';
import { standingPlace } from '../src/game/standingPlace';

test('stand before: straight in front when it is clear, else round to the side away from a wall', () => {
  const open = standingPlace(0, 0, 0, () => false);
  assert.ok(Math.abs(open.x - 1.6) < 1e-9 && Math.abs(open.z) < 1e-9);
  // A wall filling z < 0.5 (the person stands by a building's corner, facing +x along it).
  const wall = (x: number, z: number, r: number) => z - r < 0.5 && x > -10;
  const p = standingPlace(0, 2, 0, wall);
  assert.ok(p.z - 0.9 >= 0.5, `clear of the wall: ${p.z.toFixed(2)}`);
  assert.ok(Math.hypot(p.x, p.z - 2) - 1.6 < 1e-9, 'a step and a half off');
  // Walls everywhere: straight in front as before.
  assert.deepEqual(standingPlace(0, 0, 0, () => true), { x: 1.6, z: 0 });
});
