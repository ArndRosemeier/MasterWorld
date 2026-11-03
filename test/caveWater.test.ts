import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave, caves } from './support/formedCave';
import { caveWater } from '../src/world/cave/water';
import { formedWorld } from '../src/game/formedWorld';
import { caveLevel } from '../src/game/dungeonWorld';
import { Walker } from '../src/game/walker';
import type { BrickField } from '../src/world/dungeon/rockMesh';

const { bed, poolDepth } = caves.dress.water;

test('cave water (K6): a stream on a ledge over a pool below are two waters at one (x, z): the height asked at says which', () => {
  const at = caveWater({ streams: [{ pts: [[0, 5, 0, 1], [1, 5, 0, 1]] }], pools: [{ x: 0, y: 1, z: 0, r: 1.5 }] }, bed, poolDepth)!;
  assert.equal(at(0, 0.9, 0), 1, 'feet in the pool: its surface');
  assert.equal(at(0, 1 - poolDepth, 0), 1, 'on its bed');
  assert.equal(at(0, 4.9, 0), 5, 'feet in the stream above: the stream');
  assert.equal(at(0, 3.5, 0), 1, 'over the pool, on the bank above it: the pool below (the nearest water under the feet)');
  assert.equal(at(0, 8, 0), null, 'a long way over the surface: none');
  assert.equal(at(0, -2, 0), null, 'under the bed: none');
  assert.equal(at(4, 1, 0), null, 'beside it: none');
  assert.equal(caveWater({ streams: [], pools: [] }, bed, poolDepth), null, 'a dry cave has none');
});

test('cave water (K6): in a dressed cave the walker finds the stream under its feet and none away from it; in the cave frame placed in the world too', () => {
  const { c, dressing } = formedCave(6, 'massive'), f = c.field as BrickField, water = caveWater(dressing, bed, poolDepth);
  assert.ok(water && dressing.streams.length >= 1, 'a cave with a stream');
  const world = formedWorld(f, { x: 0, y: 0, z: 0 }, water), moved = formedWorld(f, { x: 100, y: -400, z: -50 }, water);
  let wet = 0, dry = 0;
  for (const sm of dressing.streams) for (const [x, y, z, w] of sm.pts) {
    // On the bed (a little under the surface): in the water, its surface the stream's.
    const s = world.waterLevel(x, y - bed * 0.5, z);
    assert.ok(s !== null && s <= y + 1e-9 && s > y - 1.5, `the surface here (${s}) is the stream's (${y}), or the lower one at a drop`);
    assert.equal(moved.waterLevel(x + 100, y - bed * 0.5 - 400, z - 50), s! - 400, 'the same, in the world');
    wet++;
    // Well to the side of it (clear of the stream's own width) no water, unless another stream or pool is there.
    const side = w + 3;
    if (!dressing.streams.some((o) => o.pts.some((p) => Math.hypot(p[0] - x - side, p[2] - z) < p[3] + 0.5)) && !dressing.pools.some((p) => Math.hypot(p.x - x - side, p.z - z) < p.r + 0.5)) { assert.equal(world.waterLevel(x + side, y - bed * 0.5, z), null); dry++; }
  }
  assert.ok(wet >= 6 && dry >= 3, `${wet} points on streams, ${dry} dry beside`);
});

test('cave water (K6): the walker in a cave pool deep enough to swim swims and floats at the surface, a hero wading a stream does not swim', () => {
  const deep = (x: number, y: number, z: number): number | null => (Math.hypot(x, z) < 3 && y > -3 ? 0 : null);
  const world = { height: () => -1000, rockSurface: (_x: number, y: number, _z: number) => Math.min(y + 3, 6 - y), waterLevel: caveLevel(deep, { x: 0, y: 0, z: 0 }) };
  const w = new Walker(world);
  w.place(0, 0, -2.5);
  for (let t = 0; t < 120; t++) w.step({ forward: 0, strafe: 0, heading: 0, walk: false, up: false, down: false }, 1 / 60);
  assert.equal(w.mode, 'swim', 'a body in 2.5 m of water swims');
  const shallow = new Walker({ height: () => 0, rockSurface: (_x: number, y: number) => Math.min(y, 6 - y), waterLevel: () => 0.2 });
  shallow.place(0, 0, 0);
  for (let t = 0; t < 60; t++) shallow.step({ forward: 0, strafe: 0, heading: 0, walk: false, up: false, down: false }, 1 / 60);
  assert.notEqual(shallow.mode, 'swim', 'a wading depth is walked');
});
