import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { NATURAL_NAMES } from '@futuremagic/texgen';
import { classic } from '../src/setting/classic/index';
import { landscapeKinds } from '../src/setting/classic/landforms';
import { Terrain } from '../src/world/terrain';
import { buildChunk } from '../src/world/chunkMesh';
import { SMALL } from './small';

test('kind grounds (P3): every kind of country lays a texgen layer of its own (heather, clay, limestone, chalk turf, gravel)', () => {
  for (const k of landscapeKinds) {
    if (k.id === 'open') continue;
    assert.ok(k.wears?.layer && NATURAL_NAMES.includes(k.wears.layer), `${k.id}: layer ${k.wears?.layer}`);
  }
});

test('kind grounds (P3): a chunk on a moor wears its heather, and where kinds meet a layer fades out before its number changes', () => {
  const t = new Terrain(parseSeed('masterworld'), classic, SMALL), sk = t.skeleton, heather = NATURAL_NAMES.indexOf('heather');
  // A moor's middle, and its edge (where the moor's share is about half).
  let mid: [number, number] | null = null, edge: [number, number] | null = null;
  for (let z = -60000; z < 60000 && !(mid && edge); z += 3000) for (let x = -60000; x < 60000; x += 3000) {
    const s = sk.kindShare('moor', x, z);
    if (!mid && s > 0.97 && sk.elevation(x, z) > 20) mid = [x, z];
    if (!edge && s > 0.3 && s < 0.7 && sk.elevation(x, z) > 20) edge = [x, z];
  }
  assert.ok(mid && edge, 'a moor in the world');
  const m = buildChunk(t, { x0: mid[0], z0: mid[1], size: 64, segs: 16 });
  let held = 0;
  for (let v = 0; v < 17 * 17; v++) if (m.ground[v * 4] === heather && m.ground[v * 4 + 1] > 0.5) held++;
  assert.ok(held > 17 * 17 * 0.9, `heather held at ${held} of ${17 * 17} vertices`);
  const e = buildChunk(t, { x0: edge[0] - 256, z0: edge[1] - 256, size: 512, segs: 32 }), n = 33;
  for (let j = 0; j < n; j++) for (let i = 0; i + 1 < n; i++) {
    const a = (j * n + i) * 4, b = a + 4;
    assert.ok(Number.isInteger(e.ground[a]), 'a whole layer number');
    if (e.ground[a] !== e.ground[b]) assert.ok(e.ground[a + 1] < 0.05 && e.ground[b + 1] < 0.05, `layers ${e.ground[a]} and ${e.ground[b]} meet at ${e.ground[a + 1].toFixed(2)} / ${e.ground[b + 1].toFixed(2)}`);
  }
});
