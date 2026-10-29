import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { classic } from '../src/setting/classic/index';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement } from '../src/world/flora';
import { Trunks } from '../src/world/trunks';
import { Walker, type WalkWorld } from '../src/game/walker';
import { HORSE } from '../src/game/horse';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const terrain = new Terrain(seed, classic, SMALL);
// Broadleaf forest in open country (the downs round the old start have few trees).
const plants = floraPlacement(terrain, { seed, setting: classic.id, x0: -32080, z0: 34720, size: 128, spacing: NEAR_SPACING });
const all = Array.from({ length: plants.length / FLORA_STRIDE }, (_, k) => plants.subarray(k * FLORA_STRIDE, (k + 1) * FLORA_STRIDE));
const trees = all.filter((p) => FLORA_KINDS[p[5]].trunk > 0);
const shrubs = all.filter((p) => FLORA_KINDS[p[5]].trunk === 0);

test('trunks: every drawn tree has a trunk where it stands; shrubs and open ground are passable', () => {
  const t = new Trunks(terrain);
  assert.ok(trees.length > 10, `${trees.length} trees`);
  for (const p of trees) assert.ok(t.blocks(p[0], p[2], 0.05), `a tree at ${p[0]},${p[2]}`);
  const nearTree = (x: number, z: number, d: number) => trees.some((p) => Math.hypot(p[0] - x, p[2] - z) < d);
  for (const p of shrubs) if (!nearTree(p[0], p[2], 1.5)) assert.ok(!t.blocks(p[0], p[2], 0.3), 'a shrub blocks');
  let open = 0;
  for (let k = 0; k < 200; k++) {
    const x = -32080 + (k % 20) * 6.3 + 1, z = 34720 + Math.floor(k / 20) * 12.1 + 1;
    if (nearTree(x, z, 1.5)) continue;
    open++;
    assert.ok(!t.blocks(x, z, 0.32), `blocked in the open at ${x},${z}`);
  }
  assert.ok(open > 50);
});

test('trunks: the hero and a horse go round a tree, not through it; one placed in a trunk walks out', () => {
  const t = new Trunks(terrain);
  const p = trees[0];
  const world: WalkWorld = {
    height: (x, z) => terrain.height(x, z),
    rockSurface: () => null,
    waterLevel: () => null,
    wall: (x, z, r) => t.blocks(x, z, r),
  };
  for (const spec of [undefined, HORSE]) {
    const w = new Walker(world, spec);
    // Start 4 m south of the trunk and run north at it.
    w.place(p[0], p[2] + 4);
    let closest = Infinity;
    for (let s = 0; s < 120; s++) {
      w.step({ forward: 1, strafe: 0, heading: 0, walk: true, up: false, down: false }, 1 / 60);
      closest = Math.min(closest, Math.hypot(w.pos.x - p[0], w.pos.z - p[2]));
    }
    assert.ok(closest > FLORA_KINDS[p[5]].trunk * p[3] + w.spec.radius - 0.05, `got within ${closest.toFixed(2)} m of the trunk`);
  }
  const w = new Walker(world);
  w.place(p[0], p[2]);
  for (let s = 0; s < 60; s++) w.step({ forward: 1, strafe: 0, heading: 0, walk: false, up: false, down: false }, 1 / 60);
  assert.ok(Math.hypot(w.pos.x - p[0], w.pos.z - p[2]) > 2, 'stuck in the trunk');
});

test('trunks: a new cell costs little', () => {
  const t = new Trunks(terrain);
  const t0 = performance.now();
  for (let k = 0; k < 20; k++) t.blocks(-30000 + k * 32, 30000, 0.3);
  const each = (performance.now() - t0) / 20;
  assert.ok(each < 5, `${each.toFixed(2)} ms a cell`);
});

test('trunks: cells fetched ahead agree with cells placed on the spot', async () => {
  const asked: Promise<Float32Array>[] = [];
  const t = new Trunks(terrain, (x0, z0, size, spacing) => {
    const p = Promise.resolve(floraPlacement(terrain, { seed, setting: classic.id, x0, z0, size, spacing }));
    asked.push(p);
    return p;
  });
  t.around(-31950, 32050);
  t.around(-31950, 32050);
  assert.equal(asked.length, 25, 'each cell asked once');
  await Promise.all(asked);
  await new Promise((r) => setTimeout(r, 0));
  for (const p of trees) assert.ok(t.blocks(p[0], p[2], 0.05));
});
