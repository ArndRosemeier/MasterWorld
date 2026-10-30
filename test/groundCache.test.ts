import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroundCache } from '../src/world/groundCache';

test('groundCache: gives the exact height on the grid and bilinear between, asking each corner once', () => {
  let asked = 0;
  const f = (x: number, z: number) => { asked++; return 3 * x - 2 * z + 0.5 * x * z; };
  const g = new GroundCache(f);
  assert.ok(Math.abs(g.footing(1, 2) - (f(1, 2))) < 1e-9);
  // A plane's part is exact between the corners; the x*z part is bilinear, exact too.
  assert.ok(Math.abs(g.footing(1.1, 2.07) - (f(1.1, 2.07))) < 1e-9);
  asked = 0;
  for (let k = 0; k < 100; k++) g.footing(1.1, 2.07);
  assert.equal(asked, 0);
});

test('groundCache: starts over when the land changes', () => {
  let v = 0, lift = 0;
  const g = new GroundCache((x) => x + lift, () => v);
  assert.ok(Math.abs(g.footing(4, 4) - (4)) < 1e-9);
  lift = 10;
  assert.ok(Math.abs(g.footing(4, 4) - (4)) < 1e-9);
  v++;
  assert.ok(Math.abs(g.footing(4, 4) - (14)) < 1e-9);
});

test('groundCache: keeps a curved height within a hair of the exact one', () => {
  const f = (x: number, z: number) => Math.sin(x / 9) * 0.25 + Math.cos(z / 70) * 2.2;
  const g = new GroundCache(f);
  let worst = 0;
  for (let k = 0; k < 500; k++) { const x = -300 + k * 1.37, z = 200 - k * 0.91; worst = Math.max(worst, Math.abs(g.footing(x, z) - f(x, z))); }
  assert.ok(worst < 0.001, `worst ${worst}`);
});

