import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planShip, shipFloors, shipWall } from '@futuremagic/settlement';
import { crewOf, crewPost, type VesselState } from '../src/sim/shipFolk';

// S3: the crew at work stand on the vessel's floors, clear of its walls, masts and each other, whatever it is doing.
test('ship folk: every crew post stands on a floor, clear of walls and of the others, at the berth, under sail and at the ground', () => {
  for (const kind of ['ship', 'boat'] as const) for (const seed of [1, 2, 3, 7]) {
    const plan = planShip(seed, kind), crew = crewOf(plan, seed, `v${seed}`);
    assert.ok(crew.length >= (kind === 'ship' ? 5 : 2), `${kind} ${seed}: ${crew.length} aboard`);
    assert.deepEqual(crewOf(plan, seed, `v${seed}`), crew, 'seeded');
    for (const state of ['moored', 'sailing', 'lying'] as VesselState[]) {
      const posts = crew.map((h, k) => crewPost(plan, h, k, state));
      for (const [k, p] of posts.entries()) {
        const what = `${kind} ${seed} ${state} ${crew[k].job} at ${p.a.toFixed(2)}, ${p.b.toFixed(2)}`;
        assert.ok(shipFloors(plan, p.a, p.b).some((f) => Math.abs(f - p.h) < 0.05), `${what}: on a floor (${shipFloors(plan, p.a, p.b).join(', ')} vs ${p.h.toFixed(2)})`);
        assert.ok(!shipWall(plan, p.a, p.b, 0.3, p.h), `${what}: in a wall`);
        for (const q of posts.slice(k + 1)) assert.ok(Math.hypot(q.a - p.a, q.b - p.b) > 0.7 || Math.abs(q.h - p.h) > 1.5, `${what}: in another`);
      }
    }
  }
});

test('ship crews: carried with their vessel as it turns and rolls, facing its way, and solid', async () => {
  const { Decks, toWorld } = await import('../src/world/deck');
  const { ShipCrews } = await import('../src/game/shipCrews');
  const plan = planShip(5, 'ship'), decks = new Decks(), crews = new ShipCrews(9);
  const pose = { x: 100, y: 0.3, z: -40, ux: 0, uz: 1, pitch: 0.02, roll: -0.05 };
  decks.move('t/0', plan, pose, null, true);
  const at = crews.atWork(decks);
  assert.equal(at.length, crewOf(plan, 9, 't/0').length);
  const helm = at[1], post = crewPost(plan, crewOf(plan, 9, 't/0')[1], 1, 'sailing'), w = toWorld(pose, post.a, post.h, post.b);
  assert.deepEqual([helm.x, helm.y, helm.z], [w.x, w.y, w.z], 'where the ship carries the post');
  // Heading along +z, facing the bow: dir (xz atan2) is +z.
  assert.ok(Math.abs(helm.dir - Math.PI / 2) < 1e-9, `facing ${helm.dir}`);
  assert.ok(crews.inCrew(helm.x + 0.4, helm.z, 0.32, helm.y), 'a body against them is stopped');
  assert.ok(!crews.inCrew(helm.x + 0.4, helm.z, 0.32, helm.y + 3), 'not one a deck above');
  assert.equal(crews.atWork(decks)[1].agent, helm.agent, 'the same people from frame to frame');
});
