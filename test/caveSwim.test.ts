/**
 * Deep water in a formed cave (K6, the first water of the sump): the dresser cuts ponds into wide, level stretches of the ways, the reader
 * takes the bowl as no standing ground and links the rim across it by swimming, and the real walker swims in it and wades out of it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedWorld } from '../src/game/formedWorld';
import { Walker } from '../src/game/walker';
import { caveWater } from '../src/world/cave/water';
import { floorUnder, waterMesh } from '../src/world/cave/waterMesh';
import { fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';
import { caves, formedCave } from './support/formedCave';

const { bed, poolDepth, ponds } = caves.dress.water;
const { c, reading: R, dressing } = formedCave(1, 'thin-bedded');
const field = c.field as BrickField, floor = floorUnder(field), water = caveWater(dressing, bed, poolDepth);
const pond = dressing.pools.filter((p) => p.depth !== undefined && !p.lid).sort((a, b) => b.r - a.r)[0];

test('cave ponds: a wide level stretch of a way holds a pond deep enough to swim in, sunk into the floor', () => {
  assert.ok(pond, 'a pond');
  assert.ok(pond.r >= 1.8 && pond.depth === ponds.depth);
  const middle = floor(pond.x, pond.y, pond.z);
  assert.ok(pond.y - middle >= 1.5, `${(pond.y - middle).toFixed(2)} m deep in the middle`);
});

test('cave ponds: deeper than a wade there is no standing ground, and the rim is linked across by swimming (creatures do not take them)', () => {
  for (let i = 0; i < R.count; i++) {
    if (Math.hypot(R.x[i] - pond.x, R.z[i] - pond.z) < pond.r) assert.ok(R.y[i] >= pond.y - 0.5 - 1e-3, 'a cell standing in the deep');
  }
  assert.ok(R.stats.links.swim > 0, 'swim links');
  assert.ok(R.edgeKind.includes(3));
});

test('cave ponds: the real walker swims from the bottom to the rim and stands there, and is told the water at its feet', () => {
  const middle = floor(pond.x, pond.y, pond.z), level = water!(pond.x, middle + 0.1, pond.z);
  assert.ok(level !== null && Math.abs(level - pond.y) < 1e-6, 'the pond surface at the feet');
  const world = formedWorld(field, undefined, water);
  const rim: number[] = [];
  for (let i = 0; i < R.count; i++) {
    const h = Math.hypot(R.x[i] - pond.x, R.z[i] - pond.z);
    if (h >= pond.r - 0.2 && h <= pond.r + 2.5 && Math.abs(R.y[i] - pond.y) <= 1.3 && R.depth[i] < Infinity) rim.push(i);
  }
  const tries = rim.filter((_, n) => n % Math.max(1, Math.floor(rim.length / 8)) === 0).slice(0, 8);
  assert.ok(tries.length >= 5, `${tries.length} rim cells`);
  let out = 0, swam = 0;
  for (const t of tries) {
    const w = new Walker(world);
    w.place(pond.x, pond.z, middle + 0.02);
    let did = false;
    for (let s = 0; s < 60 * 12; s++) {
      const ax = R.x[t] - w.pos.x, az = R.z[t] - w.pos.z;
      if (Math.hypot(ax, az) < 0.7) break;
      w.step({ forward: 1, strafe: 0, heading: Math.atan2(-ax, -az), walk: false, up: false, down: false }, 1 / 60);
      if (w.mode === 'swim') did = true;
    }
    if (did) swam++;
    if (Math.hypot(R.x[t] - w.pos.x, R.z[t] - w.pos.z) < 0.9 && w.mode !== 'swim') out++;
  }
  assert.ok(swam === tries.length, `${swam} of ${tries.length} swam`);
  assert.ok(out >= tries.length * 0.7, `${out} of ${tries.length} got out at the rim`);
});

test('cave ponds: the water mesh draws the pond deep over its middle, whatever stream runs through it', () => {
  const m = waterMesh(dressing, bed, poolDepth, floor);
  let deepest = 0;
  for (let i = 0; i < m.position.length / 3; i++) {
    if (Math.hypot(m.position[i * 3] - pond.x, m.position[i * 3 + 2] - pond.z) < pond.r * 0.5) deepest = Math.max(deepest, m.uv[i * 2]);
  }
  assert.ok(deepest >= 1.4, `${deepest.toFixed(2)} m deep in the middle`);
});

// A sump: a pond with rock over its middle down to the water (K6); the hero dives under it with the breath held.
test('cave sumps: rock closes the way over a pond down to the water, the reader links the two sides by a swim, and the real walker dives through', () => {
  const { c: sc, reading: SR, dressing: sd } = formedCave(4, 'massive'), sf = sc.field as BrickField, sw = caveWater(sd, bed, poolDepth);
  const sump = sd.pools.find((p) => p.lid !== undefined);
  assert.ok(sump?.lid, 'a sump');
  const { tx, tz, half } = sump.lid, along = (x: number, z: number): number => (x - sump.x) * tx + (z - sump.z) * tz;
  // The lid is solid over the middle at the water's surface; the water is open under it.
  assert.ok(fieldAt(sf, sump.x, sump.y + 0.5, sump.z, -1) < 0, 'rock over the middle');
  assert.ok(fieldAt(sf, sump.x, sump.y - 1, sump.z, -1) > 0.4, 'water under it');
  // The reader: swim links from one side of the lid to the other.
  const links: [number, number][] = [];
  for (let a = 0; a < SR.count; a++) for (let e = SR.edgeStart[a]; e < SR.edgeStart[a + 1]; e++) {
    const b = SR.edgeTo[e];
    if (SR.edgeKind[e] === 3 && Math.hypot(SR.x[a] - sump.x, SR.z[a] - sump.z) < sump.r + 2 && along(SR.x[a], SR.z[a]) < -half && along(SR.x[b], SR.z[b]) > half) links.push([a, b]);
  }
  assert.ok(links.length >= 5, `${links.length} swim links under the lid`);
  // The walker dives from one end of a link to the other, the head under for a few seconds only (the breath lasts 40 s).
  const tries = links.filter((_, n) => n % Math.max(1, Math.floor(links.length / 6)) === 0).slice(0, 6), world = formedWorld(sf, undefined, sw);
  let through = 0;
  for (const [a, b] of tries) {
    const w = new Walker(world);
    w.place(SR.x[a], SR.z[a], SR.y[a] + 0.02);
    let under = 0;
    for (let s = 0; s < 60 * 20; s++) {
      const ax = SR.x[b] - w.pos.x, az = SR.z[b] - w.pos.z, far = Math.hypot(ax, az);
      if (far < 0.7) break;
      const here = along(w.pos.x, w.pos.z), diving = here < half + 1;
      w.step({ forward: 1, strafe: 0, heading: Math.atan2(-ax, -az), walk: false, up: !diving && far < 3, down: diving && w.mode === 'swim' && here > -half - 2 }, 1 / 60);
      if (w.headUnder) under++;
    }
    if (Math.hypot(SR.x[b] - w.pos.x, SR.z[b] - w.pos.z) < 0.9 && under > 10 && under < 60 * 10) through++;
  }
  assert.ok(through >= tries.length * 0.6, `${through} of ${tries.length} dived through`);
});
