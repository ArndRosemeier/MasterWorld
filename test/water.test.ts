import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { Skeleton } from '../src/world/skeleton';
import { HydroTile, riverDepth, type HydroOptions } from '../src/world/hydro';
import { classic } from '../src/setting/classic/index';
import { DRY, SEA_LEVEL, waterMask } from '../src/world/water';

const seed = parseSeed('masterworld');
const SMALL: HydroOptions = { cell: 2000, core: 96, margin: 32, minArea: 120 };
const tile = new HydroTile(new Skeleton(seed, classic.world), -1, 0, SMALL);
// Rivers alone: these tests look at rivers all over the tile, and a brook tile for each would take seconds
// (brooks have their own tests, test/brooks.test.ts).
const terrain = new Terrain(seed, classic, SMALL, null);

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

test('hydro: waterfalls are rare, spaced out, and step the level down', () => {
  let falls = 0, segs = 0;
  for (const r of tile.rivers) {
    let last = -Infinity;
    segs += r.fall.length;
    for (let k = 0; k < r.fall.length; k++) {
      if (!(r.fall[k] > 0)) continue;
      falls++;
      assert.ok(k - last >= 1500 / 80, 'falls too close together');
      last = k;
      assert.ok(Math.abs(r.level[k] - r.level[k + 1] - r.fall[k]) < 1e-3, 'fall height is the step in level');
    }
  }
  assert.ok(falls > 0, 'no waterfalls');
  assert.ok(falls / segs < 0.02, `${falls} falls in ${segs} segments`);
});

test('terrain: a waterfall drops over a cliff into a pool', () => {
  const t = terrain;
  const tl = t.hydro.tileAt(-32000, 32000);
  let checked = 0;
  for (const r of tl.rivers) for (let k = 0; k < r.fall.length && checked < 5; k++) {
    if (!(r.fall[k] > 0)) continue;
    const ax = r.xz[k * 2], az = r.xz[k * 2 + 1], bx = r.xz[k * 2 + 2], bz = r.xz[k * 2 + 3];
    const l = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / l, uz = (bz - az) / l;
    const at = (s: number) => [ax + ux * (l / 2 + s), az + uz * (l / 2 + s)] as const;
    const w = t.hydro.query(...at(-8));
    if (!w.river || w.fallDrop !== r.fall[k]) continue; // another river wins here
    const top = t.hydro.query(...at(-8)).level, foot = t.hydro.query(...at(8)).level;
    assert.ok(Math.abs(top - foot - r.fall[k]) < 0.01, 'the level steps at the lip');
    assert.ok(t.height(...at(8)) < foot - riverDepth(w.half), 'a pool below the fall');
    checked++;
  }
  assert.ok(checked > 0, 'no waterfall checked');
});

test('water mask: the sea surface reaches the shoreline on a gentle beach (no ground showing under its edge)', () => {
  const t = terrain;
  // A beach south-west of the start, at the near mask's 2 m pixels.
  const x0 = -33512, z0 = 29856, size = 64, res = 32, step = size / res;
  const m = waterMask(t, { seed, setting: classic.id, x0, z0, size, res });
  // The mask's depth, bilinear between pixel centres (as the shader samples it).
  const depthAt = (x: number, z: number): number => {
    const fx = (x - x0) / step - 0.5, fz = (z - z0) / step - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const d = (a: number, b: number) => m[((j + b) * res + i + a) * 4 + 1];
    return (d(0, 0) * (1 - u) + d(1, 0) * u) * (1 - v) + (d(0, 1) * (1 - u) + d(1, 1) * u) * v;
  };
  let checked = 0;
  for (let z = z0 + 8; z < z0 + size - 8; z += 3) for (let x = x0 + 8; x < x0 + size - 9; x += 0.25) {
    const a = t.height(x, z), b = t.height(x + 0.25, z);
    if ((a > 0) === (b > 0)) continue;
    // Just on the water's side of the line, the surface is drawn (the shader cuts it below -0.2).
    const wx = a <= 0 ? x : x + 0.25;
    assert.ok(depthAt(wx, z) > -0.2, `water cut short at ${wx}, ${z}: mask depth ${depthAt(wx, z)}`);
    checked++;
  }
  assert.ok(checked > 3, `${checked} shore crossings`);
});
