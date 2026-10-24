import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { Skeleton } from '../src/world/skeleton';
import { HydroTile, type HydroOptions } from '../src/world/hydro';
import { classic } from '../src/setting/classic/index';
import { DRY, SEA_LEVEL, waterMask } from '../src/world/water';

const seed = parseSeed('masterworld');
const SMALL: HydroOptions = { cell: 2000, core: 96, margin: 32, minArea: 120 };
const tile = new HydroTile(new Skeleton(seed, classic.world), -1, 0, SMALL);
const terrain = new Terrain(seed, classic, SMALL);

test('hydro: rivers exist and never flow uphill', () => {
  assert.ok(tile.rivers.length > 10, `${tile.rivers.length} rivers`);
  for (const r of tile.rivers) {
    for (let k = 1; k < r.level.length; k++) assert.ok(r.level[k] <= r.level[k - 1] + 1e-6);
    assert.ok(r.level[r.level.length - 1] >= SEA_LEVEL - 1e-6);
    for (let k = 0; k < r.half.length; k++) assert.ok(r.half[k] > 0);
  }
});

test('hydro: lakes lie flat and are a small share of the land', () => {
  const { n, lake, elev } = tile;
  let lakes = 0, land = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const c = j * n + i;
    if (elev[c] > 0) land++;
    if (Number.isNaN(lake[c])) continue;
    lakes++;
    for (const nb of [c + 1, c + n]) if (!Number.isNaN(lake[nb])) assert.equal(lake[nb], lake[c]);
    assert.ok(lake[c] > elev[c]);
  }
  assert.ok(lakes / land < 0.1, `${lakes} of ${land}`);
});

test('hydro: the same seed gives the same rivers', () => {
  const again = new HydroTile(new Skeleton(seed, classic.world), -1, 0, SMALL);
  assert.equal(again.rivers.length, tile.rivers.length);
  assert.deepEqual(again.rivers[3].xz, tile.rivers[3].xz);
});

test('terrain: rivers lie in their beds, banks stay dry', () => {
  const t = terrain;
  const tl = t.hydro.tileAt(-32000, 32000);
  let checked = 0;
  for (const r of tl.rivers.slice(0, 40)) {
    const k = Math.floor(r.level.length / 2);
    const x = r.xz[k * 2], z = r.xz[k * 2 + 1];
    const w = t.hydro.query(x, z);
    if (!w.river || w.dist > 1) continue; // another river's valley wins here
    assert.ok(t.height(x, z) < w.level - 0.5, 'bed below the water');
    // Sideways, just past the bank.
    const nx = -w.fz, nz = w.fx, d = w.half + 25;
    const side = t.hydro.query(x + nx * d, z + nz * d);
    if (side.river && Math.abs(side.level - w.level) < 0.01) assert.ok(t.height(x + nx * d, z + nz * d) > w.level, 'bank above the water');
    checked++;
  }
  assert.ok(checked > 10, `${checked} rivers checked`);
});

test('water mask: sea at level 0, rivers at their level with flow, land dry', () => {
  const t = terrain;
  // Over the coast north of the start: sea, shore and land in one small mask.
  const m = waterMask(t, { seed, setting: classic.id, x0: -32500, z0: 30000, size: 1024, res: 32 });
  let sea = 0, dry = 0;
  for (let p = 0; p < 32 * 32; p++) {
    const level = m[p * 4], depth = m[p * 4 + 1];
    if (depth > 0 && Math.abs(level) < 1e-6) sea++;
    if (depth <= DRY / 3) dry++;
  }
  assert.ok(sea > 20 && dry > 20, `sea ${sea}, dry ${dry}`);
});
