import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';

// The land is built once (its water takes most of the time); the decisions on it twice.
test('town: the start decisions are the same every time for a seed', () => {
  const t = new Terrain(parseSeed('masterworld'), classic);
  const home = startPlace(t);
  assert.deepEqual(firstDecisions(t, home), firstDecisions(t, home));
});
