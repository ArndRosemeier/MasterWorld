import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formedCave } from './support/formedCave';
import { findSqueezes, sealSqueezes } from '../src/world/cave/squeeze';
import { BRICK, fieldAt, type BrickField } from '../src/world/dungeon/rockMesh';

test('cave squeezes (D63): no formed cave leaves a mouth too small for the hero with air going on behind it', () => {
  for (const [seed, rock] of [[5, 'jointed'], [6, 'massive'], [7, 'thin-bedded'], [2, 'basalt']] as const) {
    const t0 = Date.now(), r = formedCave(seed, rock), left = findSqueezes(r.c.field as BrickField, r.reading, r.c.skeleton, r.dressing);
    assert.deepEqual(left.map((q) => `${q.kind} ${q.volume.toFixed(0)} m3 at ${q.x.toFixed(0)},${q.y.toFixed(0)},${q.z.toFixed(0)}`), [], `${rock} ${seed}`);
    // What the concession shut lies in rock now, and nothing loose was left in it.
    for (const q of r.sealed) assert.ok(fieldAt(r.c.field as BrickField, q.x, q.y, q.z, -1) <= 0.5, `${rock} ${seed}: shut`);
    assert.ok(Date.now() - t0 < 1500, `${rock} ${seed}: swept in ${Date.now() - t0} ms`);
  }
});

test('cave squeezes (D63): a slot cut into a wall beside reached ground is found as a low squeeze, and sealing it shuts it', () => {
  const r = formedCave(6, 'massive'), src = r.c.field as BrickField, g = r.reading;
  const f: BrickField = { ...src, bricks: src.bricks.map((b) => (b ? b.slice() : b)) };
  const { step } = f, sample = (x: number, y: number, z: number) => [Math.round((x - f.ox) / step), Math.round((y - f.oy) / step), Math.round((z - f.oz) / step)];
  const brickOf = (i: number, j: number, k: number) => f.bricks[((i / BRICK) | 0) + f.bx * (((j / BRICK) | 0) + f.by * ((k / BRICK) | 0))];
  // A slot a metre high, 1.6 m across and 6 m deep, into solid rock from a wall beside a reached cell.
  let slot: { x: number; y: number; z: number } | null = null;
  for (let c = 0; c < g.count && !slot; c += 7) {
    if (g.depth[c] === Infinity) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const wall = [0.5, 1, 1.5, 2].find((t) => fieldAt(f, g.x[c] + dx * t, g.y[c] + 0.6, g.z[c] + dz * t, 1) < 0);
      if (wall === undefined) continue;
      const at: number[][] = [];
      let solid = true;
      for (let t = wall; t <= wall + 6 && solid; t += step / 2) for (let u = -0.8; u <= 0.8 && solid; u += step / 2) for (let h = 0.3; h <= 1.3; h += step / 2) {
        const x = g.x[c] + dx * t - dz * u, z = g.z[c] + dz * t + dx * u, y = g.y[c] + h;
        if (t > wall + 0.6 && fieldAt(f, x, y, z, 1) > -0.3) { solid = false; break; }
        const [i, j, k] = sample(x, y, z);
        if (!brickOf(i, j, k)) { solid = false; break; }
        at.push([i, j, k]);
      }
      if (!solid) continue;
      for (const [i, j, k] of at) brickOf(i, j, k)![(i % BRICK) + BRICK * ((j % BRICK) + BRICK * (k % BRICK))] = 0.5;
      slot = { x: g.x[c] + dx * (wall + 3), y: g.y[c] + 0.8, z: g.z[c] + dz * (wall + 3) };
      break;
    }
  }
  assert.ok(slot, 'a wall to cut a slot into');
  const found = findSqueezes(f, g, r.c.skeleton, r.dressing);
  const q = found.find((s) => Math.hypot(s.x - slot!.x, s.z - slot!.z) < 4);
  assert.ok(q && q.kind === 'low' && q.deep >= 1.5, `the slot is a squeeze (${found.map((s) => `${s.kind} at ${s.x.toFixed(0)},${s.z.toFixed(0)}`).join('; ')})`);
  sealSqueezes(f, [q]);
  assert.ok(fieldAt(f, slot.x, slot.y, slot.z, 1) < 0, 'sealed: rock where the slot was');
  assert.ok(!findSqueezes(f, g, r.c.skeleton, r.dressing).some((s) => Math.hypot(s.x - slot!.x, s.z - slot!.z) < 4), 'and no squeeze there any more');
});
