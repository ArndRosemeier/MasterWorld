import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { classic } from '../src/setting/classic/index';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement } from '../src/world/flora';
import type { Decision } from '../src/world/decisions';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const terrain = new Terrain(seed, classic, SMALL);
const job = (x0: number, z0: number, size: number, spacing = NEAR_SPACING) => ({ seed, setting: classic.id, x0, z0, size, spacing });

test('flora: plants stand on dry, gentle land, with known kinds, deterministically', () => {
  const d = floraPlacement(terrain, job(-32000, 32000, 128));
  assert.ok(d.length / FLORA_STRIDE > 20, `${d.length / FLORA_STRIDE} plants`);
  for (let r = 0; r < d.length; r += FLORA_STRIDE) {
    const [x, y, z, scale, , kind] = d.subarray(r, r + FLORA_STRIDE);
    assert.ok(Number.isInteger(kind) && kind >= 0 && kind < FLORA_KINDS.length);
    assert.ok(scale > 0.5 && scale < 2);
    assert.ok(Math.abs(y + 0.15 * scale - terrain.height(x, z)) < 1e-3, 'on the ground');
    assert.ok(y > 1, 'not on the beach');
  }
  assert.deepEqual(floraPlacement(terrain, job(-32000, 32000, 128)), d);
});

test('flora: squares agree where they overlap (positions depend on the world only)', () => {
  const big = floraPlacement(terrain, job(-32000, 32000, 128));
  const small = floraPlacement(terrain, job(-31936, 32064, 64));
  const key = (d: Float32Array, r: number) => `${d[r].toFixed(2)},${d[r + 2].toFixed(2)},${d[r + 5]}`;
  const inBig = new Set<string>();
  for (let r = 0; r < big.length; r += FLORA_STRIDE) inBig.add(key(big, r));
  for (let r = 0; r < small.length; r += FLORA_STRIDE) assert.ok(inBig.has(key(small, r)), 'a plant of the small square is missing in the big one');
});

test('flora: far stand-ins are fewer and bigger', () => {
  const near = floraPlacement(terrain, job(-32256, 32000, 256));
  const far = floraPlacement(terrain, job(-32256, 32000, 256, 16));
  const trees = (d: Float32Array) => { let n = 0; for (let r = 0; r < d.length; r += FLORA_STRIDE) if (FLORA_KINDS[d[r + 5]].species !== 'shrub') n++; return n; };
  assert.ok(trees(far) > 0 && trees(far) < trees(near), `${trees(far)} far, ${trees(near)} near`);
  for (let r = 0; r < far.length; r += FLORA_STRIDE) assert.notEqual(FLORA_KINDS[far[r + 5]].species, 'shrub');
});

test('flora: a place out on the land stands in a clearing; the trees beyond it are as they were', () => {
  const land = new Terrain(seed, classic, SMALL);
  const before = floraPlacement(land, job(-32000, 32000, 128));
  const site = { x: -31936, z: 32064, yaw: 0.7 };
  land.settleMore([{ kind: 'dungeon', id: 'tower-1', template: 'tower', seed: 1, town: 'town-0', building: -1, at: 0, site } as unknown as Decision]);
  const c = land.clearings.get('tower-1')!;
  const after = floraPlacement(land, job(-32000, 32000, 128));
  const trees = (d: Float32Array, keep: (x: number, z: number) => boolean) => {
    const out: string[] = [];
    for (let r = 0; r < d.length; r += FLORA_STRIDE) if (FLORA_KINDS[d[r + 5]].species !== 'shrub' && keep(d[r], d[r + 2])) out.push(`${d[r].toFixed(2)},${d[r + 2].toFixed(2)}`);
    return out;
  };
  const from = (x: number, z: number) => Math.hypot(x - c.x, z - c.z);
  assert.ok(trees(before, (x, z) => from(x, z) < c.r).length > 5, 'trees stood there before');
  assert.deepEqual(trees(after, (x, z) => from(x, z) < c.r), []);
  assert.deepEqual(trees(after, (x, z) => from(x, z) > c.r + 8), trees(before, (x, z) => from(x, z) > c.r + 8));
});
