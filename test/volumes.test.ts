import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { classic } from '../src/setting/classic/index';
import { Terrain } from '../src/world/terrain';
import { ArchField, archMesh } from '../src/world/volumes';

// The start's decisions without the town planned (nothing here needs it, and planning it costs time).
const terrain = new Terrain(parseSeed('masterworld'), classic);
terrain.settle(firstDecisions(terrain, startPlace(terrain)));

test('volumes: an arch stands near the start, rock at its feet and air under its crown', () => {
  const [f] = terrain.volumes;
  assert.ok(f, 'an arch near the start');
  const { a, b } = f.site;
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const ha = terrain.height(a[0], a[1]), hm = terrain.height(mid[0], mid[1]);
  assert.ok(f.at(a[0], ha + 2, a[1]) < 0, 'rock at a foot');
  assert.ok(terrain.rockAt(a[0], a[1], ha), 'nothing grows at a foot');
  assert.ok(f.at(mid[0], hm + 4, mid[1]) > 1, 'air under the crown');
  assert.ok(f.at(mid[0], hm + f.site.rise + 2, mid[1]) < 2, 'rock up at the crown');
  assert.equal(new ArchField(terrain, f.site).at(mid[0], hm + 4, mid[1]), f.at(mid[0], hm + 4, mid[1]), 'deterministic');
});

test('volumes: the arch meshes into rock standing above the ground, with the terrain material\'s attributes', () => {
  const m = archMesh(terrain, terrain.volumes[0].site)!;
  const verts = m.position.length / 3;
  assert.ok(m.index.length / 3 > 2000, `${m.index.length / 3} triangles`);
  assert.equal(m.normal.length, verts * 3);
  assert.equal(m.color.length, verts * 3);
  assert.equal(m.surface.length, verts * 4);
  let high = 0;
  for (let t = 0; t < m.index.length; t++) {
    const v = m.index[t];
    if (m.position[v * 3 + 1] > terrain.height(m.position[v * 3], m.position[v * 3 + 2]) + 5) high++;
  }
  assert.ok(high > m.index.length * 0.3, 'most of it stands well above the ground');
});
