import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { SMALL } from './small';
import { islandFor, islandPlace, isleAt } from '../src/vgm/islands';
import { seaWays, voyageTopic } from '../src/vgm/voyages';
import type { Decision } from '../src/world/decisions';

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

test('an island is promised from a harbour, told by its harbour master, sailed to, given a place, and the log replays it', () => {
  const seed = parseSeed('masterworld'), world = openWorld(seed, classic), t = world.terrain;
  const home = t.towns[0].decision, def = classic.voyage!, regions = classic.regions!;
  const water = (x: number, z: number) => t.waterDepth(x, z);
  const ctx = { seed, log: world.log, terrain: t, regions, home, hero: home, hours: 9 };
  const towns = () => t.towns.map((w) => w.decision);
  const r = islandFor(def, ctx, home, towns(), water);
  assert.ok(r, 'an island in reach gets a village');
  const isle = isleAt(t, classic.world.islands!, r.site!.x, r.site!.z);
  assert.ok(isle, 'the village stands on an island');
  const log: Decision[] = [...world.log, r];
  t.settleMore([r]);
  const village = t.town(r.id);
  assert.ok(village?.decision.isle && village.plan.harbour, 'built, with its quay');
  assert.equal(islandFor(def, { ...ctx, log }, home, towns(), water), null, 'one island village in reach at a time');
  // The harbour master offers passage, telling what sailors say of it.
  const way = seaWays(def, seed, log, home, towns(), water).find((w) => w.to === r.id);
  assert.ok(way, 'passage to the island');
  assert.match(voyageTopic(def, way), /island beyond the fog, the island [\d.]+ km/);
  // A place out on the island for its people to know of.
  const place = islandPlace({ seed, terrain: t, log, home, dungeons: classic.dungeons, towns: t.towns });
  assert.ok(place && place.town === r.id, 'a place on the island');
  assert.ok(isleAt(t, classic.world.islands!, place.site!.x, place.site!.z) === isle || Math.hypot(place.site!.x - isle!.x, place.site!.z - isle!.z) < isle!.r, 'on the island');
  assert.ok(t.height(place.site!.x, place.site!.z) > 0, 'on dry land');
  // Replayed from its log, the world has the same island village.
  const again = openWorld(seed, classic).terrain;
  again.settleMore([r]);
  assert.deepEqual(again.town(r.id)?.decision, village.decision);
});
