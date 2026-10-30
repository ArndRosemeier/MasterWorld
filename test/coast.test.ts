import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { Terrain } from '../src/world/terrain';
import { startPlace } from '../src/vgm/builder';
import { nearestCoast } from '../src/world/coast';

test('coast: a beach, a sea cliff and the bed off the beach near the start, each facing the sea (S1)', () => {
  const t = new Terrain(parseSeed('masterworld'), classic), s = startPlace(t);
  const beach = nearestCoast(t, 'beach', s.x, s.z), cliff = nearestCoast(t, 'cliff', s.x, s.z), under = nearestCoast(t, 'under', s.x, s.z);
  assert.ok(beach && cliff && under);
  // The beach: dry sand just above the water, the sea 30 m out from it.
  assert.ok(beach.y > 0 && beach.y < 3, `beach at ${beach.y} m`);
  assert.ok(t.height(beach.x + beach.seaX * 30, beach.z + beach.seaZ * 30) < 0, 'sea in front of the beach');
  // The cliff: high over the sea, which lies below it within 120 m.
  assert.ok(cliff.y > 20, `cliff top at ${cliff.y} m`);
  let sea = false;
  for (let m = 10; m <= 120 && !sea; m += 10) sea = t.height(cliff.x + cliff.seaX * m, cliff.z + cliff.seaZ * m) < 0;
  assert.ok(sea, 'sea below the cliff');
  // Under the sea: on the bed at least 5 m down, within a few hundred metres of the beach.
  assert.ok(under.y <= -5 && t.waterDepth(under.x, under.z) >= 5);
  assert.ok(Math.hypot(under.x - beach.x, under.z - beach.z) < 600);
});
