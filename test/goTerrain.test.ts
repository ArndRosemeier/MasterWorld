import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { settingById } from '../src/setting/index';
import { goSpots, type GoHost } from '../src/app/goPlaces';
import type { Stand } from '../src/app/places';
import { SMALL } from './small';

// The debug menu's terrain go-tos (Arnd 2026-11-02) on seed ajn1uw (volcanic country, a lake volcano and a steaming one near the start).
const setting = settingById('classic');
const terrain = new Terrain(parseSeed('ajn1uw'), setting, SMALL);
const START = { x: -23900, z: 36100 };
/** A host that reaches only the land: every go-to puts the hero down where it says. */
const stood: Stand[] = [];
const host = {
  setting, terrain, heroPos: () => START, towns: () => [], log: () => [],
  stand: async (s: Stand) => { stood.push(s); return s; },
  clear: () => true,
} as unknown as GoHost;
const spots = goSpots(host);
const go = async (label: string): Promise<{ said: string; at: Stand }> => {
  const spot = spots.find((s) => s.label === label);
  assert.ok(spot, `a go-to called ${label}`);
  stood.length = 0;
  const said = await spot.go();
  return { said, at: stood[0] };
};

test('go to terrain: a button for every kind of country, every biome, the coast and the volcanoes', () => {
  const group = spots.filter((s) => s.group === 'Go to: terrain').map((s) => s.label);
  for (const k of terrain.skeleton.kinds) assert.ok(group.includes(`Country: ${k.id[0].toUpperCase()}${k.id.slice(1)}`), k.id);
  for (const b of setting.world.biomes) assert.ok(group.includes(`Biome: ${b.name}`), b.id);
  for (const l of ['Beach', 'Under the sea', 'Volcano', 'Volcano: erupting', 'Volcano: lake', 'Volcano: steaming', 'Volcano: crater rim', 'Volcano: from afar']) assert.ok(group.includes(l), l);
});

test('go to terrain: a kind of country and a biome put the hero well inside it', async () => {
  const volcanic = await go('Country: Volcanic');
  assert.ok(terrain.skeleton.kindShare('volcanic', volcanic.at.x, volcanic.at.z) > 0.99);
  const taiga = await go('Biome: Pine forest');
  assert.equal(terrain.skeleton.sample(taiga.at.x, taiga.at.z).biome, terrain.skeleton.shape.biomes.findIndex((b) => b.id === 'taiga'));
  // The warm biomes lie hundreds of kilometres to the south of the start (northCooling): found by the wide walk.
  const jungle = await go('Biome: Jungle');
  assert.equal(terrain.skeleton.sample(jungle.at.x, jungle.at.z).biome, terrain.skeleton.shape.biomes.findIndex((b) => b.id === 'jungle'));
  assert.ok(Math.hypot(jungle.at.x - START.x, jungle.at.z - START.z) > 160_000, 'beyond the close walk');
});

test('go to terrain: a volcano of a state is stood before on the side its lava spills, facing the crater', async () => {
  const { said, at } = await go('Volcano: steaming');
  const v = terrain.volcanoes.nearestVolcano(START.x, START.z, 'steaming')!;
  assert.ok(v && said.includes(v.id));
  assert.ok(Math.abs(Math.hypot(at.x - v.x, at.z - v.z) - v.R * 0.65) < 1e-6);
  assert.ok(Math.abs(Math.atan2(at.x - v.x, at.z - v.z) - at.yaw) < 1e-6, 'looks at the crater');
  assert.equal(at.at, v);
  assert.equal(terrain.volcanoes.nearestVolcano(START.x, START.z, 'lake')!.state, 'lake');
  assert.equal(terrain.volcanoes.nearestVolcano(START.x, START.z, v.id), v, 'by id');
});
