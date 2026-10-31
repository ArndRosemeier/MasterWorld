import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readyMesh, townMeshBuffers, townMeshes } from '../src/world/townMesh';
import { marketStart } from '../src/world/town';
import { startWorld } from './frontierLand';

const { terrain } = startWorld();

test('town: its buildings are meshed per cell and their walls stop the walker', () => {
  const town = terrain.towns[0];
  const t0 = performance.now();
  const cells = townMeshes(town);
  const ms = performance.now() - t0;
  assert.ok(ms < 2500, `meshed in ${ms.toFixed(0)} ms`);
  let tris = 0;
  for (const c of cells) for (const m of [c.near, c.far]) {
    const nv = m.position.length / 3;
    assert.equal(m.mat.length, nv);
    assert.ok(m.index.every((i) => i < nv), 'indices in range');
    tris += m.index.length / 3;
  }
  assert.ok(cells.length > 1 && tris > 10000, `${cells.length} cells, ${tris} triangles`);
  const b = town.plan.buildings[0];
  assert.ok(town.solid(b.cx, b.cz, 0.3), 'inside a house');
  const s = marketStart(town.plan);
  assert.ok(!town.solid(s.x, s.z, 0.3), 'the market start is open');
});

test('town: its fixtures out of doors are drawn (stalls, the well, benches ...) and the hero walks round them, not the market start', () => {
  const town = terrain.towns[0], h = (x: number, z: number) => terrain.height(x, z);
  const count = (cells: ReturnType<typeof townMeshes>) => cells.reduce((s, c) => s + c.near.index.length, 0);
  assert.ok(count(townMeshes(town, new Map(), h)) > count(townMeshes(town)), 'more drawn with the fixtures');
  const well = town.plan.fixtures.find((f) => f.kind === 'well')!;
  assert.ok(town.fixtureAt(well.x, well.z, 0.3) && !town.solid(well.x, well.z, 0.3), 'the well stops the hero only');
  const s = marketStart(town.plan);
  assert.ok(!town.fixtureAt(s.x, s.z, 0.3), 'the market start is free');
});

test('town: a cell made ready in the worker has its floats and sphere, and hands them over with its buffers', () => {
  const [c] = townMeshes(terrain.towns[0]);
  const r = readyMesh(c.near);
  assert.equal(r.tintF.length, c.near.tint.length);
  assert.ok(Math.abs(r.tintF[0] - c.near.tint[0] / 255) < 1e-6 && r.matF[0] === c.near.mat[0]);
  const [x, y, z, rad] = r.sphere, p = c.near.position;
  for (let i = 0; i < p.length; i += 3) assert.ok(Math.hypot(p[i] - x, p[i + 1] - y, p[i + 2] - z) <= rad + 1e-4, 'every point in its sphere');
  assert.equal(townMeshBuffers([{ ...c, near: r, far: readyMesh(c.far) }]).length, 16);
});
