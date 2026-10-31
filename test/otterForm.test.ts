import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Shapeshift, shapeBars } from '../src/game/birdForm';
import { OtterSwim, SWIM, type SwimIntent } from '../src/sim/otterSwim';
import { Breath, BREATH } from '../src/game/breath';
import { shapeOf } from '../src/game/recipe';

const otter = classic.abilities.find((a) => shapeOf(a)?.into === 'otter')!;
const bird = classic.abilities.find((a) => shapeOf(a)?.into === 'bird')!;
// A shore at x = 0: dry to the west, the bed falling 1 m in 10 to the east under water at 12.
const shore = {
  height: (x: number) => 12.5 - x * 0.1,
  waterLevel: (x: number) => (12.5 - x * 0.1 < 12 ? 12 : null),
};
const swim = (o: OtterSwim, i: Partial<SwimIntent>, secs: number) => {
  for (let t = 0; t < secs; t += 1 / 30) o.steer({ forward: 0, heading: o.yaw, up: false, down: false, walk: false, land: false, ...i }, 1 / 30);
};
const change = (s: Shapeshift, secs: number, grounded = true) => {
  for (let t = 0; t < secs; t += 0.1) s.tickChange(0.1, { fighting: false, grounded });
};

test('otter form: taught, given by the hedge witch for a deed, holding the breath six times as long', () => {
  assert.ok(otter && otter.taught);
  assert.equal(shapeOf(otter)!.hold, 6);
  const witch = classic.guilds?.find((g) => g.quest?.reward === 'otter');
  assert.ok(witch, 'a guild master gives it');
  assert.ok(!classic.guilds?.some((g) => g.teaches.includes('otter')), 'no trainer sells it');
});

test('otter form: only begun in the water, never in a fight; turned back at the surface', () => {
  const s = new Shapeshift(otter);
  assert.match(s.callOn({ fighting: false }) ?? '', /water/);
  assert.match(s.callOn({ fighting: true, swimming: true }) ?? '', /fight/);
  assert.equal(s.callOn({ fighting: false, swimming: true }), null);
  change(s, shapeOf(otter)!.change + 0.2);
  assert.equal(s.phase, 'animal');
  // Deep under: asked to turn back, it rises first.
  s.callOn({ fighting: false, grounded: false });
  assert.ok(s.landing && s.phase === 'animal');
  change(s, 0.2, true);
  assert.equal(s.phase, 'returning');
});

test('in any animal form no ability works but its own change back (nor the potion or rest)', () => {
  for (const def of [bird, otter]) {
    const s = new Shapeshift(def), other = new Shapeshift(def === bird ? otter : bird), all = [s, other];
    assert.equal(shapeBars(all, 'strike'), null, 'as themself everything works');
    s.callOn({ fighting: false, swimming: def === otter });
    assert.match(shapeBars(all, 'strike') ?? '', /shape changes/, 'not while changing');
    change(s, shapeOf(def)!.change + 0.2);
    for (const id of classic.abilities.map((a) => a.id).filter((id) => id !== def.id).concat('potion', 'rest')) {
      assert.match(shapeBars(all, id) ?? '', /cannot do that/, `${def.id}: ${id} is barred`);
    }
    assert.equal(shapeBars(all, def.id), null, 'its own works: the change back');
  }
});

test('otter swimming: fast at the surface, dives deep, rises, never onto dry land nor through the bed', () => {
  const o = new OtterSwim(shore);
  o.slipIn(30, 0, -Math.PI / 2); // 3.5 m of water, facing east (out to sea)
  assert.ok(o.surfaced && o.grounded && !o.under);
  swim(o, { forward: 1 }, 3);
  assert.ok(o.pos.x > 30 + SWIM.fast * 2, 'swift along the surface');
  assert.equal(o.doing, 'paddle');
  swim(o, { forward: 1, down: true }, 6);
  assert.ok(o.under && !o.grounded, 'dived');
  assert.equal(o.doing, 'swim');
  assert.ok(o.pos.y >= shore.height(o.pos.x) + SWIM.bottom - 0.2, 'over the bed');
  assert.ok(12 - o.pos.y > 2, 'deep under');
  swim(o, { land: true }, 8);
  assert.ok(o.surfaced, 'up again to turn back');
  // Back west to the shore: it stops in the shallows at the water's edge (the hero stands up there).
  o.yaw = Math.PI / 2;
  swim(o, { forward: 1, heading: Math.PI / 2 }, 20);
  assert.ok(o.pos.x > 5, 'never onto the dry land');
  assert.ok(o.shallow && o.grounded);
});

test('breath: an otter holds it six times as long', () => {
  const b = new Breath();
  for (let t = 0; t < BREATH * 3; t += 0.1) b.breathe(0.1, true, false, 100, 6);
  assert.ok(Math.abs(b.share - 0.5) < 0.01, 'half a breath left after three breaths\' time');
  let lost = 0;
  for (let t = 0; t < BREATH * 4; t += 0.1) lost += b.breathe(0.1, true, false, 100, 6);
  assert.ok(lost > 0 && b.gasping, 'out of it at last');
});
