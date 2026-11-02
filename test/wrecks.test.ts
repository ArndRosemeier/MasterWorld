import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { frontierLand, startWorld } from './frontierLand';
import { sightFor, type NeedContext } from '../src/vgm/answers';
import { offTheCoast, washedUpFor, wreckFor } from '../src/vgm/wrecks';
import { wildFor } from '../src/vgm/wild';
import { layOutSight } from '../src/world/sites';
import { wreckLying } from '../src/world/fleet';

const { seed } = frontierLand(), { terrain, log } = startWorld(), home = terrain.towns[0].decision;
// A swimmer off the coast, out of the harbour's way.
const off = offTheCoast(terrain, home)!;
const c = (over: Partial<NeedContext> = {}): NeedContext => ({ seed, log, terrain, towns: terrain.towns, hours: 30, setting: classic, hero: off, toward: null, ...over });

test('wrecks (S8): a reward by the sea is a ship gone down near the hero, on a level bed 9 to 16 m down, out of the harbour', () => {
  const d = wreckFor(c());
  assert.ok(d, 'a wreck near a swimmer off the coast');
  assert.equal(d.sea, true);
  assert.equal(d.need, 'reward');
  assert.deepEqual(wreckFor(c()), d, 'the same on every run');
  const far = Math.hypot(d.x - off.x, d.z - off.z), bed = -terrain.height(d.x, d.z);
  assert.ok(far >= 50 && far <= 450, `${far.toFixed(0)} m from the hero`);
  assert.ok(bed >= 9 && bed <= 16, `${bed.toFixed(1)} m down`);
  assert.ok(Math.hypot(d.x - home.x, d.z - home.z) >= 450, 'out of the harbour');
  // She lies on the bed, sunk into it, over on her side.
  const { plan, pose } = wreckLying(d, terrain.height(d.x, d.z));
  assert.ok(pose.y > terrain.height(d.x, d.z) && pose.y < terrain.height(d.x, d.z) + plan.draft, 'in the bed to half her draft');
  assert.ok(Math.abs(pose.roll) >= 1 && Math.abs(pose.roll) <= 1.35, 'on her side, masts laid over');
  // Nothing of her stands out of the sea, even in shallow water: her masts broke off.
  for (const b of [-16, -9, -4]) {
    const w = wreckLying(d, b);
    for (const m of w.plan.masts) {
      assert.ok(w.pose.y + m.top * Math.cos(w.pose.roll) <= -1.4 || m.top <= m.foot + 1.5, `bed ${b}: mast top ${(w.pose.y + m.top * Math.cos(w.pose.roll)).toFixed(1)}`);
      assert.ok(m.yards.length >= 1 && m.yards.every((k) => k.y < m.top), 'a yard on each stump, under its top');
    }
  }
  // One near is enough; none in the harbour; a find by the way on land is never a wreck.
  assert.equal(wreckFor(c({ log: [...log, d] })), null, 'no second wreck near the first');
  assert.equal(wreckFor(c({ hero: { x: home.x, z: home.z } })), null, 'none among the moorings');
  for (let k = 0; k < 6; k++) assert.ok(!sightFor(c({ hours: 30 + k, hero: { x: home.x, z: home.z }, toward: { x: home.x + 600, z: home.z } }), 'reward')?.sea, 'no wreck by the way');
});

test('wrecks (S9): to a hero on the land by the sea, a reward is a boat washed up on a strand near them, square to the sea, out of the harbour', () => {
  // On the strand where the giant crabs live (vgm/wild.ts habitat shore).
  const shore = wildFor({ seed, log: [], towns: terrain.towns, terrain, hours: 0, setting: classic }, terrain.towns[0]).find((w) => w.group === 'crabs')!;
  const d = washedUpFor(c({ hero: shore }));
  assert.ok(d, 'a wreck washed up near a hero on the strand');
  assert.equal(d.strand, true);
  assert.equal(d.need, 'reward');
  assert.deepEqual(washedUpFor(c({ hero: shore })), d, 'the same on every run');
  const h = terrain.height(d.x, d.z), far = Math.hypot(d.x - shore.x, d.z - shore.z);
  assert.ok(h >= 0.3 && h <= 2.5 && terrain.waterDepth(d.x, d.z) === 0, `on the dry strand (${h.toFixed(1)} m)`);
  assert.ok(far >= 40 && far <= 350, `${far.toFixed(0)} m from the hero`);
  assert.ok(Math.hypot(d.x - home.x, d.z - home.z) >= 350, 'out of the harbour');
  assert.equal(washedUpFor(c({ hero: shore, log: [...log, d] })), null, 'one near is enough');
  assert.equal(washedUpFor(c()), null, 'not to a swimmer off the coast (a wreck on the bed is theirs)');
  // Laid out: its wrack, casks and chest, and the boat herself solid.
  const lay = layOutSight(d, 'washed-up', (x, z) => terrain.height(x, z));
  assert.ok(lay.solids.length >= 8, 'casks, chest and the hull stand in the way');
});
