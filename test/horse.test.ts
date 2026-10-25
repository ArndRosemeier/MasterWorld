import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORSE, MOUNT_REACH, Steed, horseGait, horseSpots, nearestSteed } from '../src/game/horse';
import type { WalkIntent, WalkWorld } from '../src/game/walker';

/** Flat land at 2 m with a wall (a house) east of x = 4. */
const world: WalkWorld = { height: () => 2, rockSurface: () => null, waterLevel: () => null, wall: (x, _z, r) => x + r > 4 };
const free = (x: number, z: number, r: number) => !world.wall!(x, z, r);
const go = (o: Partial<WalkIntent> = {}): WalkIntent => ({ forward: 0, strafe: 0, heading: 0, walk: false, up: false, down: false, ...o });
const ride = (s: Steed, i: WalkIntent, secs: number, facing?: number) => { for (let t = 0; t < secs; t += 1 / 60) s.move(1 / 60, i, facing); };

test('horse: ridden forward it builds up through walk and trot to a 12 m/s gallop; let go it slows and stops', () => {
  const s = new Steed(world, 0, 1);
  s.walker.place(-200, 0);
  s.ridden = true;
  const seen = new Set<string>();
  for (let t = 0; t < 4; t += 1 / 60) { s.move(1 / 60, go({ forward: 1 })); seen.add(s.gait); }
  assert.ok(Math.abs(s.speed - HORSE.run) < 0.3, `gallops at ${s.speed.toFixed(1)} m/s`);
  assert.deepEqual([...seen].filter((g) => g !== 'idle'), ['walk', 'trot', 'gallop']);
  assert.ok(s.pos.z < -20, `went north (${s.pos.z.toFixed(1)})`);
  assert.ok(Math.abs(s.pos.y - 2) < 1e-6, 'on the ground');
  ride(s, go(), 4);
  assert.equal(s.gait, 'idle');
  ride(s, go({ forward: 1, walk: true }), 4);
  assert.equal(s.gait, 'walk');
});

test('horse: it turns at its own rate, and strafing turns it (a horse does not sidestep); it never jumps', () => {
  const s = new Steed(world, 0, 1);
  s.walker.place(-200, 0);
  s.ridden = true;
  // Asked to face east at once: a quarter turn takes more than half a second.
  ride(s, go(), 0.25, -Math.PI / 2);
  assert.ok(s.yaw < 0 && s.yaw > -Math.PI / 2 + 0.2, `turning (${s.yaw.toFixed(2)})`);
  ride(s, go(), 2, -Math.PI / 2);
  assert.ok(Math.abs(s.yaw + Math.PI / 2) < 1e-6, 'faces east');
  const x = s.pos.x, yaw = s.yaw;
  ride(s, go({ strafe: 1 }), 0.5);
  assert.ok(s.yaw < yaw - 0.5 && Math.abs(s.pos.x - x) < 0.05, `strafe right turns right (${(yaw - s.yaw).toFixed(2)} rad), no sidestep`);
  ride(s, go({ up: true }), 0.5);
  assert.equal(s.walker.mode, 'ground');
});

test('horse: standing it grazes or waits (seeded); nobody steers it', () => {
  const rests = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((id) => new Steed(world, id, 9).rest));
  assert.deepEqual([...rests].sort(), ['eat', 'idle']);
  const s = new Steed(world, 0, 9);
  s.walker.place(0, 0);
  ride(s, go({ forward: 1 }), 1);
  assert.equal(s.speed, 0);
  assert.equal(s.gait, s.rest);
});

test('horse: the nearest unridden horse in reach is mounted; the rider gets off on its left, or where there is room', () => {
  const a = new Steed(world, 0, 1), b = new Steed(world, 1, 1);
  a.walker.place(0, 0);
  b.walker.place(1.5, 0);
  assert.equal(nearestSteed([a, b], 1.2, 0), b);
  b.ridden = true;
  assert.equal(nearestSteed([a, b], 1.2, 0), a);
  assert.equal(nearestSteed([a, b], MOUNT_REACH + 1, 0), null);
  // Facing north (yaw 0) its left is west.
  a.walker.yaw = 0;
  const left = a.dismountSpot(free);
  assert.ok(left.x < -1 && Math.abs(left.z) < 1e-6, `off on the left (${left.x.toFixed(2)}, ${left.z.toFixed(2)})`);
  // Facing south by the wall, its left is east, into the wall: off on the right.
  a.walker.place(2.6, 0);
  a.walker.yaw = Math.PI;
  const right = a.dismountSpot(free);
  assert.ok(right.x < 2.6 && free(right.x, right.z, 0.35), `off where there is room (${right.x.toFixed(2)}, ${right.z.toFixed(2)})`);
});

test('horse: spots by the start are free, apart and to the right of the view', () => {
  const spots = horseSpots(-4, 0, 0, 3, free);
  assert.equal(spots.length, 3);
  for (const p of spots) assert.ok(free(p.x, p.z, HORSE.radius), `free at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`);
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) assert.ok(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z) >= 2.6);
  assert.ok(spots.every((p) => p.x > -4), 'right of the hero facing north');
  assert.equal(horseGait(0.1), 'idle');
});
