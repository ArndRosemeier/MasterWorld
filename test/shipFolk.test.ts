import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planShip, shipFloors, shipWall } from '@futuremagic/settlement';
import { PASSENGER_POSTS, crewOf, crewPost, passengerPost, type VesselState } from '../src/sim/shipFolk';

// S3: the crew at work stand on the vessel's floors, clear of its walls, masts and each other, whatever it is doing.
test('ship folk: every crew post stands on a floor, clear of walls and of the others, at the berth, under sail and at the ground', () => {
  for (const kind of ['ship', 'boat'] as const) for (const seed of [1, 2, 3, 7]) {
    const plan = planShip(seed, kind), crew = crewOf(plan, seed, `v${seed}`);
    assert.ok(crew.length >= (kind === 'ship' ? 5 : 2), `${kind} ${seed}: ${crew.length} aboard`);
    assert.deepEqual(crewOf(plan, seed, `v${seed}`), crew, 'seeded');
    for (const state of ['moored', 'sailing', 'lying'] as VesselState[]) {
      // (A ship's passengers too, where they stand among the crew.)
      const posts = [...crew.map((h, k) => crewPost(plan, h, k, state)), ...(kind === 'ship' ? Array.from({ length: PASSENGER_POSTS }, (_, k) => passengerPost(plan, k)) : [])];
      for (const [k, p] of posts.entries()) {
        const what = `${kind} ${seed} ${state} ${crew[k]?.job ?? `passenger ${k - crew.length}`} at ${p.a.toFixed(2)}, ${p.b.toFixed(2)}`;
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

test('ship passengers: a harbour inn\'s travellers by sea wait aboard at the end of each visit, out of town then, and back where they were after', async () => {
  const { Decks } = await import('../src/world/deck');
  const { ShipCrews } = await import('../src/game/shipCrews');
  const { townsfolk, away, aboardAt } = await import('../src/sim/people');
  const { standingAgent } = await import('../src/sim/townLife');
  const { frontierLand } = await import('./frontierLand');
  const { home, terrain } = frontierLand();
  const plan = terrain.town(home.id)!.plan, folk = townsfolk(plan, home.seed ?? 0);
  const sea = folk.filter((p) => p.bySea);
  assert.equal(sea.length, 3, 'three travellers by sea at the harbour inn');
  assert.ok(sea.every((p) => p.role === 'traveller' && plan.buildings[p.home].kind === 'inn'));
  // Somewhen in three days each is aboard, and then out of town.
  const hours = (p: (typeof sea)[number]) => Array.from({ length: 72 * 4 }, (_, i) => i / 4).filter((h) => aboardAt(p, h));
  for (const p of sea) { const hs = hours(p); assert.ok(hs.length >= 4, `${hs.length / 4} h aboard`); assert.ok(hs.every((h) => away(p, h))); }
  const h = hours(sea[0])[0], agents = folk.map((p) => standingAgent(p, plan.centre[0], plan.centre[1], 0, 'wait', p.seed));
  const ship = planShip(4, 'ship'), decks = new Decks(), crews = new ShipCrews(1);
  decks.move(`${home.id}/0`, ship, { x: home.x, y: 0, z: home.z - 300, ux: 1, uz: 0, pitch: 0, roll: 0 }, null);
  const life = { agents } as unknown as import('../src/sim/townLife').TownLife;
  crews.atWork(decks, h, (id) => (id === home.id ? life : null));
  const on = crews.passengers;
  assert.ok(on.length >= 1 && on.some((p) => p.agent.person === sea[0]), `${on.length} aboard`);
  for (const p of on) assert.ok(Math.hypot(p.x - home.x, p.z - (home.z - 300)) < ship.length / 2 && p.agent.x === p.x, 'on the ship, and there for the talk');
  crews.atWork(decks, h + 12, (id) => (id === home.id ? life : null));
  assert.equal(crews.passengers.length, 0, 'sailed');
  assert.deepEqual([on[0].agent.x, on[0].agent.z], [plan.centre[0], plan.centre[1]], 'back where they were in town');
});
