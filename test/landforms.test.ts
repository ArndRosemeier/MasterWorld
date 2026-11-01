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
  // Round the start (mesa country holds few dells; open country more).
  for (let k = 0; k < 64 && ponds.length < 4; k++) {
    for (const f of t.landforms.within(START.x + 2000 * ((k % 8) - 4), START.z + 2000 * (Math.floor(k / 8) - 4), 1000)) if (!Number.isNaN(f.pond)) ponds.push(f);
  }
  assert.ok(ponds.length >= 2, `${ponds.length} ponds`);
  for (const f of ponds) {
    assert.ok(t.height(f.x, f.z) < t.pondAt(f.x, f.z), 'water in the dell');
    for (let a = 0; a < 16; a++) {
      const r = f.L * 1.35, x = f.x + Math.cos((a / 16) * Math.PI * 2) * r, z = f.z + Math.sin((a / 16) * Math.PI * 2) * r;
      assert.ok(t.height(x, z) > t.pondAt(f.x, f.z), `rim ${a} below the water`);
    }
  }
});

test('landforms: a pond in a brook valley sits on the valley floor, never in the air above it', () => {
  // Seed fiaksm: a dell in a brook valley cut ~37 m into the skeleton; its pond was set from the skeleton and floated
  // there, its edge hanging down to the valley floor (Arnd 2026-10-30).
  const t = new Terrain(parseSeed('fiaksm'), classic, SMALL), X = 36977, Z = 9820;
  const ponds = t.landforms.within(X, Z, 1500).filter((f) => !Number.isNaN(f.pond));
  assert.ok(ponds.length >= 3, `${ponds.length} ponds`);
  let kept = 0;
  for (const f of ponds) {
    const level = t.pondAt(f.x, f.z);
    if (Number.isNaN(level)) continue;
    kept++;
    const floor = t.height(f.x, f.z);
    assert.ok(floor < level && level - floor < f.H + 1, `pond ${level.toFixed(1)} over a floor at ${floor.toFixed(1)}`);
    for (const r of [1, 1.4]) for (let a = 0; a < 16; a++) {
      const x = f.x + Math.cos((a / 16) * Math.PI * 2) * f.L * r, z = f.z + Math.sin((a / 16) * Math.PI * 2) * f.L * r;
      assert.ok(t.height(x, z) > level, `rim ${a} at ${r} below the water`);
    }
  }
  assert.ok(kept >= 2, `${kept} ponds kept`);
});

test('landforms (K7): a cinder cone rises steeply to a rim round a crater, and the volcanic country holds cones, lava rock and collapsed pits', async () => {
  const { shapeAt } = await import('../src/world/landforms');
  const cone = { shape: 'cone', L: 100, W: 100, H: 50, seed: 7 } as Parameters<typeof shapeAt>[0];
  const rim = Math.max(...[0.2, 0.3, 0.4, 0.5].map((r) => shapeAt(cone, 100 * r, 0)));
  assert.ok(rim > 0.6 * 50 && rim < 50, `a rim of ${rim.toFixed(1)} m`);
  assert.ok(shapeAt(cone, 0, 0) < rim - 8, 'the crater floor lies well under the rim');
  assert.ok(shapeAt(cone, 100, 0) < 1, 'it ends where its footprint does');
  const volcanic = world.kinds!.find((k) => k.id === 'volcanic')!;
  const shapes = Object.keys(volcanic.landforms!.mix).map((id) => world.landforms!.find((l) => l.id === id)?.shape);
  assert.ok(shapes.includes('cone') && shapes.includes('tor') && shapes.includes('sinkhole'), shapes.join(' '));
  // Cut from mesa country's share and put last: the shares before it keep their cumulative bounds.
  const sum = (ids: string[]) => world.kinds!.filter((k) => ids.includes(k.id)).reduce((a, k) => a + k.share, 0);
  assert.ok(Math.abs(sum(['open', 'downs', 'moor', 'karst', 'badlands', 'mesa', 'volcanic']) - 1) < 1e-9, 'the shares still sum to 1');
  assert.equal(world.kinds![world.kinds!.length - 1].id, 'volcanic');
});
