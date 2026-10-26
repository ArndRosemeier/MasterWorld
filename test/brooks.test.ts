import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { Terrain } from '../src/world/terrain';
import { BROOKS, brookDepth, packRivers } from '../src/world/hydro';
import { waterMask } from '../src/world/water';

const seed = parseSeed('masterworld');
// Small river tiles (as the frontier and roads tests), brooks as in the game.
const terrain = new Terrain(seed, classic, { cell: 2000, core: 96, margin: 32, minArea: 120 });
const tile = terrain.hydro.brookTileAt(-30000, 34000)!;
const side = BROOKS.core * BROOKS.cell, x0 = tile.tx * side, z0 = tile.tz * side;
/** Brooks whose last point lies in the tile's own square (the margin's brooks belong to the tiles round it). */
const own = tile.rivers.filter((r) => {
  const e = r.level.length - 1, x = r.xz[e * 2], z = r.xz[e * 2 + 1];
  return x > x0 && x < x0 + side && z > z0 && z < z0 + side;
});

test('brooks: many, running downhill, narrow and shallow enough to ford', () => {
  assert.ok(own.length > 150, `${own.length} brooks`);
  for (const r of tile.rivers) {
    for (let k = 1; k < r.level.length; k++) assert.ok(r.level[k] <= r.level[k - 1] + 1e-6, 'never uphill');
    for (let k = 0; k < r.half.length; k++) {
      assert.ok(r.half[k] >= 1 && r.half[k] <= 3.5, `half ${r.half[k]}`);
      assert.ok(brookDepth(r.half[k]) <= 0.7, 'a road can ford it');
    }
    assert.ok(r.fall.every((f) => f === 0), 'no falls of their own');
  }
});

test('brooks: each ends in water (a river, a lake, the sea or a bigger brook)', () => {
  let wet = 0;
  for (const r of own) {
    const e = r.level.length - 1, x = r.xz[e * 2], z = r.xz[e * 2 + 1];
    const main = terrain.hydro.tileAt(x, z).query(x, z);
    const inRiver = main.river && main.dist < main.half + 2;
    const inLake = !Number.isNaN(main.lake) && r.level[e] <= main.lake + 0.5;
    const atSea = terrain.skeleton.elevation(x, z) <= 0.5 || r.level[e] <= 0.5;
    // On another brook's line.
    let onBrook = false;
    tile.riverPoints(x, z, 3, (o) => { if (o !== r) onBrook = true; });
    if (inRiver || inLake || atSea || onBrook) wet++;
  }
  assert.ok(wet >= own.length * 0.97, `${wet} of ${own.length} end in water`);
});

test('brooks: most land has running water near (D50)', () => {
  let land = 0, near = 0;
  for (let i = 0; i < 600; i++) {
    const x = x0 + ((i * 7919) % 600) / 600 * side, z = z0 + ((i * 104729) % 599) / 599 * side;
    if (terrain.skeleton.elevation(x, z) < 5) continue;
    land++;
    if (terrain.hydro.riverEdge(x, z, 300) < 300) near++;
  }
  assert.ok(near > land * 0.25, `${near} of ${land} within 300 m`);
});

test('brooks: they lie in their beds, banks stay dry, and the near water mask draws them', () => {
  let checked = 0, drawn = 0;
  for (const r of own.slice(0, 60)) {
    const k = Math.floor(r.level.length / 2), x = r.xz[k * 2], z = r.xz[k * 2 + 1];
    const w = terrain.hydro.query(x, z);
    if (!w.brook || w.dist > 0.5) continue; // a river's valley or a town wins here
    assert.ok(terrain.height(x, z) < w.level - 0.2, 'bed below the water');
    const nx = -w.fz, nz = w.fx, d = w.half + 6;
    const bank = terrain.hydro.query(x + nx * d, z + nz * d);
    if (bank.brook && Math.abs(bank.level - w.level) < 0.01) assert.ok(terrain.height(x + nx * d, z + nz * d) > w.level, 'bank above the water');
    checked++;
    if (checked > 8) continue;
    // The near mask is 2 m a sample.
    const m = waterMask(terrain, { seed, setting: classic.id, x0: x - 8, z0: z - 8, size: 16, res: 8 });
    if (m[(4 * 8 + 4) * 4 + 1] > 0) drawn++;
  }
  assert.ok(checked > 20, `${checked} brooks checked`);
  assert.ok(drawn >= 7, `${drawn} of 9 drawn`);
});

test('brooks: a tile traced in a worker and handed over answers as one traced here', () => {
  const other = new Terrain(seed, classic, { cell: 2000, core: 96, margin: 32, minArea: 120 });
  other.hydro.adoptBrooks(tile.tx, tile.tz, packRivers(tile.rivers));
  assert.ok(other.hydro.hasBrooks(-30000, 34000));
  for (let i = 0; i < 200; i++) {
    const x = x0 + ((i * 7919) % 200) / 200 * side, z = z0 + ((i * 104729) % 199) / 199 * side;
    assert.deepEqual(other.hydro.query(x, z), terrain.hydro.query(x, z));
    assert.equal(other.height(x, z), terrain.height(x, z));
  }
});
