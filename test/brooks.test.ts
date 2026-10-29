import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { Terrain } from '../src/world/terrain';
import { BROOKS, brookDepth, packRivers } from '../src/world/hydro';
import { DRY, flowSpeed, waterMask } from '../src/world/water';
import { finerFor } from '../src/world/chunkMesh';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
// Small river tiles (as the frontier and roads tests), brooks as in the game.
const terrain = new Terrain(seed, classic, SMALL);
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
    // (Unless that is in a river's channel: the brook runs into it there.)
    const river = terrain.hydro.riverAt(x + nx * d, z + nz * d);
    if (bank.brook && Math.abs(bank.level - w.level) < 0.01 && !(river.river && river.dist < river.half)) assert.ok(terrain.height(x + nx * d, z + nz * d) > w.level, 'bank above the water');
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
  const other = new Terrain(seed, classic, SMALL);
  other.hydro.adoptBrooks(tile.tx, tile.tz, packRivers(tile.rivers));
  assert.ok(other.hydro.hasBrooks(-30000, 34000));
  for (let i = 0; i < 200; i++) {
    const x = x0 + ((i * 7919) % 200) / 200 * side, z = z0 + ((i * 104729) % 199) / 199 * side;
    assert.deepEqual(other.hydro.query(x, z), terrain.hydro.query(x, z));
    assert.equal(other.height(x, z), terrain.height(x, z));
  }
});

test('brooks: the mask carries a brook\'s level well onto its banks, under the ground, so far water vertices find it', () => {
  let carried = 0, tried = 0;
  for (const r of own.slice(0, 40)) {
    const k = Math.floor(r.level.length / 2), x = r.xz[k * 2], z = r.xz[k * 2 + 1];
    const w = terrain.hydro.query(x, z);
    if (!w.brook || w.dist > 0.5) continue;
    // 12 m beside the brook (six 2 m pixels out): the brook's level, below that bank's ground.
    const nx = -w.fz, nz = w.fx, bx = x + nx * (w.half + 12), bz = z + nz * (w.half + 12);
    const big = waterMask(terrain, { seed, setting: classic.id, x0: x - 32, z0: z - 32, size: 64, res: 32 });
    const i = Math.floor((bx - (x - 32)) / 2), j = Math.floor((bz - (z - 32)) / 2), p = (j * 32 + i) * 4;
    const ground = terrain.height(bx, bz);
    // A bank that falls away below the water (a brook along a hillside) has no level carried onto it: the surface
    // would float over the land there.
    if (ground < w.level) continue;
    tried++;
    if (big[p + 1] !== DRY && Math.abs(big[p] - w.level) < 0.5) { carried++; assert.ok(big[p] <= ground + 0.01, 'never above the bank'); }
    if (tried >= 8) break;
  }
  assert.ok(carried >= tried * 0.6, `${carried} of ${tried} banks carry the level`);
});

test('running water: steep brooks rush, lowland rivers glide (speed by slope)', () => {
  const brook: number[] = [];
  for (const r of own) for (let k = 0; k < r.level.length; k += 3) {
    const w = terrain.hydro.brookAt(r.xz[k * 2], r.xz[k * 2 + 1]);
    if (w.river) brook.push(flowSpeed(w.slope));
  }
  const river: number[] = [];
  terrain.hydro.riverPoints(x0 + side / 2, z0 + side / 2, side, (r, k) => {
    river.push(flowSpeed(terrain.hydro.riverAt(r.xz[k * 2], r.xz[k * 2 + 1]).slope));
  }, false);
  for (const v of [...brook, ...river]) assert.ok(v >= 0.5 && v <= 3.5, `speed ${v}`);
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(brook.length > 100 && river.length > 10, `${brook.length} brook, ${river.length} river samples`);
  assert.ok(mean(brook) > mean(river), `brooks ${mean(brook)} vs rivers ${mean(river)}`);
  assert.ok(brook.filter((v) => v > 2).length > brook.length * 0.05, 'some brooks rush');
});

test('water mask: off the water the surface lies under the ground (no sheet floats over a dip by a brook)', () => {
  let checked = 0;
  for (const r of own.slice(0, 12)) {
    const k = Math.floor(r.level.length / 2), x = r.xz[k * 2], z = r.xz[k * 2 + 1];
    const res = 24, size = 48, x0m = x - size / 2, z0m = z - size / 2;
    const m = waterMask(terrain, { seed, setting: classic.id, x0: x0m, z0: z0m, size, res });
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const p = (j * res + i) * 4;
      if (m[p + 1] > 0) continue;
      const h = terrain.height(x0m + (i + 0.5) * size / res, z0m + (j + 0.5) * size / res);
      assert.ok(m[p] <= h + 1e-3, `surface ${m[p]} over ground ${h}`);
      checked++;
    }
  }
  assert.ok(checked > 1000, `${checked} dry samples`);
});

test('brooks: a near terrain chunk with a brook in it is built at 1 m, others at the 2 m asked', () => {
  const r = own[0], k = Math.floor(r.level.length / 2), bx = r.xz[k * 2], bz = r.xz[k * 2 + 1];
  const at = (x: number, z: number, size = 128) => ({ x0: Math.floor(x / size) * size, z0: Math.floor(z / size) * size, size, segs: 64 });
  assert.equal(finerFor(terrain, at(bx, bz)), 128, 'the brook chunk');
  assert.equal(finerFor(terrain, at(bx, bz, 256)), 64, 'farther chunks stay as asked');
  // Not every near chunk: some round it have no brook.
  const round = [...Array(25).keys()].map((i) => at(bx + ((i % 5) - 2) * 128, bz + (Math.floor(i / 5) - 2) * 128));
  assert.ok(round.some((s) => finerFor(terrain, s) === 64), 'chunks without a brook stay at 2 m');
});

test('brooks: none dams a river (its bed stays under its water where brooks cross or come down into it)', () => {
  const rivers = terrain.hydro.tileAt(x0 + side / 2, z0 + side / 2).rivers;
  let n = 0;
  for (const r of rivers) for (let k = 0; k < r.level.length; k++) {
    const x = r.xz[k * 2], z = r.xz[k * 2 + 1];
    if (x < x0 || z < z0 || x >= x0 + side || z >= z0 + side) continue;
    n++;
    const above = terrain.height(x, z) - r.level[k];
    assert.ok(above < 0.5, `river bed ${above.toFixed(1)} m above its water at ${x.toFixed(0)},${z.toFixed(0)}`);
  }
  assert.ok(n > 50, `${n} river points`);
});
