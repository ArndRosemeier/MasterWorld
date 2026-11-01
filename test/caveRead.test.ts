import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { dressFormed, formCave, readFormed } from '../src/world/cave/form';
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
