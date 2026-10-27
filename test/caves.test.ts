import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { CELL, STOREY, outlineCellar } from '../src/world/dungeon/cellar';
import { CaveSpace, caveField, caveShell } from '../src/world/dungeon/caveRock';
import { caveMouth, MOUTH_WAY_DOWN } from '../src/world/dungeon/caveMouth';
import { inWalkRaster } from '../src/world/dungeon/rockMesh';
import { inTowerShape, TOWER_WAY_IN, towerMesh, towerSize } from '../src/world/dungeon/towerMesh';
import { inFrame, onLand } from '../src/world/dungeon/site';
import { torchSpots } from '../src/world/dungeon/torches';
import { cellarMeshes } from '../src/world/dungeon/cellarMesh';
import { BuildingMat, WildMat } from '../src/world/dungeon/meshKit';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonSpace } from '../src/world/dungeon/space';
import { DungeonNav, navKey } from '../src/sim/dungeonNav';

const cave = (n: number) => outlineCellar(testDecision(n, 1, 'cave'), testHouse(n), classic.dungeons.cave!);

test('cave: its rock leaves every room and way walkable, and the walker reads the rock it sees', () => {
  const c = cave(3), field = caveField(c.layout, 3), space = new CaveSpace(c.layout, field);
  // In the middle of every room and every passage cell, a body stands clear of the rock at chest height.
  for (const r of c.layout.rooms) {
    const x = (r.x + r.w / 2) * CELL, z = (r.z + r.d / 2) * CELL, y = r.level * STOREY + 1.1;
    assert.ok(space.sdf(x, y, z) > 0.45, `room ${r.id}: ${space.sdf(x, y, z).toFixed(2)}`);
  }
  for (const pl of c.layout.links) for (const p of pl.path) {
    if (p.stair) continue;
    const x = (p.x + 0.5) * CELL, z = (p.z + 0.5) * CELL, y = p.level * STOREY + 1.1;
    assert.ok(space.sdf(x, y, z) > 0.32, `passage ${pl.link.id} at ${p.x},${p.z}: ${space.sdf(x, y, z).toFixed(2)}`);
  }
  // Rock all round: a few metres outside the space is solid.
  const r0 = c.layout.rooms[0];
  assert.ok(space.sdf(r0.x * CELL - 3, r0.level * STOREY + 1, r0.z * CELL - 3) < 0);
  // Its mesh: rock and silt, no torches (the lantern is all the light).
  const m = caveShell(field, c.layout, 3);
  assert.ok(m.index.length / 3 > 3000, `${m.index.length / 3} triangles`);
  assert.ok([...new Set(m.mat)].every((x) => x === 10 || x === 15), 'rock and earth only');
  assert.deepEqual(torchSpots(c), []);
});

test('cave mouth: a crag on the hillside, its way in open from the land to the way down', () => {
  const slope = (x: number, z: number) => -z * 0.25 + Math.sin(x * 0.3) * 0.2;
  const m = caveMouth(5, slope);
  assert.ok(m.mesh.index.length > 0);
  // Straight in from the front to the way down, a body is never in the rock's way.
  for (let z = 4; z >= MOUTH_WAY_DOWN.z; z -= 0.25) assert.ok(!inWalkRaster(m.walk, 0, z), `blocked at z ${z}`);
  // Beside the mouth and behind it, the crag is in the way.
  assert.ok(inWalkRaster(m.walk, 3.6, -3) || inWalkRaster(m.walk, -3.6, -3), 'flanks of rock');
  assert.ok(inWalkRaster(m.walk, 0, -9), 'rock over the way down');
  // Seeded.
  assert.deepEqual(caveMouth(5, slope).mesh.position, m.mesh.position);
});

test('tower: a keep with its doorway open, its walls in the way, sized to its rooms', () => {
  const size = towerSize(12, 14, 4), mesh = towerMesh(size, 9);
  assert.ok(mesh.index.length / 3 > 1000);
  assert.ok(!inTowerShape(size, TOWER_WAY_IN.x, TOWER_WAY_IN.z, 0.32), 'the way in is open');
  assert.ok(!inTowerShape(size, 0, 2, 0.32), 'in front of the door is open');
  assert.ok(inTowerShape(size, size.half - 0.5, -3, 0.32), 'a wall');
  assert.ok(inTowerShape(size, 0, -size.depth / 2, 0.32), 'the keep itself');
  assert.deepEqual(towerMesh(size, 9).position, mesh.position);
});

