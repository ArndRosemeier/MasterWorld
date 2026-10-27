import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import { DIRS } from '@futuremagic/dungeon';
import { classic } from '../src/setting/classic/index';
import { CELL, DOOR_W, STOREY, blocksDoor, outlineCellar, propsClash, type Cellar } from '../src/world/dungeon/cellar';
import { DOOR_H, fallStones } from '../src/world/dungeon/cellarMesh';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import type { DungeonTemplate } from '../src/world/decisions';

const KINDS: readonly DungeonTemplate[] = ['cellar', 'barrow', 'cave', 'tower'];
const places: { where: string; c: Cellar }[] = KINDS.flatMap((t) => Array.from({ length: 40 }, (_, i) => ({
  where: `${t} ${i}`,
  c: outlineCellar(testDecision(i, 7, t), t === 'cellar' ? testHouse(i) : { kind: t, hu: 3, hv: 3, name: `the ${t}` }, classic.dungeons[t]!),
})));

test('cellar dressing: every prop stands on its room floor, clear of every doorway (the way out, if it must, beside one)', () => {
  for (const { where, c } of places) for (const p of c.props) {
    const R = c.layout.rooms[p.room];
    assert.equal(p.y, R.level * STOREY, `${where}: ${p.kind} off the floor`);
    for (const d of c.layout.links.flatMap((pl) => pl.doors)) {
      if (d.room !== p.room || d.level !== R.level || p.kind === 'puddle' || p === c.hatch) continue;
      assert.ok(!blocksDoor(p, d), `${where}: ${p.kind} in front of a door of room ${p.room}`);
      // The walking lane through the door, measured on its own: no prop's middle in it.
      const [dx, dz] = DIRS[d.dir], mx = (d.x + 0.5 + dx * 0.5) * CELL, mz = (d.z + 0.5 + dz * 0.5) * CELL;
      const along = Math.abs((p.x - mx) * -dz + (p.z - mz) * dx), into = -((p.x - mx) * dx + (p.z - mz) * dz);
      assert.ok(!(along < DOOR_W / 2 && into < 1.2), `${where}: ${p.kind} in the doorway (${along.toFixed(2)}, ${into.toFixed(2)})`);
    }
  }
});

test('cellar dressing: no two props stand in each other, and every clue lies somewhere to read', () => {
  for (const { where, c } of places) {
    for (let a = 0; a < c.props.length; a++) for (let b = a + 1; b < c.props.length; b++) {
      const p = c.props[a], q = c.props[b];
      if (p.room === q.room) assert.ok(!propsClash(p, q), `${where}: ${p.kind} and ${q.kind} overlap in room ${p.room}`);
    }
    c.clues.forEach((cl, i) => assert.ok(c.props.some((p) => p.clue === i), `${where}: clue ${i} has nothing to read it on (${cl.text.slice(0, 40)})`));
  }
});

test('cellar dressing: a fallen way is a heap up to the lintel, every stone on the floor or on a stone below', () => {
  for (let s = 0; s < 50; s++) {
    const rng = new Rng(s), yaw = rng.range(0, 6.28), ux = Math.cos(yaw), uz = Math.sin(yaw), y = rng.int(-1, 0) * STOREY;
    const st = fallStones(rng, rng.range(-20, 20), y, rng.range(-20, 20), ux, uz, -uz, ux);
    let top = -Infinity;
    for (const a of st) {
      top = Math.max(top, a.y0 + a.sy);
      if (a.y0 <= y + 1e-6) continue;
      // A stone below that it overlaps by at least a quarter of its own size each way (u along the wall, o through it).
      const under = st.some((b) => {
        const du = Math.abs((b.x - a.x) * ux + (b.z - a.z) * uz), dO = Math.abs((b.x - a.x) * -uz + (b.z - a.z) * ux);
        return b.y0 < a.y0 && b.y0 + b.sy >= a.y0 && du < (a.sx + b.sx) / 2 - a.sx / 4 && dO < (a.sz + b.sz) / 2 - a.sz / 4;
      });
      assert.ok(under, `heap ${s}: a stone at ${(a.y0 - y).toFixed(2)} m hangs in the air`);
    }
    assert.ok(top >= y + DOOR_H - 0.05, `heap ${s}: stops at ${(top - y).toFixed(2)} m, below the lintel`);
  }
});
