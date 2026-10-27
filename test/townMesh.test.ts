import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { townMeshes } from '../src/world/townMesh';
import { marketStart } from '../src/world/town';
import { SMALL } from './small';

const { terrain } = openWorld(parseSeed('masterworld'), classic, SMALL);

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
