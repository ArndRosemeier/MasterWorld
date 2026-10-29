import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';
import { findStart } from '../src/world/start';
import { WATER_REACH, bankSpots, byFreshWater, freshWaterEdge } from '../src/world/freshWater';
import { startMoved } from '../src/app/saveGame';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
// Small drainage tiles (as the frontier and roads tests): the same rivers round the start, faster.
const terrain = new Terrain(seed, classic, SMALL);
const home = startPlace(terrain);
const first = firstDecisions(terrain, home);
const town = first.find((d) => d.kind === 'town')!;

test('fresh water: the start town stands by a river (D50), on dry ground, not far from the start place', () => {
  const was = findStart(terrain.skeleton, classic);
  assert.ok(!byFreshWater(terrain, was.x, was.z, town.radius, false), 'no river by the setting start place itself (the town had to move)');
  assert.ok(byFreshWater(terrain, town.x, town.z, town.radius, false), 'the town has a river');
  const edge = freshWaterEdge(terrain, town.x, town.z, 1000, false);
  assert.ok(edge > town.radius && edge <= town.radius + WATER_REACH, `river ${edge.toFixed(0)} m from the middle`);
  assert.equal(terrain.waterDepth(town.x, town.z), 0);
  assert.ok(Math.hypot(home.x - was.x, home.z - was.z) < 6000, 'moved to the nearest river');
});

test('fresh water: the edge distance is negative in a river, Infinity where none is in reach; the sea does not count', () => {
  const tile = terrain.hydro.tileAt(town.x, town.z);
  // A river whose middle lies in the tile's own core (its margin's rivers are the next tile's to answer for).
  const mid = (v: (typeof tile.rivers)[number]) => v.level.length >> 1;
  const r = tile.rivers.find((v) => v.half[0] > 3 && v.level[0] > 5 && terrain.hydro.tileAt(v.xz[mid(v) * 2], v.xz[mid(v) * 2 + 1]) === tile)!;
  const k = mid(r);
  assert.ok(freshWaterEdge(terrain, r.xz[k * 2], r.xz[k * 2 + 1], 50) < 0, 'in the river');
  // Out at sea, far from any river mouth.
  assert.ok(terrain.height(-36000, 26000) < 0, 'at sea');
  assert.equal(freshWaterEdge(terrain, -36000, 26000, 100), Infinity);
});

test('fresh water: bank spots lie beside the river, dry, with the water in reach', () => {
  const spots = bankSpots(terrain, town.x, town.z, 800, 50);
  assert.ok(spots.length > 10, `${spots.length} spots`);
  let dry = 0;
  for (const s of spots) {
    const e = freshWaterEdge(terrain, s.x, s.z, 400);
    assert.ok(e <= s.edge + 1, `spot ${s.edge} m back, river ${e.toFixed(0)} m`);
    if (terrain.waterDepth(s.x, s.z) === 0) dry++;
  }
  assert.ok(dry > spots.length / 2, `${dry} of ${spots.length} dry`);
});

test('fresh water: a save whose start town stood elsewhere is from a world that is gone', () => {
  const old = [{ ...town, x: town.x - 2800 }];
  assert.equal(startMoved(old, first), true);
  assert.equal(startMoved([town], first), false);
  assert.equal(startMoved([], first), false);
});
