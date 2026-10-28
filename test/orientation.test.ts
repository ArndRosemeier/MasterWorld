import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { MASTER, NOVICE, Orientation } from '../src/game/orientation';
import { cardAt, HAND_OVER_SECONDS } from '../src/app/handOver';

const at = (skill: number) => {
  const hero = new Character(classic);
  hero.skills.set('orientation', skill);
  return { hero, o: new Orientation(7, hero) };
};

test('orientation: a novice sees a wide area and no arrow, a master the exact arrow', () => {
  const novice = at(NOVICE).o.bearing(120, -40, 1);
  assert.ok(novice.radius > 60, `radius ${novice.radius}`);
  assert.equal(novice.yaw, null);
  const mid = at(45).o.bearing(120, -40, 1);
  assert.ok(mid.radius > 0 && mid.radius < novice.radius);
  assert.notEqual(mid.yaw, null);
  assert.ok(Math.abs(mid.yaw! - 1) < 0.7);
  assert.deepEqual(at(MASTER).o.bearing(120, -40, 1), { x: 120, z: -40, radius: 0, yaw: 1 });
});

test('orientation: the hero is always inside the area, and the guess holds still where they stand', () => {
  for (const skill of [NOVICE, 25, 50, 70]) {
    const { o } = at(skill);
    for (let i = 0; i < 200; i++) {
      const x = i * 37.3 - 3000, z = i * -53.1 + 900, b = o.bearing(x, z, 0);
      assert.ok(Math.hypot(b.x - x, b.z - z) <= b.radius + 1e-9, `skill ${skill} at ${x},${z}`);
      assert.deepEqual(o.bearing(x, z, 0), b);
    }
  }
  // It drifts, so the middle does not simply follow the hero.
  const { o } = at(NOVICE), a = o.bearing(0, 0, 0), b = o.bearing(400, 0, 0);
  assert.ok(Math.abs((a.x - 0) - (b.x - 400)) > 1);
});

test('hand-over: the card rises from the hand, the mark is drawn while it is held, and it goes back', () => {
  const start = cardAt(0), end = cardAt(HAND_OVER_SECONDS);
  assert.equal(start.alpha, 0); assert.equal(start.mark, 0);
  assert.ok(end.alpha < 0.01 && end.y > 1); assert.equal(end.mark, 1);
  let last = 0, held = false;
  for (let t = 0; t <= HAND_OVER_SECONDS; t += 0.05) {
    const c = cardAt(t);
    assert.ok(c.mark >= last); last = c.mark;
    if (c.mark > 0 && c.mark < 1) { held = true; assert.ok(Math.abs(c.x - 0.42) < 0.01 && c.alpha === 1); }
  }
  assert.ok(held);
});
