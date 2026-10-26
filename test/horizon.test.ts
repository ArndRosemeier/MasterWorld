import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORIZON_DIRS, horizonDir, horizonMap } from '../src/world/horizon';

const angle = (b: number): number => (b / 255) * 90;

test('a wall to the east raises the skyline toward the east only', () => {
  // Flat land, a 200 m wall from x = 1000 on.
  const height = (x: number): number => (x >= 1000 ? 200 : 0);
  const res = 64, spec = { x0: 0, z0: 0, size: 2048, res };
  const m = horizonMap(height, spec);
  const plane = res * res * 4;
  const cell = (i: number, j: number, d: number): number => m[(d < 4 ? 0 : plane) + (j * res + i) * 4 + (d & 3)];
  // A point 300 m west of the wall: it rises at about atan(197 / 300) toward +x (direction 0).
  const i = Math.floor(700 / 32), j = 32;
  assert.ok(Math.abs(angle(cell(i, j, 0)) - 33) < 6, `east ${angle(cell(i, j, 0))}`);
  assert.equal(cell(i, j, 4), 0, 'west is open');
  assert.equal(cell(i, j, 2), 0, 'north is open');
  assert.equal(HORIZON_DIRS, 8);
  assert.deepEqual(horizonDir(0), [1, 0]);
});
