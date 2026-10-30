import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown } from '@futuremagic/settlement';
import { TownLife } from '../src/sim/townLife';
import { roomCast } from '../src/sim/roomCast';

const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });

test('room cast: in the evening the houses have their people at table and hearth, each on a spot of their own, the inn its keeper at the counter', () => {
  const life = new TownLife(plan, 7, 19);
  for (let s = 0; s < 300; s++) life.step(1, 19);
  let cast = 0, rooms = 0;
  for (const b of plan.buildings) {
    const room = planInterior(b), c = roomCast(life.agents, life.spots, b.id, room);
    assert.equal(new Set(c.map((x) => x.spot)).size, c.length, 'one each');
    for (const x of c) assert.ok(x.agent.hidden || x.agent.act === 'drink' || x.agent.act === 'pray');
    if (c.length) rooms++;
    cast += c.length;
    if (b.kind === 'inn') {
      const keeper = c.find((x) => x.agent.person.work === b.id);
      if (keeper) assert.equal(room.spots[keeper.spot].kind, 'serve');
    }
  }
  assert.ok(rooms > plan.buildings.length * 0.3, `${rooms} of ${plan.buildings.length} rooms have somebody in`);
  assert.ok(cast > 50, `${cast} people cast`);
  // The same town, the same cast.
  const inn = plan.buildings.find((b) => b.kind === 'inn')!;
  assert.deepEqual(roomCast(life.agents, life.spots, inn.id, planInterior(inn)).map((x) => [x.agent.person.id, x.spot]), roomCast(life.agents, life.spots, inn.id, planInterior(inn)).map((x) => [x.agent.person.id, x.spot]));
});

test('room cast: the innkeeper held for a talk stays at the counter (holding shows them, which would drop them from the room)', () => {
  const life = new TownLife(plan, 7, 19);
  for (let s = 0; s < 300; s++) life.step(1, 19);
  const inn = plan.buildings.find((b) => b.kind === 'inn')!, room = planInterior(inn);
  const keeper = roomCast(life.agents, life.spots, inn.id, room).find((x) => x.agent.person.work === inn.id);
  assert.ok(keeper, 'the keeper is in');
  life.hold(keeper.agent, inn.cx, inn.cz);
  assert.equal(keeper.agent.hidden, false);
  const after = roomCast(life.agents, life.spots, inn.id, room).find((x) => x.agent === keeper.agent);
  assert.equal(after?.spot, keeper.spot);
});

test('room cast: drinkers at the inn tables sit on the benches, those at the counter stand', () => {
  const life = new TownLife(plan, 7, 19);
  for (let s = 0; s < 300; s++) life.step(1, 19);
  const inn = plan.buildings.find((b) => b.kind === 'inn')!, room = planInterior(inn);
  const benches = room.fixtures.filter((f) => f.kind === 'bench');
  const onBench = (i: number) => benches.some((f) => Math.abs(room.spots[i].a - f.a) <= f.w / 2 && Math.abs(room.spots[i].b - f.b) <= f.d / 2);
  const cast = roomCast(life.agents, life.spots, inn.id, room).filter((x) => room.spots[x.spot].kind === 'drink');
  assert.ok(cast.length > 2, `${cast.length} drinking`);
  for (const x of cast) assert.equal(x.act, onBench(x.spot) ? 'sit' : 'drink');
  assert.ok(cast.some((x) => x.act === 'sit'), 'somebody at a table');
});

test('room cast: someone stopped out of doors on their way into the inn stays out there with the hero', () => {
  const life = new TownLife(plan, 7, 19);
  for (let s = 0; s < 300; s++) life.step(1, 19);
  const inn = plan.buildings.find((b) => b.kind === 'inn')!, room = planInterior(inn);
  const outside = life.agents.find((a) => !a.hidden && a.act !== 'drink' && a.act !== 'pray');
  assert.ok(outside, 'somebody out of doors');
  // On their way in: the inn's door is where they are going.
  outside.spot = life.spots.findIndex((s) => s.door && s.building === inn.id);
  life.hold(outside, outside.x + 1, outside.z);
  assert.ok(!roomCast(life.agents, life.spots, inn.id, room).some((x) => x.agent === outside), 'not drawn at a spot in the room');
});

test('room cast: a guild hall\'s master stands by the practice post; nobody sits down to a family table there', () => {
  const life = new TownLife(plan, 7, 19);
  for (let s = 0; s < 300; s++) life.step(1, 19);
  let seen = 0;
  for (const b of plan.buildings.filter((x) => x.kind === 'house' || x.kind === 'cottage')) {
    const hall = planInterior(b, { hall: true }), before = roomCast(life.agents, life.spots, b.id, hall);
    if (!before.length) continue;
    const master = before[0].agent.person, was = master.work;
    master.work = b.id;
    const c = roomCast(life.agents, life.spots, b.id, hall).find((x) => x.agent.person === master)!;
    master.work = was;
    assert.equal(hall.spots[c.spot].kind, 'drill');
    assert.equal(c.act, 'browse');
    if (++seen >= 5) break;
  }
  assert.ok(seen >= 3, `${seen} halls with somebody in`);
});

test('room cast: one woken in bed for a talk (a teacher at night) is in the room, up from bed', () => {
  const life = new TownLife(plan, 7, 2);
  for (let s = 0; s < 300; s++) life.step(1, 2);
  const a = life.agents.find((x) => x.act === 'sleep' && x.spot >= 0 && life.spots[x.spot].door && planInterior(plan.buildings[life.spots[x.spot].building]).spots.some((s) => s.kind !== 'sleep'))!;
  assert.ok(a, 'somebody asleep at home');
  const b = plan.buildings[life.spots[a.spot].building], room = planInterior(b);
  assert.equal(roomCast(life.agents, life.spots, b.id, room).find((x) => x.agent === a)?.act, 'sleep');
  life.hold(a, b.door[0], b.door[1]);
  assert.equal(a.heldIn, true);
  const c = roomCast(life.agents, life.spots, b.id, room).find((x) => x.agent === a);
  assert.ok(c, 'still in the room');
  assert.notEqual(room.spots[c.spot].kind, 'sleep', 'up from bed');
});