test('site: a frame turned onto the land and back', () => {
  const s = { x: 100, z: -40, yaw: 0.7 };
  const [x, z] = onLand(s, 2, -5), [u, v] = inFrame(s, x, z);
  assert.ok(Math.abs(u - 2) < 1e-9 && Math.abs(v + 5) < 1e-9);
  // Facing in (−z of the frame) is facing the walker's way at yaw: (−sin, −cos).
  const [ax, az] = onLand(s, 0, -1);
  assert.ok(Math.abs(ax - s.x + Math.sin(s.yaw)) < 1e-9 && Math.abs(az - s.z + Math.cos(s.yaw)) < 1e-9);
});

test('tower: no way steps off the side of its own stair onto the way above or below, and every room is reached', () => {
  for (let n = 0; n < 30; n++) {
    const c = outlineCellar(testDecision(n, 1, 'tower'), testHouse(n), classic.dungeons.tower!);
    const space = new DungeonSpace(c.layout), nav = new DungeonNav(space);
    for (const pl of c.layout.links) space.open.add(pl.link.id);
    for (const pl of c.layout.links) for (const p of pl.path) {
      const a = nav.cell(p.x, p.z, p.level);
      if (!a) continue;
      for (const b of nav.neighbours(a)) {
        if (nav.roomOf(b) >= 0) continue;
        const dy = Math.abs(nav.centre(a).y - nav.centre(b).y);
        assert.ok(dy < 1.5, `tower ${n}: ${p.x},${p.z} to ${b.i},${b.j} falls ${dy.toFixed(1)} m`);
      }
    }
    const h = c.hatch, from = nav.distances(nav.at(h.x - Math.sin(h.yaw), h.y + 0.3, h.z - Math.cos(h.yaw))!, 400);
    for (const r of c.layout.rooms) assert.ok(from.has(navKey(nav.cell(r.x + (r.w >> 1), r.z + (r.d >> 1), r.level)!)), `tower ${n}: room ${r.id} reached`);
  }
});

test('cave: no wooden doors in the rock; a wedged boulder or an iron grate where a way is shut', () => {
  let seen = 0;
  for (let n = 1; n <= 30; n++) {
    const c = cave(n), ms = cellarMeshes(c);
    for (const d of ms.doors) {
      if (d.kind !== 'oneway' && d.kind !== 'locked') continue;
      const ladder = c.setPiece.id === 'pulled-ladder' && d.link === c.pieceLink;
      const mats = new Set(d.mesh.mat);
      if (!ladder) assert.ok(!mats.has(BuildingMat.Oak), `cave ${n}: a wooden ${d.kind} door`);
      assert.ok(mats.has(d.kind === 'locked' ? BuildingMat.Slate : WildMat.Rock), `cave ${n}: ${d.kind} of ${[...mats]}`);
      seen++;
    }
  }
  assert.ok(seen > 5, `${seen} shut ways seen`);
});

test('tower: weathered stone, greyed and greened, never pastel; its foot darker than its walls', () => {
  const m = towerMesh(towerSize(12, 16, 4), 7);
  let foot = 0, nf = 0, wall = 0, nw = 0;
  for (let v = 0; v < m.position.length / 3; v++) {
    if (m.mat[v] !== BuildingMat.Ashlar) continue;
    const [r, g, b] = [m.tint[3 * v], m.tint[3 * v + 1], m.tint[3 * v + 2]];
    assert.ok(b <= g + 3 && r - g <= 16, `a pastel stone: ${r},${g},${b}`);
    const y = m.position[3 * v + 1], l = r + g + b;
    // The faces outside are cut where the damp is darkest (0.9 m up) and where it has gone (3.2 m).
    if (Math.abs(y - 0.9) < 1e-4) { foot += l; nf++; } else if (Math.abs(y - 3.2) < 1e-4) { wall += l; nw++; }
  }
  assert.ok(nf > 20 && nw > 20);
  assert.ok(foot / nf < (wall / nw) * 0.7, `foot ${(foot / nf).toFixed(0)} vs wall ${(wall / nw).toFixed(0)}`);
});
