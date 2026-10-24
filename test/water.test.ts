import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { classic } from '../src/setting/classic/index';
import { MASK_RES, SEA_LEVEL, decodeDepth, depthMask, encodeDepth } from '../src/world/water';

test('water: depth encoding round-trips in half metres and clamps', () => {
  for (const d of [-16, -3.5, 0, 0.5, 12, 111.5]) assert.equal(decodeDepth(encodeDepth(d)), d);
  assert.equal(decodeDepth(encodeDepth(-500)), -16);
  assert.equal(decodeDepth(encodeDepth(5000)), 111.5);
});

test('water: the mask matches the terrain below sea level', () => {
  const t = new Terrain(parseSeed('masterworld'), classic);
  const job = { seed: t.seed, setting: classic.id, x0: -40000, z0: 30000, size: 8192, res: 32 };
  const m = depthMask(t, job);
  assert.equal(m.length, 32 * 32 * 4);
  const step = job.size / job.res;
  for (const [i, j] of [[0, 0], [31, 0], [10, 20], [31, 31]]) {
    const h = t.height(job.x0 + (i + 0.5) * step, job.z0 + (j + 0.5) * step);
    const want = Math.max(-16, Math.min(111.5, SEA_LEVEL - h));
    assert.ok(Math.abs(decodeDepth(m[(j * 32 + i) * 4]) - want) <= 0.25 + 1e-9);
  }
  assert.ok(MASK_RES >= 128);
});
