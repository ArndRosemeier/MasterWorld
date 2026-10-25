import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';

// Its own file: two worlds take most of the 5 s a file may run.
test('town: the start decisions are the same every time for a seed', () => {
  const a = openWorld(parseSeed('masterworld'), classic).log, b = openWorld(parseSeed('masterworld'), classic).log;
  assert.deepEqual(a, b);
});
