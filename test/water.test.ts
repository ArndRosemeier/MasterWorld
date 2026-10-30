import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { Terrain } from '../src/world/terrain';
import { Skeleton } from '../src/world/skeleton';
import { HydroTile, riverDepth } from '../src/world/hydro';
import { classic } from '../src/setting/classic/index';
import { DRY, SEA_LEVEL, joinPieces, maskPieces, waterMask } from '../src/world/water';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
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
  }
  assert.ok(lakes / land < 0.1, `${lakes} of ${land}`);
});

test('hydro: a lake lies in the land, at the height where it runs out over its rim (W3)', () => {
  const t = terrain, tl = t.hydro.tileAt(-32000, 32000), sk = t.skeleton;
  assert.ok(tl.lakes.length > 3, `${tl.lakes.length} lakes`);
  for (const l of tl.lakes.slice(0, 6)) {
    // It runs out at its crest: the land there is at its level, and lower just beyond.
    assert.ok(Math.abs(sk.elevation(l.crest[0], l.crest[1]) - l.level) < 0.01, 'crest at the level');
    assert.ok(sk.elevation(l.spill[0], l.spill[1]) < l.level, 'lower beyond the crest');
    assert.ok(l.depth >= 4);
    // Nowhere does its water stand beside dry ground lower than it (it would hang in the air there).
    const [x0, z0, x1, z1] = l.box;
    let wet = 0;
    for (let z = z0; z < z1; z += 25) for (let x = x0; x < x1; x += 25) {
      if (Number.isNaN(t.hydro.lakeLevel(x, z)) || t.height(x, z) >= l.level) continue;
      wet++;
      for (const [dx, dz] of [[25, 0], [-25, 0], [0, 25], [0, -25]]) {
        const nx = x + dx, nz = z + dz;
        if (Number.isNaN(t.hydro.lakeLevel(nx, nz))) assert.ok(t.height(nx, nz) > l.level - 0.5 || t.hydro.query(nx, nz).river, `dry ground below the lake at ${nx},${nz}`);
      }
    }
    assert.ok(wet > 0, 'the lake shows');
  }
  // A river into or out of a lake banks no levee up in its water: beside its end there, where the lake's land lies
  // under it, the lake shows on both sides.
  let ends = 0;
  for (const r of tl.rivers) for (const k of [0, r.level.length - 1]) {
    const x = r.xz[k * 2], z = r.xz[k * 2 + 1], level = t.hydro.lakeLevel(x, z);
    if (Number.isNaN(level)) continue;
    ends++;
    const j = k ? k - 1 : 1, dx = r.xz[j * 2] - x, dz = r.xz[j * 2 + 1] - z, len = Math.hypot(dx, dz);
    for (const side of [-1, 1]) {
      const o = (r.half[k] + 15) * side, px = x - (dz / len) * o, pz = z + (dx / len) * o;
      if (!Number.isNaN(t.hydro.lakeLevel(px, pz)) && sk.elevation(px, pz) < level - 1) assert.ok(t.height(px, pz) < level, `levee in the lake at ${px.toFixed(0)},${pz.toFixed(0)}`);
    }
  }
  assert.ok(ends > 0, 'rivers run into and out of lakes');
});

test('hydro: a river begins and ends at a lake\'s shore, never runs on over its water', () => {
  const tl = terrain.hydro.tileAt(-32000, 32000);
  let ends = 0;
  for (const r of tl.rivers) {
    const n = r.level.length;
    for (let k = 0; k < n; k++) {
      const x = r.xz[k * 2], z = r.xz[k * 2 + 1], l = tl.lakeNear(x, z), sh = l ? l.shore(x, z) : Infinity;
      if (k === 0 || k === n - 1) { if (sh < 100) { ends++; assert.ok(sh > 40, `end ${sh.toFixed(0)} m from the water`); } }
      else assert.ok(sh > 49, `river point in a lake at ${x.toFixed(0)},${z.toFixed(0)}`);
    }
  }
  assert.ok(ends > 0, 'rivers run into and out of lakes');
});

