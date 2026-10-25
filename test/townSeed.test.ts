import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions } from '../src/vgm/builder';
import { findStart } from '../src/world/start';
import { Terrain } from '../src/world/terrain';

// The land is built once (its water takes most of the time); the decisions on it twice.
test('town: the start decisions are the same every time for a seed', () => {
  const t = new Terrain(parseSeed('masterworld'), classic);
  const home = findStart(t.skeleton, classic);
  assert.deepEqual(firstDecisions(t, home), firstDecisions(t, home));
});
