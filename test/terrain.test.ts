import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { buildChunk, chunkIndex, vertexCount } from '../src/world/chunkMesh';
import { selectChunks, chunkSize, CHUNK0 } from '../src/render/terrain/lod';
import { classic } from '../src/setting/classic/index';

const terrain = new Terrain(parseSeed('masterworld'), classic);

test('chunk: vertices match the terrain, indices stay in range, normals point up-ish', () => {
  const segs = 16, spec = { x0: -32000, z0: 32000, size: 256, segs };
  const m = buildChunk(terrain, spec);
  assert.equal(m.position.length, vertexCount(segs) * 3);
  const idx = chunkIndex(segs);
  assert.ok(idx.every((i) => i < vertexCount(segs)));
  const step = spec.size / segs;
  for (const v of [0, 7, 100, (segs + 1) ** 2 - 1]) {
    const x = spec.x0 + m.position[v * 3], z = spec.z0 + m.position[v * 3 + 2];
    assert.ok(Math.abs(m.position[v * 3 + 1] - terrain.height(x, z)) < 1e-3);
    assert.ok(m.normal[v * 3 + 1] > 0);
    assert.ok(Math.abs(m.position[v * 3] % step) < 1e-6 || Math.abs((m.position[v * 3] % step) - step) < 1e-6);
  }
});

test('chunk: neighbours share their edge heights exactly (no cracks at the same level)', () => {
  const a = buildChunk(terrain, { x0: 0, z0: 0, size: 128, segs: 8 });
  const b = buildChunk(terrain, { x0: 128, z0: 0, size: 128, segs: 8 });
  for (let j = 0; j <= 8; j++) assert.equal(a.position[(j * 9 + 8) * 3 + 1], b.position[(j * 9) * 3 + 1]);
});

test('lod: leaves tile the roots without overlap, fine near the camera, coarse far away', () => {
  const leaves = selectChunks(1000, -500, 2);
  const near = leaves.filter((k) => { const s = chunkSize(k.level); return 1000 >= k.x * s && 1000 < (k.x + 1) * s && -500 >= k.z * s && -500 < (k.z + 1) * s; });
  assert.equal(near.length, 1);
  assert.equal(chunkSize(near[0].level), CHUNK0);
  const area = leaves.reduce((a, k) => a + chunkSize(k.level) ** 2, 0);
  assert.equal(area, 9 * chunkSize(8) ** 2);
  assert.ok(leaves.length < 300, `${leaves.length} chunks`);
  assert.ok(selectChunks(1000, -500, 3000).length < leaves.length, 'fewer chunks from high up');
});

test('chunk mesh: surface weights sum to 1 on every vertex', () => {
  const m = buildChunk(new Terrain(7, classic), { x0: 1000, z0: -3000, size: 4096, segs: 16 });
  for (let v = 0; v < m.surface.length / 4; v++) {
    const s = m.surface[v * 4] + m.surface[v * 4 + 1] + m.surface[v * 4 + 2] + m.surface[v * 4 + 3];
    assert.ok(Math.abs(s - 1) < 1e-5, `vertex ${v}: ${s}`);
  }
});