test('water mask: a river\'s current dies away where it meets a lake, the lake lies still', () => {
  const tl = terrain.hydro.tileAt(-32000, 32000);
  // The widest river into a lake, round its mouth at 8 m pixels.
  let mouth: [number, number] | null = null, widest = 0;
  for (const r of tl.rivers) {
    const e = r.level.length - 1, x = r.xz[e * 2], z = r.xz[e * 2 + 1];
    if ((tl.lakeNear(x, z)?.shore(x, z) ?? Infinity) < 100 && r.half[e] > widest) { widest = r.half[e]; mouth = [x, z]; }
  }
  assert.ok(mouth, 'a river runs into a lake');
  const size = 512, res = 64, step = size / res, x0 = mouth[0] - size / 2, z0 = mouth[1] - size / 2;
  const m = waterMask(terrain, { seed, setting: classic.id, x0, z0, size, res });
  let still = 0, running = 0;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step, p = (j * res + i) * 4, l = tl.lakeNear(x, z);
    const flow = Math.hypot(m[p + 2], m[p + 3]);
    if (l && l.shore(x, z) <= 50 && m[p + 1] > 0) { still++; assert.equal(flow, 0, `current on the lake at ${x.toFixed(0)},${z.toFixed(0)}`); }
    else if (flow > 0.3) running++;
  }
  assert.ok(still > 20 && running > 5, `still ${still}, running ${running}`);
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
    // (Unless the river bends back there: the point past the bank is in its channel again.)
    if (side.river && Math.abs(side.level - w.level) < 0.01 && side.dist > side.half + 10) assert.ok(t.height(x + nx * d, z + nz * d) > w.level, 'bank above the water');
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

test('hydro: a river ends at the shore, at the sea\'s level (it never runs on over the sea floor)', () => {
  const sk = new Skeleton(seed, classic.world);
  let mouths = 0;
  for (const r of tile.rivers) {
    const n = r.level.length;
    if (sk.elevation(r.xz[(n - 1) * 2], r.xz[(n - 1) * 2 + 1]) >= 0) continue;
    mouths++;
    assert.ok(r.level[n - 1] <= 0, `ends at ${r.level[n - 1]} m`);
    assert.ok(sk.elevation(r.xz[(n - 2) * 2], r.xz[(n - 2) * 2 + 1]) >= 0, 'one point past the shore, no more');
  }
  assert.ok(mouths > 0, 'no river reaches the sea');
});

test('hydro: a river that leaves a lake starts in it (it never begins on dry ground beyond it)', () => {
  const { n, lake, recv, x0, z0 } = tile, cell = SMALL.cell;
  const cellOf = (x: number, z: number) => Math.floor((z - z0) / cell) * n + Math.floor((x - x0) / cell);
  let fed = 0;
  for (const r of tile.rivers) {
    const c = cellOf(r.xz[0], r.xz[1]);
    if (!Number.isNaN(lake[c])) { fed++; assert.equal(r.level[0], lake[c], 'starts at the lake\'s level'); continue; }
    // Not in a lake: then no lake drains into its first cell.
    for (let nb = 0; nb < n * n; nb++) if (recv[nb] === c) assert.ok(Number.isNaN(lake[nb]), `river at ${r.xz[0]},${r.xz[1]} begins below a lake`);
  }
  assert.ok(fed > 0, 'some rivers leave lakes');
});

test('water: a mask made in pieces (side by side in the workers) is the mask made whole', () => {
  const job = { seed, setting: classic.id, x0: -32500, z0: 30000, size: 1024, res: 48 };
  const whole = waterMask(terrain, job);
  const pieces = maskPieces(job.x0, job.z0, job.size, job.res, 4);
  const made = pieces.map((p) => waterMask(terrain, { ...job, x0: p.x0, z0: p.z0, cols: p.cols, rows: p.rows }));
  const joined = joinPieces(job.res, pieces, made);
  let wet = 0;
  for (let k = 0; k < whole.length; k += 4) if (whole[k + 1] > 0) wet++;
  assert.ok(wet > 20 && wet < job.res * job.res - 20, `${wet} wet samples: the test needs a shore`);
  assert.deepEqual(joined, whole);
});
