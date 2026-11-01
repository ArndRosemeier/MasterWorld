import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { columnSpans } from '../src/world/cave/dress';
import { formationMesh } from '../src/world/cave/formations';
import { crystalsMesh, stonesMesh } from '../src/world/cave/loose';
import { waterMesh } from '../src/world/cave/waterMesh';
import { dressFormed, formCave } from '../src/world/cave/form';
import type { BrickField } from '../src/world/dungeon/rockMesh';
import { formedCave } from './support/formedCave';

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

test('caves: the dressing becomes sound part meshes (layered formations, rocks of all sizes, crystals, water), seeded', () => {
  const d = formedCave(5, 'jointed').dressing;
  const sound = (m: { position: Float32Array; normal: Float32Array; index: Uint32Array }, what: string) => {
    assert.ok(m.index.length > 0 && m.index.length % 3 === 0, `${what} has triangles`);
    const n = m.position.length / 3;
    assert.ok(m.index.every((i) => i < n), `${what} indexes within its vertices`);
    assert.ok(m.position.every(Number.isFinite) && m.normal.every(Number.isFinite), `${what} is finite`);
  };
  /** Share of triangles whose face looks the way their vertex normals do (culling hides the others). */
  const outward = (m: { position: Float32Array; normal: Float32Array; index: Uint32Array }): number => {
    let ok = 0;
    for (let t = 0; t < m.index.length; t += 3) {
      const [a, b, c] = [m.index[t] * 3, m.index[t + 1] * 3, m.index[t + 2] * 3], P = m.position, N = m.normal;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
      if (fx * (N[a] + N[b] + N[c]) + fy * (N[a + 1] + N[b + 1] + N[c + 1]) + fz * (N[a + 2] + N[b + 2] + N[c + 2]) > 0) ok++;
    }
    return ok / (m.index.length / 3);
  };
  const f = formationMesh(d.speleos, 5), s = stonesMesh(d.stones, 5, () => [120, 110, 100]), k = crystalsMesh(d.crystals), w = waterMesh(d, caves.dress.water.bed, caves.dress.water.poolDepth);
  sound(f, 'formations'); sound(s, 'stones'); sound(w, 'water');
  assert.ok(d.crystals.length === 0 || k.index.length > 0, 'crystals mesh');
  for (const [m, what] of [[f, 'formations'], [s, 'stones'], [k, 'crystals'], [w, 'water']] as const) assert.ok(outward(m) > 0.95, `${what}: ${(outward(m) * 100).toFixed(0)} % of faces look outward`);
  // A formation grows in layers: far more vertices than a cone's.
  assert.ok(f.position.length / 3 > d.speleos.length * 40, 'formations are layered, not cones');
  // Rocks lie in all sizes: pebbles to boulders.
  const r = d.stones.map((x) => x.r).sort((a, b) => a - b);
  assert.ok(r.length > 100 && r[r.length - 1] / r[0] > 4, `stones from ${r[0]?.toFixed(2)} to ${r[r.length - 1]?.toFixed(2)} m`);
  const again = stonesMesh(d.stones, 5, () => [120, 110, 100]);
  assert.deepEqual(Array.from(again.position.slice(0, 300)), Array.from(s.position.slice(0, 300)), 'seeded');
});
