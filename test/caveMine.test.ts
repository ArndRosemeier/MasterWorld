import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves, small } from './support/formedCave';
import { formCave } from '../src/world/cave/form';
import { oreAt } from '../src/world/cave/block';
import { boxesMesh } from '../src/world/cave/fittings';
import { rockFor, sharesFor } from '../src/world/cave/choose';

test('mines (K8): moor and badlands hold hard rock with a long vein, the mine forms the same twice, and its adit is a way in from the land', () => {
  for (const kind of ['moor', 'badlands']) assert.equal(rockFor(caves, kind, 5)!.id, 'hard-rock');
  assert.deepEqual(sharesFor(caves, 'moor', 3), { built: 1, water: 0, lava: 0 });
  const own = (seed: number) => formCave(caves, seed, 'hard-rock', small.id, undefined, undefined, small), a = own(3), b = own(3), c = own(4);
  assert.equal(JSON.stringify(a.skeleton.conduits), JSON.stringify(b.skeleton.conduits), 'seeded');
  assert.notEqual(JSON.stringify(a.skeleton.conduits), JSON.stringify(c.skeleton.conduits));
  assert.equal(a.block.ore[0].kind, 'vein', 'the people came for a vein');
  assert.ok(a.skeleton.conduits.some((x) => x.kind === 'mouth') && a.skeleton.throat, 'a way in from the land');
  for (const x of a.skeleton.conduits) {
    assert.ok(!x.active && x.points.every((p) => p.flow === 0), 'no water runs in a mine');
    for (const p of x.points) assert.ok(p.A >= caves.way.minWidth / 2 && p.B >= caves.way.minHeight / 2 && (p.sq ?? 0) > 0.5, 'a drift fits the hero and is cut square');
  }
});

test('mines (K8): the drifts run along the vein, so its ore shows in the wall; the mine is dressed with no dripstone and no stream and is one network from the adit', () => {
  for (const seed of [1, 2, 4]) {
    const { c, reading, dressing } = formedCave(seed, 'hard-rock');
    assert.equal(dressing.speleos.length, 0, 'no stalactites in a mine');
    assert.equal(dressing.streams.length, 0, 'no stream');
    assert.ok(reading.stats.reached >= 0.95 * reading.stats.cells && reading.stats.cutOff === 0, `seed ${seed}: reached ${reading.stats.reached} of ${reading.stats.cells}`);
    // Ore at the wall of the long drift: its vein is the drift's wall (the best passage of the mine: the adit does not follow the vein).
    const vein = c.block.ore[0];
    assert.equal(vein.kind, 'vein');
    const nh = Math.hypot(vein.plane.nx, vein.plane.nz), hx = vein.plane.nx / nh, hz = vein.plane.nz / nh;
    const share = (pts: readonly { x: number; y: number; z: number; A: number }[]) => pts.filter((p) => [-1, 1].some((sg) => [0.1, 0.4, 0.8].some((l) => oreAt(c.block, p.x + hx * sg * (p.A + l), p.y, p.z + hz * sg * (p.A + l))))).length / pts.length;
    const best = Math.max(...c.skeleton.conduits.filter((x) => x.kind === 'passage' && x.points.length > 5).map((x) => share(x.points)));
    assert.ok(best >= 0.6, `seed ${seed}: ore at the wall along ${(best * 100).toFixed(0)} % of the best drift`);
  }
});

test('mines (K8): timber sets, rails and a cart are fitted (inside the air, on the floor), and no cave but a mine has any', () => {
  for (const seed of [1, 2, 4]) {
    const { dressing } = formedCave(seed, 'hard-rock');
    assert.ok(dressing.fittings.length >= 10, `seed ${seed}: ${dressing.fittings.length} fittings`);
    assert.ok(dressing.fittings.some((k) => k.pitch > 1.5), 'timber posts stand');
    assert.ok(dressing.fittings.every((k) => Number.isFinite(k.x + k.y + k.z + k.l + k.h + k.w) && k.l > 0 && k.h > 0 && k.w > 0));
    const mesh = boxesMesh(dressing.fittings);
    assert.equal(mesh.position.length / 3, dressing.fittings.length * 24, 'four corners on each of six faces');
  }
  assert.equal(formedCave(1, 'basalt').dressing.fittings.length, 0);
});
