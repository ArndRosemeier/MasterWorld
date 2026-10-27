import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planInterior, planTown } from '@futuremagic/settlement';
import { TownLife } from '../src/sim/townLife';
import { roomCast } from '../src/sim/roomCast';
import { RoomFlow } from '../src/sim/roomFlow';

const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });
const inn = plan.buildings.find((b) => b.kind === 'inn')!, room = planInterior(inn);

function evening(): { life: TownLife; flow: RoomFlow } {
  const life = new TownLife(plan, 7, 19);
  for (let s = 0; s < 300; s++) life.step(1, 19);
  return { life, flow: new RoomFlow(room) };
}

test('room flow: those in when the room opens are at their places, seated ones on the bench top', () => {
  const { life, flow } = evening();
  const cast = roomCast(life.agents, life.spots, inn.id, room, flow.kept);
  assert.ok(cast.length >= 2, `${cast.length} in the inn`);
  const at = flow.frame(cast, 1 / 60);
  assert.equal(at.length, cast.length);
  for (const p of at) assert.notEqual(p.act, 'walk');
  const seated = at.filter((p) => p.act === 'sit');
  assert.ok(seated.length, 'somebody sits');
  for (const p of seated) assert.equal(p.seat, 0.45);
});

test('room flow: one who comes in walks from the door to their place; the rest keep theirs', () => {
  const { life, flow } = evening();
  const cast = roomCast(life.agents, life.spots, inn.id, room, flow.kept);
  const late = cast[cast.length - 1].agent;
  const before = flow.frame(cast.filter((c) => c.agent !== late), 1 / 60);
  const now = roomCast(life.agents, life.spots, inn.id, room, flow.kept);
  // Everyone keeps the place they had.
  for (const p of before) assert.equal(now.find((c) => c.agent === p.agent)?.spot, cast.find((c) => c.agent === p.agent)!.spot);
  let at = flow.frame(now, 1 / 60).find((p) => p.agent === late)!;
  assert.equal(at.act, 'walk');
  assert.ok(Math.hypot(at.a - flow.door[0], at.b - flow.door[1]) < 0.2, 'from the door');
  const spot = room.spots[now.find((c) => c.agent === late)!.spot];
  for (let k = 0; k < 60 * 30 && at.act === 'walk'; k++) at = flow.frame(now, 1 / 60).find((p) => p.agent === late)!;
  assert.notEqual(at.act, 'walk', 'there within half a minute');
  assert.deepEqual([at.a, at.b], [spot.a, spot.b]);
});

test('room flow: one who leaves walks to the door, kept on the doorstep meanwhile, and is gone there', () => {
  const { life, flow } = evening();
  const cast = roomCast(life.agents, life.spots, inn.id, room, flow.kept);
  flow.frame(cast, 1 / 60);
  const goer = cast.find((c) => c.agent.person.work !== inn.id)!.agent;
  goer.act = 'walk';
  goer.hidden = false;
  const rest = cast.filter((c) => c.agent !== goer);
  let at = flow.frame(rest, 1 / 60).find((p) => p.agent === goer);
  assert.equal(at?.act, 'walk');
  assert.deepEqual(flow.leaving, [goer]);
  let last = at!;
  for (let k = 0; k < 60 * 30 && at; k++) { last = at; at = flow.frame(rest, 1 / 60).find((p) => p.agent === goer); }
  assert.equal(at, undefined, 'gone within half a minute');
  assert.ok(Math.hypot(last.a - flow.door[0], last.b - flow.door[1]) < 0.1, 'at the door');
  assert.deepEqual(flow.leaving, []);
});

test('town life: someone lingering (still walking out through an open room) stays on the doorstep until the time is up', () => {
  const { life } = evening();
  const a = life.agents.find((x) => !x.hidden && x.act === 'walk' && x.path.length > 4) ?? life.agents[0];
  const at = [a.x, a.z];
  life.linger(a, 2);
  for (let k = 0; k < 10; k++) life.step(0.1, 19);
  assert.deepEqual([a.x, a.z], at);
  for (let k = 0; k < 30; k++) life.step(0.1, 19);
  assert.equal(a.stay, undefined);
});
