import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRS } from '@futuremagic/dungeon';
import { classic } from '../src/setting/classic/index';
import { CELL, STOREY, outlineCellar, type Cellar } from '../src/world/dungeon/cellar';
import { cellarMeshes } from '../src/world/dungeon/cellarMesh';
import { DungeonSpace } from '../src/world/dungeon/space';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { Walker } from '../src/game/walker';
import { dungeonWorld } from '../src/game/dungeonWorld';

const cellars: Cellar[] = Array.from({ length: 10 }, (_, i) => i).map((i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar));
const O = { x: 0, y: 0, z: 0 };

test('cellar space: air in every room, solid outside, floors where the rooms are', () => {
  for (const c of cellars) {
    const s = new DungeonSpace(c.layout);
    for (const r of c.layout.rooms) {
      const x = (r.x + r.w / 2) * CELL, z = (r.z + r.d / 2) * CELL, y = r.level * STOREY;
      assert.ok(s.sdf(x, y + 1, z) > 0.5, `room ${r.id} is open`);
      assert.equal(s.floorAt(x, z, y + 1), y);
    }
    assert.ok(s.sdf(1000, 1, 1000) < 0, 'rock far away');
  }
});

/** Walk a body along a passage from room a to room b, steering cell by cell. */
function walkThrough(c: Cellar, s: DungeonSpace, li: number): { ok: boolean; at: string } {
  const pl = c.layout.links[li];
  const w = new Walker(dungeonWorld(s, O));
  const centre = (x: number, z: number) => [(x + 0.5) * CELL, (z + 0.5) * CELL];
  const [da, db] = pl.doors;
  const pts = [centre(da.x, da.z), ...pl.path.map((p) => centre(p.x, p.z)), centre(db.x, db.z)];
  const A = c.layout.rooms[pl.link.a];
  w.place(pts[0][0], pts[0][1], A.level * STOREY + 0.05);
  for (let k = 1; k < pts.length; k++) {
    for (let t = 0; t < 200; t++) {
      const dx = pts[k][0] - w.pos.x, dz = pts[k][1] - w.pos.z;
      if (Math.hypot(dx, dz) < 0.35) break;
      w.step({ forward: 1, strafe: 0, heading: Math.atan2(-dx, -dz), walk: true, up: false, down: false }, 1 / 30);
    }
    if (Math.hypot(pts[k][0] - w.pos.x, pts[k][1] - w.pos.z) > 0.5) return { ok: false, at: `step ${k}/${pts.length - 1}, ${w.pos.x.toFixed(1)},${w.pos.y.toFixed(1)},${w.pos.z.toFixed(1)}` };
  }
  const B = c.layout.rooms[pl.link.b];
  // Settle (a drop falls to the hall's floor).
  for (let t = 0; t < 60; t++) w.step({ forward: 0, strafe: 0, heading: 0, walk: true, up: false, down: false }, 1 / 30);
  return { ok: Math.abs(w.pos.y - B.level * STOREY) < 0.2, at: `ends at y ${w.pos.y.toFixed(2)}, room b floor ${B.level * STOREY}` };
}

test('cellar space: a body walks every open passage from end to end, up and down stairs and over ledges', () => {
  let walked = 0, stairs = 0, drops = 0;
  for (const c of cellars) {
    const s = new DungeonSpace(c.layout);
    c.layout.links.forEach((pl, li) => {
      if (!['open', 'door', 'drop'].includes(pl.link.kind)) return;
      const r = walkThrough(c, s, li);
      assert.ok(r.ok, `${c.decision.id} link ${li} (${pl.link.kind}, ${pl.path.length} cells): ${r.at}`);
      walked++;
      if (pl.path.some((p) => p.stair)) stairs++;
      if (pl.link.kind === 'drop') drops++;
    });
  }
  assert.ok(walked > 20 && stairs > 2 && drops > 1, `${walked} walked, ${stairs} with stairs, ${drops} drops`);
});

test('cellar space: closed doors hold until opened; walls stop the body', () => {
  for (const c of cellars) {
    const s = new DungeonSpace(c.layout);
    c.layout.links.forEach((pl, li) => {
      if (!['locked', 'secret', 'grate', 'blocked'].includes(pl.link.kind)) return;
      assert.ok(!walkThrough(c, s, li).ok, `${pl.link.kind} stops the body`);
      if (pl.link.kind === 'locked' || pl.link.kind === 'secret') {
        s.open.add(pl.link.id);
        assert.ok(walkThrough(c, s, li).ok, `${pl.link.kind} opened lets through`);
      }
    });
  }
});

test('cellar space: the hidden door is found by lingering at it, the key by entering its room', () => {
  const c = cellars.find((x) => x.layout.links.some((pl) => pl.link.kind === 'secret'))!;
  const s = new DungeonSpace(c.layout);
  const pl = c.layout.links.find((p) => p.link.kind === 'secret')!;
  const d = pl.doors[1];
  const x = (d.x + 0.5) * CELL + DIRS[d.dir][0] * 0.6, z = (d.z + 0.5) * CELL + DIRS[d.dir][1] * 0.6;
  let found = false;
  for (let t = 0; t < 60 && !found; t++) found = s.touch(x, d.level * STOREY, z, 1 / 30).some((e) => e.kind === 'found');
  assert.ok(found && s.open.has(pl.link.id));
});

test('cellar mesh: sound buffers, door pieces for every door with a state', () => {
  for (const c of cellars) {
    const m = cellarMeshes(c);
    for (const b of [m.shell, m.props, ...m.doors.map((d) => d.mesh)]) {
      const n = b.position.length / 3;
      assert.ok(n > 0 && b.normal.length === n * 3 && b.uv.length === n * 2 && b.mat.length === n && b.tint.length === n * 3);
      for (const i of b.index) assert.ok(i < n);
      assert.ok(b.position.every(Number.isFinite) && b.normal.every(Number.isFinite));
    }
    const stateful = c.graph.links.filter((l) => ['locked', 'oneway', 'secret'].includes(l.kind)).length;
    assert.equal(m.doors.length, stateful);
  }
});
