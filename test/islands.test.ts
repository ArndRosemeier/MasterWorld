import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { SMALL } from './small';

const { terrain } = openWorld(parseSeed('masterworld'), classic);
const def = classic.world.islands!;

test('islands: out at sea within a voyage of the start, each land ringed by deep water, the same on every run', () => {
  const sk = terrain.skeleton, home = terrain.towns[0].decision;
  const isles = [];
  for (let i = Math.floor((home.x - 16000) / def.cell); i <= Math.floor((home.x + 16000) / def.cell); i++) {
    for (let j = Math.floor((home.z - 16000) / def.cell); j <= Math.floor((home.z + 16000) / def.cell); j++) {
      const isle = sk.isleOf(i, j, def);
      if (isle) isles.push(isle);
    }
  }
  assert.ok(isles.length >= 3, `${isles.length} islands within 16 km`);
  for (const isle of isles.slice(0, 4)) {
    assert.ok(terrain.height(isle.x, isle.z) > 1, 'its middle stands above the water');
    // Round it, past its rim, the sea is deep: an island, not a cape of the mainland.
    for (let q = 0; q < 8; q++) {
      const a = (q * Math.PI) / 4, r = isle.r * 1.5;
      assert.ok(terrain.height(isle.x + Math.cos(a) * r, isle.z + Math.sin(a) * r) < -20, 'deep water round it');
    }
    // Some of it is land: 0.3 to 3 km².
    let land = 0;
    for (let a = -isle.r; a <= isle.r; a += 100) for (let b = -isle.r; b <= isle.r; b += 100) if (terrain.height(isle.x + a, isle.z + b) > 0) land++;
    assert.ok(land * 0.01 > 0.3 && land * 0.01 < 3, `${(land * 0.01).toFixed(2)} km² of land`);
  }
  const again = new Terrain(parseSeed('masterworld'), classic, SMALL).skeleton.isleOf(Math.floor(isles[0].x / def.cell), Math.floor(isles[0].z / def.cell), def);
  assert.deepEqual(again, isles[0]);
});
