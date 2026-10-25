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
  assert.ok(town.plan.buildings.length >= 50, `${town.plan.buildings.length} buildings`);
});

test('town: no trees on its streets or in its houses', () => {
  const town = terrain.towns[0];
  const [mx, mz] = polyCentroid(town.plan.market);
  const x0 = Math.floor((mx - 128) / 4) * 4, z0 = Math.floor((mz - 128) / 4) * 4;
  const f = floraPlacement(terrain, { seed: terrain.seed, setting: classic.id, x0, z0, size: 256, spacing: 4 });
  for (let i = 0; i < f.length; i += FLORA_STRIDE) assert.ok(terrain.townGround(f[i], f[i + 2]) <= TownGround.Yard, `a plant at ${f[i].toFixed(0)}, ${f[i + 2].toFixed(0)} on ${terrain.townGround(f[i], f[i + 2])}`);
});
