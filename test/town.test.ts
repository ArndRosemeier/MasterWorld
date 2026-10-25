import { townsfolk } from '../src/sim/people';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { polyCentroid } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { TownGround } from '../src/world/town';
import { floraPlacement, FLORA_STRIDE } from '../src/world/flora';

const { terrain, log, home } = openWorld(parseSeed('masterworld'), classic);

test('town: the VGM founds the start town near the start, on dry land, clear of the arch', () => {
  const d = log.find((x) => x.kind === 'town');
  assert.ok(d && d.kind === 'town', 'a town decision');
  assert.ok(Math.hypot(d.x - home.x, d.z - home.z) <= 1600, 'near the start');
  assert.ok(terrain.height(d.x, d.z) > 2, 'on dry land');
  const arch = terrain.volumes[0]?.site;
  if (arch) assert.ok(Math.hypot(arch.a[0] - d.x, arch.a[1] - d.z) > d.radius, 'the arch stands outside');
});

test('town: the market is level, and the ground knows its streets, market and houses', () => {
  const town = terrain.towns[0];
  const [mx, mz] = polyCentroid(town.plan.market);
  const hs = [-8, 0, 8].flatMap((dx) => [-8, 0, 8].map((dz) => terrain.height(mx + dx, mz + dz)));
  assert.ok(Math.max(...hs) - Math.min(...hs) < 0.3, `market rises ${(Math.max(...hs) - Math.min(...hs)).toFixed(2)} m`);
  assert.equal(terrain.townGround(mx, mz), TownGround.Market);
  const b = town.plan.buildings[0];
  assert.equal(terrain.townGround(b.cx, b.cz), TownGround.Building);
  const road = town.plan.streets.find((s) => s.kind === 'road')!;
  const k = (road.pts.length >> 2) * 2;
  assert.equal(terrain.townGround(road.pts[k], road.pts[k + 1]), TownGround.Street);
  assert.equal(terrain.townGround(mx + 5000, mz), TownGround.None);
  // A small town (D41): about 80-120 people.
  const people = townsfolk(town.plan, terrain.seed).length;
  assert.ok(people >= 70 && people <= 150, `${people} people in ${town.plan.buildings.length} buildings`);
});

test('town: no trees on its streets or in its houses', () => {
  const town = terrain.towns[0];
  const [mx, mz] = polyCentroid(town.plan.market);
  const x0 = Math.floor((mx - 128) / 4) * 4, z0 = Math.floor((mz - 128) / 4) * 4;
  const f = floraPlacement(terrain, { seed: terrain.seed, setting: classic.id, x0, z0, size: 256, spacing: 4 });
  for (let i = 0; i < f.length; i += FLORA_STRIDE) assert.ok(terrain.townGround(f[i], f[i + 2]) <= TownGround.Yard, `a plant at ${f[i].toFixed(0)}, ${f[i + 2].toFixed(0)} on ${terrain.townGround(f[i], f[i + 2])}`);
});

test('town: the VGM promises a cellar under one of its houses, with a household who can hint at it', async () => {
  const { sketchCellar } = await import('../src/world/dungeon/cellar');
  const { houseOf } = await import('../src/vgm/dungeons');
  const d = log.find((x) => x.kind === 'dungeon');
  assert.ok(d && d.kind === 'dungeon', 'a dungeon decision');
  const house = houseOf(d, terrain.towns);
  assert.ok(house && house.household > 0, 'under a lived-in house');
  const s = sketchCellar(d, house, classic.dungeons.cellar);
  assert.ok(s.hints.length > 0);
  assert.equal(s.knownBy.building, house.id);
});

test('town: one walks up the steps and onto the temple porch, and not through its columns', () => {
  const town = terrain.towns[0];
  const at = (b: (typeof town.plan.buildings)[number], u: number, v: number): [number, number] =>
    [b.cx + u * Math.cos(b.angle) + v * b.vx, b.cz + u * Math.sin(b.angle) + v * b.vz];
  const temple = town.plan.buildings.find((b) => b.kind === 'temple');
  if (temple) {
    const [x, z] = at(temple, 0, -temple.hv - 1.2);
    assert.ok(Math.abs(town.stand(x, z)! - (temple.floorY + 0.25)) < 1e-6, 'on the porch floor');
    const w = Math.min(temple.hu - 0.4, 3.6);
    const [cx, cz] = at(temple, -w + 0.3, -temple.hv - 2.2 + 0.35);
    assert.ok(town.solid(cx, cz, 0.3), 'a column is in the way');
  }
  // Wherever steps lead to a door, each is a step up from the last (the walker climbs 0.45 m).
  for (const b of town.plan.buildings) {
    let prev = terrain.height(...at(b, 0, -b.hv - 4));
    for (let v = -b.hv - 4; v < -b.hv - 0.1; v += 0.1) {
      const [x, z] = at(b, 0, v);
      const y = Math.max(terrain.height(x, z), town.stand(x, z) ?? -Infinity);
      assert.ok(y - prev < 0.45, `${b.kind} ${b.id}: a rise of ${(y - prev).toFixed(2)} m at ${v.toFixed(1)}`);
      prev = y;
    }
  }
});
