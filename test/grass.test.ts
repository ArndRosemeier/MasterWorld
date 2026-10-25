import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { classic } from '../src/setting/classic/index';
import { grassMask } from '../src/world/grass';
import { findStart } from '../src/world/start';
import type { HydroOptions } from '../src/world/hydro';

const seed = parseSeed('masterworld');
const SMALL: HydroOptions = { cell: 2000, core: 96, margin: 32, minArea: 120 };
const terrain = new Terrain(seed, classic, SMALL);
const home = findStart(terrain.skeleton, classic);
const job = (x0: number, z0: number, size: number, res: number) => ({ seed, setting: classic.id, x0, z0, size, res });

test('grass: the start has grass on the ground, patchy, within the biome\'s height', () => {
  const x0 = Math.round(home.x) - 32, z0 = Math.round(home.z) - 32;
  const m = grassMask(terrain, job(x0, z0, 64, 64));
  let grown = 0, bare = 0;
  for (let p = 0; p < 64 * 64; p++) {
    const i = p % 64, j = Math.floor(p / 64);
    assert.ok(Math.abs(m[p * 4] - terrain.height(x0 + i + 0.5, z0 + j + 0.5)) < 1e-3, 'ground height');
    const dens = m[p * 4 + 1];
    assert.ok(dens >= 0 && dens <= 1);
    if (dens > 0.05) { grown++; assert.ok(m[p * 4 + 2] > 0.05 && m[p * 4 + 2] < 1.5, `blade height ${m[p * 4 + 2]}`); } else bare++;
  }
  assert.ok(grown > 64 * 64 * 0.3, `${grown} grown`);
  assert.ok(bare > 0, 'some bare ground');
});

test('grass: none in the sea, masks agree where they overlap', () => {
  const sea = grassMask(terrain, job(-32000, 29000, 32, 16));
  for (let p = 0; p < 16 * 16; p++) if (sea[p * 4] < 1) assert.equal(sea[p * 4 + 1], 0);
  const a = grassMask(terrain, job(-32000, 32000, 32, 32)), b = grassMask(terrain, job(-31984, 32016, 16, 16));
  for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
    const pa = ((j + 16) * 32 + i + 16) * 4, pb = (j * 16 + i) * 4;
    for (let c = 0; c < 4; c++) assert.ok(Math.abs(a[pa + c] - b[pb + c]) < 1e-4);
  }
});
