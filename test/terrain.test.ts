import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { buildChunk, chunkIndex, vertexCount } from '../src/world/chunkMesh';
import { selectChunks, chunkSize, CHUNK0 } from '../src/render/terrain/lod';
import { classic } from '../src/setting/classic/index';
import { SMALL } from './small';

const terrain = new Terrain(parseSeed('masterworld'), classic, SMALL);

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
  const m = buildChunk(new Terrain(7, classic, SMALL), { x0: 1000, z0: -3000, size: 4096, segs: 16 });
  for (let v = 0; v < m.surface.length / 4; v++) {
    const s = m.surface[v * 4] + m.surface[v * 4 + 1] + m.surface[v * 4 + 2] + m.surface[v * 4 + 3];
    assert.ok(Math.abs(s - 1) < 1e-5, `vertex ${v}: ${s}`);
  }
});

test('shore: the ground runs smoothly through the waterline, beaches are low, some coasts are cliffs', () => {
  // Shore crossings along rows around the sea near the start.
  const step = 300, rows: number[] = [], near: number[] = [];
  let cliffs = 0;
  for (let z = 17_000; z < 47_000; z += step) for (let x = -47_000; x < -17_000; x += step) {
    const a = terrain.height(x, z);
    if ((a > 0) === (terrain.height(x + step, z) > 0)) continue;
    let lo = x, hi = x + step;
    for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if ((terrain.height(m, z) > 0) === (a > 0)) lo = m; else hi = m; }
    const sx = (lo + hi) / 2;
    // No step at the water: the slope a metre either side of the line is that of a beach.
    rows.push(Math.abs(terrain.height(sx + 1, z) - terrain.height(sx - 1, z)) / 2);
    let top = 0;
    for (let r = 10; r <= 40; r += 10) for (let q = 0; q < 8; q++) top = Math.max(top, terrain.height(sx + Math.cos(q * Math.PI / 4) * r, z + Math.sin(q * Math.PI / 4) * r));
    near.push(top);
    if (top > 8) cliffs++;
  }
  assert.ok(rows.length > 20, `${rows.length} shore points`);
  rows.sort((p, q) => p - q);
  assert.ok(rows[rows.length - 1] < 0.6, `steepest waterline ${rows[rows.length - 1]}`);
  near.sort((p, q) => p - q);
  assert.ok(near[near.length >> 1] < 2.2, `beach height 40 m from the water ${near[near.length >> 1]}`);
  const share = cliffs / near.length;
  assert.ok(share > 0.05 && share < 0.5, `cliff share ${share}`);
});

test('chunk mesh: the level runs 0..1 and is smoother than the normals on a cliff', () => {
  // A stretch of sea cliff north of the start.
  const segs = 32, m = buildChunk(terrain, { x0: -31830, z0: 30870, size: 64, segs });
  const n = segs + 1;
  let steepest = 1, level = 0, normal = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = j * n + i, l = m.level[v];
    assert.ok(l > 0 && l <= 1);
    steepest = Math.min(steepest, l);
    if (i > 0) {
      level += (l - m.level[v - 1]) ** 2;
      normal += (m.normal[v * 3 + 1] - m.normal[(v - 1) * 3 + 1]) ** 2;
    }
  }
  assert.ok(steepest < 0.6, `no cliff in the stretch (level ${steepest})`);
  assert.ok(level < 0.75 * normal, `level changes ${level} vs normals ${normal}`);
});
