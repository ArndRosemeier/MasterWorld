import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { STOREY, outlineCellar } from '../src/world/dungeon/cellar';
import { DungeonSpace } from '../src/world/dungeon/space';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { DungeonGround } from '../src/sim/dungeonNav';
import { VISIT, Visitor } from '../src/game/visitor';

const cellars = Array.from({ length: 6 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar));

test('visitor: the household comes from the ladder to the hero in the farthest room, thanks them and goes back', () => {
  for (const c of cellars) {
    const s = new DungeonSpace(c.layout);
    for (const pl of c.layout.links) s.open.add(pl.link.id);
    const ground = new DungeonGround(s), h = c.hatch;
    // The hero in the room farthest from the ladder (its floor's middle).
    const cell = c.layout.scale.cell, far = (r: { x: number; z: number; w: number; d: number }) => Math.hypot((r.x + r.w / 2) * cell - h.x, (r.z + r.d / 2) * cell - h.z);
    const room = [...c.layout.rooms].sort((a, b) => far(b) - far(a))[0];
    assert.ok(far(room) > 15, 'a room well away from the ladder');
    const hero = { x: (room.x + room.w / 2) * cell, y: room.level * STOREY, z: (room.z + room.d / 2) * cell };
    const v = new Visitor(ground, { x: h.x, y: h.y, z: h.z });
    let came = -1;
    for (let t = 0; t < 120 * 30 && came < 0; t++) if (v.step(1 / 30, hero) === 'thanks') came = t;
    assert.ok(came >= 0, `${c.decision.id}: came to the hero (stuck at ${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}, hero ${hero.x},${hero.y},${hero.z})`);
    assert.ok(Math.hypot(v.x - hero.x, v.z - hero.z) < VISIT.near * 2, 'a step or two short of the hero');
    assert.equal(v.phase, 'thank');
    // Facing the hero.
    const look = Math.atan2(hero.z - v.z, hero.x - v.x);
    assert.ok(Math.abs(Math.atan2(Math.sin(v.dir - look), Math.cos(v.dir - look))) < 0.2, 'faces the hero');
    // The thanks once; then they wait a while and go back to the ladder.
    let gone = false, thanks = 0;
    for (let t = 0; t < 200 * 30 && !gone; t++) {
      const e = v.step(1 / 30, hero);
      if (e === 'thanks') thanks++;
      if (e === 'gone') gone = true;
    }
    assert.equal(thanks, 0, 'thanks are said once');
    // (A drop on the way is not climbed back up: then they wait by the hero.)
    if (!gone) assert.equal(v.phase, 'back');
    else assert.ok(Math.hypot(v.x - h.x, v.z - h.z) < 0.5, 'back at the ladder');
  }
});

test('visitor: never walks through a wall on the way', () => {
  const c = cellars[1], s = new DungeonSpace(c.layout);
  for (const pl of c.layout.links) s.open.add(pl.link.id);
  const h = c.hatch, room = c.layout.rooms[c.layout.rooms.length - 1], cell = c.layout.scale.cell;
  const hero = { x: (room.x + room.w / 2) * cell, y: room.level * STOREY, z: (room.z + room.d / 2) * cell };
  const v = new Visitor(new DungeonGround(s), { x: h.x, y: h.y, z: h.z });
  for (let t = 0; t < 60 * 30 && v.phase === 'come'; t++) {
    v.step(1 / 30, hero);
    assert.ok(s.sdf(v.x, v.y + 1, v.z) > 0, `in the open at ${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`);
  }
});

test('visitor: one of a household waits outside a place on the land, where the town lives round them, and goes home after', async () => {
  const { Township } = await import('../src/game/township');
  const { frontierLand } = await import('./frontierLand');
  const { seed, terrain } = frontierLand();
  const town = terrain.towns[0];
  const t = new Township(town, { seed, setting: classic, log: () => [], hours: () => 30 });
  const person = t.life.agents.find((a) => a.person.role !== 'child' && !a.post)!.person.id;
  const at = { x: town.decision.x + 900, z: town.decision.z };
  const a = t.waitAt('dungeon-1', person, at.x, at.z, 0);
  assert.ok(a, 'they go');
  assert.equal(t.waiterOf('dungeon-1'), a);
  assert.equal(t.waitAt('dungeon-1', person, at.x, at.z, 0), a, 'once');
  assert.ok(Math.hypot(a.x - at.x, a.z - at.z) < 0.01 && !a.hidden && a.act === 'wait', 'standing there');
  assert.ok(t.posts.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 0.01), 'a post: the town lives round them');
  t.waitOver('dungeon-1');
  assert.equal(t.waiterOf('dungeon-1'), null);
  assert.ok(a.hidden && !a.post, 'gone home');
});
