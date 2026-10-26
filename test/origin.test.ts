import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentre } from '../src/world/chunkMesh';

test('origin: world-space volume vertices move to their own middle (small numbers to draw)', () => {
  const p = new Float32Array([-32149.5, 40, 31899.25, -32101.5, 61, 31951.25]);
  assert.deepEqual(recentre(p), [-32125, 31925]);
  assert.deepEqual([...p], [-24.5, 40, -25.75, 23.5, 61, 26.25]);
  assert.deepEqual(recentre(new Float32Array(0)), [0, 0]);
});
