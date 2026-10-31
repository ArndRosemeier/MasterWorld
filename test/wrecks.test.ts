import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { sightFor, type NeedContext } from '../src/vgm/answers';
import { offTheCoast, wreckFor } from '../src/vgm/wrecks';
import { wreckLying } from '../src/world/fleet';

const seed = parseSeed('masterworld'), { terrain, log } = openWorld(seed, classic), home = terrain.towns[0].decision;
// A swimmer off the coast, out of the harbour's way.
const off = offTheCoast(terrain, home)!;
const c = (over: Partial<NeedContext> = {}): NeedContext => ({ seed, log, terrain, towns: terrain.towns, hours: 30, setting: classic, hero: off, toward: null, ...over });

test('wrecks (S8): a reward by the sea is a ship gone down near the hero, on a level bed 6 to 16 m down, out of the harbour', () => {
  const d = wreckFor(c());
  assert.ok(d, 'a wreck near a swimmer off the coast');
  assert.equal(d.sea, true);
  assert.equal(d.need, 'reward');
  assert.deepEqual(wreckFor(c()), d, 'the same on every run');
  const far = Math.hypot(d.x - off.x, d.z - off.z), bed = -terrain.height(d.x, d.z);
  assert.ok(far >= 50 && far <= 450, `${far.toFixed(0)} m from the hero`);
  assert.ok(bed >= 6 && bed <= 16, `${bed.toFixed(1)} m down`);
  assert.ok(Math.hypot(d.x - home.x, d.z - home.z) >= 450, 'out of the harbour');
  // She lies on the bed, sunk into it, over on her side.
  const { plan, pose } = wreckLying(d, terrain.height(d.x, d.z));
  assert.ok(pose.y > terrain.height(d.x, d.z) && pose.y < terrain.height(d.x, d.z) + plan.draft, 'in the bed to half her draft');
  assert.ok(Math.abs(pose.roll) >= 0.3 && Math.abs(pose.roll) <= 0.6, 'on her side');
  // One near is enough; none in the harbour; a find by the way on land is never a wreck.
  assert.equal(wreckFor(c({ log: [...log, d] })), null, 'no second wreck near the first');
  assert.equal(wreckFor(c({ hero: { x: home.x, z: home.z } })), null, 'none among the moorings');
  for (let k = 0; k < 6; k++) assert.ok(!sightFor(c({ hours: 30 + k, hero: { x: home.x, z: home.z }, toward: { x: home.x + 600, z: home.z } }), 'reward')?.sea, 'no wreck by the way');
});
