import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromFrame, inOpening, openingOutline, passesThrough, stepDir, stepPoint, stepYaw, through, toFrame, type Portal } from '../src/game/portal';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

const mouth = { x: 120, y: 14, z: -40, yaw: 0.7 };
const cave = { x: 300, y: -400, z: 80, yaw: -2.2 };
const portal: Portal = { id: 'cave', a: { realm: 'land', frame: mouth }, b: { realm: 'cave', frame: cave }, shape: { halfWidth: 1.4, height: 2.6 } };

test('portal frames: forward is -z turned by yaw, as a walker\'s', () => {
  const f = fromFrame(mouth, { x: 0, y: 0, z: -1 });
  assert.ok(near(f.x - mouth.x, -Math.sin(mouth.yaw)) && near(f.z - mouth.z, -Math.cos(mouth.yaw)));
  const back = toFrame(mouth, fromFrame(mouth, { x: 0.3, y: 1.1, z: -2.5 }));
  assert.ok(near(back.x, 0.3) && near(back.y, 1.1) && near(back.z, -2.5));
});

test('portal step: a point and a heading go through unchanged relative to the openings', () => {
  const p = fromFrame(mouth, { x: 0.5, y: 1, z: -0.4 });
  const q = toFrame(cave, stepPoint(mouth, cave, p));
  assert.ok(near(q.x, 0.5) && near(q.y, 1) && near(q.z, -0.4));
  // Walking straight in (facing the mouth's way through) comes out facing the cave side's way through.
  assert.ok(near(stepYaw(mouth, cave, mouth.yaw), cave.yaw));
  const v = stepDir(mouth, cave, { x: -Math.sin(mouth.yaw), y: 0, z: -Math.cos(mouth.yaw) });
  assert.ok(near(v.x, -Math.sin(cave.yaw)) && near(v.z, -Math.cos(cave.yaw)));
});

test('portal opening: an arch, round on top', () => {
  const s = portal.shape;
  assert.equal(inOpening(s, 0, 1), true);
  assert.equal(inOpening(s, 1.3, 0.5), true);
  assert.equal(inOpening(s, 1.3, 2.5), false, 'the rounded top cuts the corner');
  assert.equal(inOpening(s, 0, 2.55), true);
  assert.equal(inOpening(s, 1.5, 1), false);
  assert.equal(inOpening(s, 1.3, 1, 0.2), false, 'the margin');
  const out = openingOutline(s);
  assert.ok(out.every(([u, v]) => inOpening(s, u * 0.999, v * 0.999 + 0.001)));
});

test('portal crossing: through the opening either way, not round it', () => {
  const at = (x: number, y: number, z: number) => fromFrame(mouth, { x, y, z });
  assert.equal(passesThrough(portal.a, portal.shape, at(0, 1, 0.3), at(0, 1, -0.2)), true, 'in');
  assert.equal(passesThrough(portal.a, portal.shape, at(0, 1, -0.2), at(0, 1, 0.3)), true, 'out again');
  assert.equal(passesThrough(portal.a, portal.shape, at(2, 1, 0.3), at(2, 1, -0.2)), false, 'beside it');
  assert.equal(passesThrough(portal.a, portal.shape, at(0, 1, 0.6), at(0, 1, 0.3)), false, 'short of it');
  const t = through([portal], 'land', at(0, 1, 0.3), at(0, 1, -0.2))!;
  assert.equal(t.there.realm, 'cave');
  assert.equal(through([portal], 'cave', at(0, 1, 0.3), at(0, 1, -0.2)), null, 'the cave side is elsewhere');
  const c = (x: number, y: number, z: number) => fromFrame(cave, { x, y, z });
  assert.equal(through([portal], 'cave', c(0, 1, -0.3), c(0, 1, 0.2))!.there.realm, 'land');
});
