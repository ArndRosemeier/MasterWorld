import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import type { SettingModule } from '../src/setting/contract';
import { Terrain } from '../src/world/terrain';
import { Skeleton } from '../src/world/skeleton';
import { Landforms } from '../src/world/landforms';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const world = classic.world;
const START = { x: -32000, z: 32000 };

/** The world with one biome everywhere on land: the skeleton picks it whatever the climate. */
function only(id: string): SettingModule['world'] {
  const b = world.biomes.find((k) => k.id === id)!;
  return { ...world, biomes: [{ ...b, temperature: [-100, 100], moisture: [0, 1], elevation: undefined }] };
}

test('landforms: a 1 km walk in each lowland biome passes at least five landforms of three shapes', () => {
  for (const b of world.biomes) {
    if (!b.landforms) continue;
    const w = only(b.id);
    const forms = new Landforms(seed, w, new Skeleton(seed, w));
    // Four walks out of the start in four directions; every one must pass enough.
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0.7, -0.7]]) {
      const seen = new Map<object, string>();
      for (let s = 0; s <= 1000; s += 25) {
        const x = START.x + dx * s, z = START.z + dz * s;
        for (const f of forms.within(x, z, 120)) seen.set(f, f.shape);
      }
      const shapes = new Set(seen.values());
      assert.ok(seen.size >= 5 && shapes.size >= 3, `${b.id} toward ${dx},${dz}: ${seen.size} landforms of ${shapes.size} shapes`);
    }
  }
});

test('landforms: placed from the seed alone (two threads agree), and they shape the ground', () => {
  const a = new Landforms(seed, world, new Skeleton(seed, world));
  const b = new Landforms(seed, world, new Skeleton(seed, world));
  // b asks for cells in another order first.
  b.offset(START.x + 3000, START.z - 2000);
  let moved = 0;
  for (let k = 0; k < 400; k++) {
    const x = START.x + (k % 20) * 37.3, z = START.z + Math.floor(k / 20) * 41.9;
    assert.equal(a.offset(x, z), b.offset(x, z));
    if (Math.abs(a.offset(x, z)) > 1) moved++;
  }
  assert.ok(moved > 40, `${moved} of 400 points moved more than a metre`);
});

test('landforms: none in a town; the town and its market keep their ground', () => {
  const t = new Terrain(seed, classic, SMALL);
  t.settle(firstDecisions(t, startPlace(t)));
  const town = t.towns[0].decision;
  assert.deepEqual(t.landforms.within(town.x, town.z, town.radius), []);
});

test('landforms: a pond lies in its dell, below the rim all round', () => {
  const t = new Terrain(seed, classic, SMALL);
  const ponds = [];
  for (let k = 0; k < 30 && ponds.length < 4; k++) {
    for (const f of t.landforms.within(START.x + 2000 * (k % 6), START.z - 2000 * Math.floor(k / 6), 1000)) if (!Number.isNaN(f.pond)) ponds.push(f);
  }
  assert.ok(ponds.length >= 2, `${ponds.length} ponds`);
  for (const f of ponds) {
    assert.ok(t.height(f.x, f.z) < f.pond, 'water in the dell');
    for (let a = 0; a < 16; a++) {
      const r = f.L * 1.35, x = f.x + Math.cos((a / 16) * Math.PI * 2) * r, z = f.z + Math.sin((a / 16) * Math.PI * 2) * r;
      assert.ok(t.height(x, z) > f.pond, `rim ${a} below the water`);
    }
  }
});
