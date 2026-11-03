import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderGround } from '../src/render/dungeon/renderGround';

test('the rig\'s ground is read at the world place of a point drawn relative to the floating origin, and answered in the drawn frame', () => {
  // A hillside in the world: height = 100 + x / 10; the creatures' group sits at the world's origin (the wild) or in a cellar far away.
  const floor = (x: number, z: number) => 100 + x / 10 + z / 20;
  for (const den of [{ x: 0, y: 0, z: 0 }, { x: 5000, y: -300, z: -2000 }]) {
    const at = { x: -31872, y: 40, z: 30848 };
    // The den's floor is in the den's frame: the world's height less where the group sits.
    const g = renderGround((x, z) => floor(x + den.x, z + den.z) - den.y, den, at, () => 0, () => 0);
    // A foot drawn at (r.x, r.z) stands in the world at (r.x + at.x, r.z + at.z); the floor there, drawn, is that height less at.y.
    for (const [rx, rz] of [[0, 0], [12.5, -7], [-300, 410]]) {
      assert.ok(Math.abs(g(rx, rz) - (floor(rx + at.x, rz + at.z) - at.y)) < 1e-9, `at ${rx}, ${rz}`);
    }
  }
});

test('with no floor there, the fallback height stands in', () => {
  const g = renderGround(() => null, { x: 0, y: 10, z: 0 }, { x: 1000, y: 5, z: 1000 }, () => 0, () => 2);
  assert.equal(g(3, 4), 2 + 10 - 5);
});
