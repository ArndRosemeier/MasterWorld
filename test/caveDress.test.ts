import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { columnSpans } from '../src/world/cave/dress';
import { dressFormed, formCave } from '../src/world/cave/form';
import type { BrickField } from '../src/world/dungeon/rockMesh';

const caves = classic.caves!;
// A block a little smaller than the smallest cave, to keep within the time of `npm test`.
const small = { ...caves.sizes.find((s) => s.id === 'small')!, across: 70, deep: 30, field: 0.6 };
const form = (seed: number, rock: string) => formCave(caves, seed, rock, small.id, undefined, undefined, small);

/** The floor (the first span with head room) of each column. */
function floors(f: BrickField, room: number): Float32Array {
  const out = new Float32Array(f.nx * f.nz).fill(NaN), sp: number[] = [];
  for (let k = 0; k < f.nz; k++) for (let i = 0; i < f.nx; i++) {
    columnSpans(f, i, k, sp);
    for (let n = 0; n < sp.length; n += 2) if (sp[n + 1] - sp[n] >= room) { out[i + f.nx * k] = sp[n]; break; }
  }
  return out;
}

test('caves: the dresser lays silt and rock without taking a way\'s head room, streams, drips and formations hang where it is dry enough', () => {
  const heroTall = 2.1, c = form(5, 'jointed'), f = c.field as BrickField;
  const before = new Map<number, number>(), sp: number[] = [];
  for (let k = 0; k < f.nz; k++) for (let i = 0; i < f.nx; i++) {
    columnSpans(f, i, k, sp);
    for (let n = 0; n < sp.length; n += 2) if (sp[n + 1] - sp[n] >= caves.way.minHeight) { before.set(i + f.nx * k, sp[n]); break; }
  }
  const dressing = dressFormed(c, caves);
  // Every column that had room to stand still has it (the hero's height) over the new floor.
  let lower = 0;
  for (const idx of before.keys()) {
    columnSpans(f, idx % f.nx, Math.floor(idx / f.nx), sp);
    let room = 0;
    for (let n = 0; n < sp.length; n += 2) room = Math.max(room, sp[n + 1] - sp[n]);
    if (room < heroTall) lower++;
  }
  assert.equal(lower, 0, 'no column that had room to stand lost it');
  assert.ok(dressing.speleos.length > 20 && dressing.drips.length > 5, 'the roof drips and grows formations');
  assert.ok(dressing.rocks.length > 5, 'rock lies about');
  // A stalactite's tip hangs over the hero's head, and a column or stalagmite stays inside the air it stands in.
  const fl = floors(f, heroTall);
  for (const s of dressing.speleos) {
    assert.ok(s.y1 > s.y0 && s.rb > 0 && s.rt > 0, 'a formation has a body');
    const g = fl[Math.round((s.x - f.ox) / f.step) + f.nx * Math.round((s.z - f.oz) / f.step)];
    if (s.kind === 'stalactite' && g === g) assert.ok(s.y0 - g >= heroTall - 0.5, `stalactite tip ${(s.y0 - g).toFixed(2)} m over the floor`);
  }
  // The floor is almost never level (under a tenth of standable ground).
  assert.ok(dressing.stats.standable > 500 && dressing.stats.level < 0.1, `level share ${dressing.stats.level}`);
  for (const st of dressing.streams) assert.ok(st.pts.length >= 6 && st.pts.every((p) => p[3] >= 0.5));
});

test('caves: dressing is seeded: the same cave is dressed the same twice', () => {
  const a = dressFormed(form(6, 'massive'), caves), b = dressFormed(form(6, 'massive'), caves);
  const strip = (d: typeof a) => JSON.stringify({ ...d, stats: { ...d.stats, ms: 0 } });
  assert.equal(strip(a), strip(b));
  assert.ok(a.speleos.length > 0);
});
