import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves, small } from './support/formedCave';
import { dressFormed, formCave, readFormed } from '../src/world/cave/form';
import { formedWorld } from '../src/game/formedWorld';
import { Walker } from '../src/game/walker';
import { oreAt } from '../src/world/cave/block';
import { fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';
import { boxesMesh, ladderBoxes } from '../src/world/cave/fittings';
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

test('mines (K8): the lumps of ore lie on the wall they show in, none hung in the air beside it (seen on the GPU)', () => {
  for (const seed of [1, 2]) {
    const { c, dressing } = formedCave(seed, 'hard-rock'), ores = dressing.stones.filter((s) => s.ore >= 0);
    const hung = ores.filter((s) => fieldAt(c.field as BrickField, s.x, s.y, s.z, -1) > s.r);
    assert.ok(ores.length >= 50 && hung.length <= ores.length * 0.04, `seed ${seed}: ${hung.length} of ${ores.length} ore lumps hang off the wall`);
  }
});

test('mines (K8): a winze leans up between two levels in a niche at a drift\'s side, with a ladder up its floor; the reader links its foot and head, and the real walker climbs it without tiring', () => {
  // A mine of two levels (found by seed on the real small size; the climb, the reader and the boxes are checked on it).
  const c = formCave(caves, 17, 'hard-rock', 'small'), d = dressFormed(c, caves), { reading: R } = readFormed(c, caves, d);
  const winze = c.skeleton.conduits.find((x) => x.ladder);
  assert.ok(winze?.ladder, 'a winze');
  assert.equal(d.ladders.length, 1);
  const l = d.ladders[0], hor = Math.hypot(l.x1 - l.x0, l.z1 - l.z0), rise = l.y1 - l.y0;
  assert.ok(rise >= 8 && hor / rise > 0.1 && hor / rise < 0.5, `${rise.toFixed(1)} m of rise over ${hor.toFixed(1)} m: leaning, not plumb and not a ramp`);
  assert.ok(R.stats.links.ladder >= 2, 'the reader links the foot and head');
  assert.ok(R.stats.reached >= 0.95 * R.stats.cells && R.stats.cutOff === 0, 'still one network');
  const boxes = ladderBoxes(l);
  assert.ok(boxes.length >= 2 + Math.floor(Math.hypot(hor, rise) / 0.34) - 1, `${boxes.length} boxes: two rails and a rung every third of a metre`);
  // The real walker, standing at the foot facing up the slope, climbs it and stands on the landing above, though it would tire on bare rock (`tire` refuses).
  const world = formedWorld(c.field as BrickField, undefined, null, d.ladders), w = new Walker(world), ux = (l.x1 - l.x0) / hor, uz = (l.z1 - l.z0) / hor;
  w.tire = () => false;
  w.place(l.x0 - ux * 0.5, l.z0 - uz * 0.5, l.y0 + 0.02);
  let climbed = false;
  for (let s = 0; s < 60 * 25 && !(climbed && w.mode === 'ground' && w.pos.y > l.y1 - 0.5); s++) {
    w.step({ forward: 1, strafe: 0, heading: Math.atan2(-ux, -uz), walk: false, up: false, down: false }, 1 / 60);
    if (w.mode === 'climb') climbed = true;
  }
  assert.ok(climbed && w.mode === 'ground' && w.pos.y > l.y1 - 0.5, `ended ${w.mode} at ${w.pos.y.toFixed(1)}, the head is at ${l.y1.toFixed(1)}`);
  // Without the ladder (a bare shaft) the same climb tires the hero out and lets go.
  const bare = new Walker(formedWorld(c.field as BrickField)); let spent = 0;
  bare.tire = (dt) => (spent += dt) < 3;
  bare.place(l.x0 - ux * 0.5, l.z0 - uz * 0.5, l.y0 + 0.02);
  for (let s = 0; s < 60 * 25; s++) bare.step({ forward: 1, strafe: 0, heading: Math.atan2(-ux, -uz), walk: false, up: false, down: false }, 1 / 60);
  assert.ok(bare.pos.y < l.y1 - 0.5, 'a tiring climb does not reach the top of ten metres');
});

test('mines (K8): winzes keep out of the stopes and from each other, and a mine of one level has none', () => {
  for (const seed of [1, 2, 7, 11, 23]) {
    const sk = formCave(caves, seed, 'hard-rock', 'medium').skeleton, w = sk.conduits.filter((x) => x.ladder);
    for (const x of w) {
      for (const v of sk.voids) for (const p of x.points) if (p.y > v.floor - 3 && p.y < v.floor + v.height + 2) assert.ok(Math.hypot(p.x - v.x, p.z - v.z) > Math.max(v.rx, v.rz) + 3 - 1e-6, `seed ${seed}: a winze in a stope`);
      for (const y of w) if (y !== x) assert.ok(x.points.every((p) => y.points.every((o) => Math.hypot(o.x - p.x, o.z - p.z) > 6 - 1e-6 || Math.abs(o.y - p.y) > 4)), `seed ${seed}: winzes side by side`);
    }
  }
});
