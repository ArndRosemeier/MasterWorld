import { test } from 'node:test';
import assert from 'node:assert/strict';
import { floatOf, parseSeed } from '@futuremagic/core';
import { rockModel } from '@futuremagic/rocks';
import { classic } from '../src/setting/classic/index';
import { Terrain } from '../src/world/terrain';
import { FORM_CELL } from '../src/world/landforms';
import { ROCK_STRIDE, Rocks, STEP_OVER, obstaclesOf, rockKinds, rockPlacement } from '../src/world/rocks';
import { Walker } from '../src/game/walker';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const terrain = new Terrain(seed, classic, SMALL);
const START = { x: -32000, z: 32000 };
// The first tor and boulder field round the start (their cells' rocks).
const near = terrain.landforms.within(START.x, START.z, 3000);
const tor = near.find((f) => f.shape === 'tor')!;
const field = near.find((f) => f.shape === 'boulders')!;
const cellOf = (x: number, z: number) => rockPlacement(terrain, Math.floor(x / FORM_CELL) * FORM_CELL, Math.floor(z / FORM_CELL) * FORM_CELL, FORM_CELL);

test('rocks: a tor wears a crown of rock, a boulder field its boulders; placed alike every time', () => {
  assert.ok(tor && field, 'a tor and a boulder field near the start');
  for (const f of [tor, field]) {
    const d = cellOf(f.x, f.z);
    const mine = [];
    for (let k = 0; k < d.length; k += ROCK_STRIDE) if (Math.hypot(d[k] - f.x, d[k + 2] - f.z) < f.L * 1.1) mine.push(k);
    assert.ok(mine.length >= 5, `${f.shape}: ${mine.length} rocks`);
    assert.deepEqual(cellOf(f.x, f.z), d, 'the same rocks again');
  }
});

test('rocks: every rock sits on the ground, no edge floating', () => {
  const ks = rockKinds(), ground = (x: number, z: number) => terrain.height(x, z);
  for (const f of [tor, field]) {
    const d = cellOf(f.x, f.z);
    for (let k = 0; k < d.length; k += ROCK_STRIDE) {
      const kind = ks[d[k + 5]], m = rockModel(kind.shape, kind.seed, 1), s = d[k + 3], c = Math.cos(d[k + 4]), sn = Math.sin(d[k + 4]);
      const pos = new Float32Array(m.positions.length);
      for (let v = 0; v < pos.length; v += 3) {
        const x = m.positions[v] * s, z = m.positions[v + 2] * s;
        // three's yaw about +y: x' = x cos + z sin, z' = -x sin + z cos.
        pos[v] = d[k] + x * c + z * sn; pos[v + 1] = d[k + 1] + m.positions[v + 1] * s; pos[v + 2] = d[k + 2] - x * sn + z * c;
      }
      assert.ok(floatOf(ground, pos) <= 0.05, `${kind.shape} floats ${floatOf(ground, pos).toFixed(2)} m`);
    }
  }
});

test('rocks: the walker goes round a boulder, not through it', () => {
  const rocks = new Rocks(terrain);
  const d = cellOf(tor.x, tor.z), obst = obstaclesOf(d);
  // The biggest rock of the crown.
  let best = 0;
  for (let k = 0; k < obst.length; k += 4) if (obst[k + 2] > obst[best + 2]) best = k;
  const [bx, bz, br] = [obst[best], obst[best + 1], obst[best + 2]];
  assert.ok(br > STEP_OVER, 'a rock to walk round');
  const world = { height: (x: number, z: number) => terrain.height(x, z), floor: () => null, rockSurface: () => null, waterLevel: () => null, wall: (x: number, z: number, r: number, y?: number) => rocks.blocks(x, z, r, y) };
  const w = new Walker(world);
  w.place(bx - br - 6, bz);
  for (let k = 0; k < 60 * 6; k++) {
    w.step({ forward: 1, strafe: 0, heading: Math.atan2(-1, 0), walk: true, up: false, down: false }, 1 / 60);
    assert.ok(Math.hypot(w.pos.x - bx, w.pos.z - bz) > br * 0.9, `inside the rock at step ${k}`);
  }
});
