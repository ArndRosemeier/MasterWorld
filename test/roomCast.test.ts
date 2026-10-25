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
