import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { dressFormed, formCave, readFormed } from '../src/world/cave/form';
import { Walker } from '../src/game/walker';
import { formedWorld } from '../src/game/formedWorld';
import { PART_MIN } from '../src/world/cave/reader';

const caves = classic.caves!;
// A block a little smaller than the smallest cave, to keep within the time of `npm test`.
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };
const read = (seed: number, rock: string) => {
  const c = formCave(caves, seed, rock, small.id, undefined, undefined, small), d = dressFormed(c, caves);
  return { c, ...readFormed(c, caves, d) };
};

test('caves: every cut-off part of a cave is opened by a hero-sized way, no cell is a squeeze, and a way in exists', () => {
  for (const [seed, rock] of [[5, 'jointed'], [6, 'massive'], [7, 'thin-bedded']] as const) {
    const t0 = Date.now(), r = read(seed, rock), s = r.reading.stats;
    assert.ok(r.reading.entries.length >= 1, `${rock} ${seed}: a way in`);
    assert.equal(s.cutOff, 0, `${rock} ${seed}: no part of ${PART_MIN} cells or more is out of reach`);
    assert.ok(s.reached > 0.9 * s.cells, `${rock} ${seed}: ${s.reached} of ${s.cells} cells reached`);
    // No squeezing: every cell has the standing hero's head room.
    for (let a = 0; a < r.reading.count; a++) assert.ok(r.reading.room[a] >= caves.way.stand, 'head room over every cell');
    assert.ok(Date.now() - t0 < 3000, `${rock} ${seed} read in ${Date.now() - t0} ms`);
  }
});

test('caves: the places of a cave are found, seeded, and every one lies on ground that can be reached', () => {
  const a = read(5, 'jointed'), b = read(5, 'jointed');
  const kinds = new Set(a.reading.places.map((p) => p.kind));
  for (const k of ['entry', 'deadEnd', 'junction', 'ledge'] as const) assert.ok(kinds.has(k) || (k === 'deadEnd' && kinds.has('alcove')), `a ${k} is found`);
  for (const p of a.reading.places) assert.ok(a.reading.depth[p.cell] < Infinity, `${p.kind} lies on reached ground`);
  assert.deepEqual(a.reading.places, b.reading.places, 'seeded');
  assert.deepEqual(a.opened, b.opened);
  // Depth grows along the way: no place is nearer the way in than the way in itself.
  assert.ok(a.reading.places.every((p) => p.depth >= 0));
});

test('caves: the real walker crosses the walk links of the reading (the reader and the body agree, no squeezing)', () => {
  const r = read(6, 'massive'), world = formedWorld(r.c.field as never), g = r.reading;
  let tried = 0, crossed = 0;
  for (let a = 0, n = 0; a < g.count && tried < 60; a++) {
    if (g.depth[a] === Infinity) continue;
    for (let e = g.edgeStart[a]; e < g.edgeStart[a + 1]; e++) {
      if (g.edgeKind[e] !== 0 || ++n % 25 !== 0) continue;
      const b = g.edgeTo[e], w = new Walker(world);
      w.place(g.x[a], g.z[a], g.y[a] + 0.02);
      tried++;
      for (let t = 0; t < 60 * 6; t++) {
        w.step({ forward: 1, strafe: 0, heading: Math.atan2(-(g.x[b] - w.pos.x), -(g.z[b] - w.pos.z)), walk: false, up: false, down: false }, 1 / 60);
        if (Math.hypot(g.x[b] - w.pos.x, g.z[b] - w.pos.z) < 0.35 && Math.abs(g.y[b] - w.pos.y) < 0.8) { crossed++; break; }
      }
    }
  }
  assert.ok(tried >= 30, `${tried} walk links tried`);
  assert.ok(crossed >= tried * 0.97, `${crossed} of ${tried} walk links walked by the real walker`);
});
