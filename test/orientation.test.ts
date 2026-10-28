import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { MASTER, NOVICE, Orientation } from '../src/game/orientation';
import { cardAt, HAND_OVER_SECONDS, heroReach, MARKED, sheetHeldBy } from '../src/app/handOver';

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

test('hand-over in the world: the hero holds the map out, the teller has it while marking, the hero takes it back and puts it away', () => {
  assert.equal(heroReach(0), 0);
  assert.equal(sheetHeldBy(0), 'hero', 'out of the pack into the hand');
  assert.equal(heroReach(MARKED - 0.01), 1, 'held out as it is taken');
  for (let t = MARKED; t < MARKED + 1.2; t += 0.1) assert.equal(sheetHeldBy(t), 'teller', 'in the teller\'s hands while marked');
  const back = [...Array(40).keys()].map((i) => (i / 40) * HAND_OVER_SECONDS).filter((t) => t > MARKED + 1.4 && sheetHeldBy(t) === 'hero');
  assert.ok(back.length && back.some((t) => heroReach(t) > 0.9), 'taken back with the hand out');
  assert.equal(sheetHeldBy(HAND_OVER_SECONDS), null, 'away in the pack at the end');
  assert.ok(heroReach(HAND_OVER_SECONDS) < 0.01, 'the hand down again');
});
