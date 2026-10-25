import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Walker, WALK, type WalkIntent, type WalkWorld } from '../src/game/walker';

/** Flat land at 10 m; a rock slab 2 m high from x 20 to 30 (a box); a lake (level 5) where the land dips at x < -20. */
const box = (x: number, y: number, z: number) => {
  const dx = Math.max(20 - x, x - 30, 0), dy = Math.max(y - 12, 0), dz = Math.max(Math.abs(z) - 50, 0);
  const inside = Math.min(0, Math.max(20 - x, x - 30, y - 12, Math.abs(z) - 50));
  return Math.hypot(dx, dy, dz) + inside;
};
const world: WalkWorld = {
  height: (x) => (x < -20 ? 10 - Math.min(10, (-20 - x) * 0.5) : 10),
  rockSurface: (x, y, z) => (x > 15 && x < 35 ? Math.min(y - 10, box(x, y, z)) : null),
  waterLevel: (x) => (x < -20 ? 9.5 : null),
};
const go = (o: Partial<WalkIntent> = {}): WalkIntent => ({ forward: 0, strafe: 0, heading: 0, walk: false, up: false, down: false, ...o });
const run = (w: Walker, i: WalkIntent, s: number) => { for (let t = 0; t < s; t += 1 / 60) w.step(i, 1 / 60); };

test('walker: stands on the ground and runs north at run speed', () => {
  const w = new Walker(world);
  w.place(0, 0);
  assert.equal(w.pos.y, 10);
  run(w, go({ forward: 1 }), 2);
  assert.ok(w.pos.z < -8 && Math.abs(w.pos.x) < 1e-6, `z ${w.pos.z}`);
  assert.ok(Math.abs(Math.hypot(w.vel.x, w.vel.z) - WALK.run) < 0.05);
  assert.equal(w.gait, 'run');
});

test('walker: a rock wall stops it; a jump lands back on the ground', () => {
  const w = new Walker(world);
  w.place(10, 0);
  w.yaw = -Math.PI / 2; // facing east
  run(w, go({ forward: 1, heading: w.yaw }), 3);
  assert.ok(w.pos.x < 20 - WALK.radius + 0.1 && w.pos.x > 18, `x ${w.pos.x}`);
  w.step(go({ up: true }), 1 / 60);
  assert.equal(w.mode, 'air');
  run(w, go(), 1.5);
  assert.equal(w.mode, 'ground');
  assert.ok(Math.abs(w.pos.y - 10) < 1e-6);
});

test('walker: stands on top of rock placed from above', () => {
  const w = new Walker(world);
  w.place(25, 0, 13);
  run(w, go(), 1);
  assert.ok(Math.abs(w.pos.y - 12) < 0.1, `y ${w.pos.y}`);
});

test('walker: wades into deep water and swims at the surface, then walks out', () => {
  const w = new Walker(world);
  w.place(-18, 0);
  w.yaw = Math.PI / 2; // facing west
  run(w, go({ forward: 1, heading: w.yaw }), 6);
  assert.equal(w.mode, 'swim');
  assert.equal(w.gait, 'swim');
  assert.ok(Math.abs(w.pos.y - (9.5 - w.height * 0.56)) < 0.05, `y ${w.pos.y}`);
  run(w, go({ forward: -1, heading: w.yaw }), 12);
  assert.equal(w.mode, 'ground');
});

test('walker: a building wall stops it, and it slides along', () => {
  // A house south of z = 5 (its north wall), the walker runs south-east at it.
  const w = new Walker({ ...world, wall: (_x, z, r) => z + r > 5 });
  w.place(0, 0);
  run(w, go({ forward: 1, strafe: 1, heading: Math.PI }), 2);
  assert.ok(w.pos.z <= 5 - WALK.radius + 1e-6 && w.pos.z > 4, `z ${w.pos.z}`);
  assert.ok(w.pos.x < -1 || w.pos.x > 1, `slid along the wall: x ${w.pos.x}`);
});
