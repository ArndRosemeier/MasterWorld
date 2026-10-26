import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barrowMesh, inBarrowShape, MOUND, PASSAGE, WAY_DOWN } from '../src/world/dungeon/barrowMesh';

test('barrow: the mound is solid, its passage open from the forecourt to the way down', () => {
  const m = barrowMesh();
  assert.ok(m.index.length > 0 && m.position.length % 3 === 0);
  // Walking in from the forecourt along the passage's middle: never blocked, down to the way down.
  for (let z = 3; z >= WAY_DOWN.z; z -= 0.1) assert.ok(!inBarrowShape(0, z, 0.3), `open at z ${z.toFixed(1)}`);
  // The mound itself, the slabs either side, and beside the passage: in the way.
  assert.ok(inBarrowShape(0, -MOUND.back, 0.3));
  assert.ok(inBarrowShape(PASSAGE.half + 0.25, -1, 0.3));
  assert.ok(inBarrowShape(3, -4, 0.3));
  // Round the back and well clear of it: free.
  assert.ok(!inBarrowShape(0, -MOUND.back - MOUND.r - 1, 0.3));
  assert.ok(!inBarrowShape(MOUND.r + 1, 0, 0.3));
});
