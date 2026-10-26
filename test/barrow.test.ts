import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, barrowMesh, inBarrowShape, MOUND, PASSAGE, PORTAL, WAY_DOWN } from '../src/world/dungeon/barrowMesh';
import { WildMat } from '../src/world/dungeon/meshKit';
import { TOWN_LAYERS } from '../src/render/terrain/groundTextures';

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

test('barrow: rough rock portal and grass banked round it, all faces outward, all layers known', () => {
  const m = barrowMesh(7);
  assert.ok(m.mat.every((k) => k < TOWN_LAYERS.length));
  assert.ok(m.mat.includes(WildMat.Rock) && m.mat.includes(WildMat.Grass));
  // Seeded: the same barrow twice, another seed another.
  assert.deepEqual(barrowMesh(7).position, m.position);
  assert.notDeepEqual(barrowMesh(8).position, m.position);
  // Grass above head height faces up (the mound's and bank's tops are outside, not inside out).
  for (let i = 0; i < m.mat.length; i++) {
    if (m.mat[i] === WildMat.Grass && m.position[3 * i + 1] > PORTAL.top + 0.1) assert.ok(m.normal[3 * i + 1] > 0, `grass at ${i} faces down`);
  }
  // The bank stands in front of the mound, covering the passage's sides up to the stones.
  assert.ok(inBarrowShape(BANK.half - 1, PASSAGE.front - BANK.slope - 0.5, 0.3));
});
