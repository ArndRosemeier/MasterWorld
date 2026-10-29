import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { buildingOf } from '../src/sim/people';
import { keptAt } from '../src/sim/marked';
import { TownLife, type Agent } from '../src/sim/townLife';

const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });
const HOUR = 150;
const inn = buildingOf(plan, 'inn')!;

/** Where the innkeeper is each half game-minute from 7:30 to 23:00 (the building of their spot, or -1 out on the streets). */
function innkeeperDay(marked: boolean): { at: number[]; who: Agent } {
  const life = new TownLife(plan, 7, 7.5);
  if (marked) life.keep(keptAt(plan, life.persons, [{ x: inn.door[0], z: inn.door[1] }]));
  const who = life.agents.find((a) => a.person.trade === 'innkeeper' && a.person.role === 'trade')!;
  const at: number[] = [];
  for (let s = 0; s < 15.5 * HOUR; s += 1) {
    life.step(1, 7.5 + s / HOUR);
    if (s % 2 === 0) at.push(who.act === 'walk' || who.spot < 0 ? -1 : life.spots[who.spot].building);
  }
  return { at, who };
}

test('marked: the inn door marked on the map keeps its innkeeper, not the rest of the household', () => {
  const life = new TownLife(plan, 7, 12);
  const kept = keptAt(plan, life.persons, [{ x: inn.door[0] + 0.5, z: inn.door[1] }]);
  const keeper = life.persons.find((p) => p.trade === 'innkeeper' && p.role === 'trade')!;
  assert.deepEqual([...kept], [[keeper.id, inn.id]]);
  // A mark out on the land keeps nobody; a named household member who lives there is kept, one living elsewhere is not.
  assert.equal(keptAt(plan, life.persons, [{ x: inn.door[0] + 40, z: inn.door[1] + 40 }]).size, 0);
  const home = plan.buildings.find((b) => b.kind === 'house')!;
  const there = life.persons.find((p) => p.home === home.id)!, elsewhere = life.persons.find((p) => p.home !== home.id && p.work !== home.id)!;
  assert.deepEqual([...keptAt(plan, life.persons, [{ x: home.door[0], z: home.door[1], who: [there.id, elsewhere.id] }])], [[there.id, home.id]]);
});

test('marked: a marked innkeeper stays in the inn all their waking day; unmarked they go about the town', () => {
  const free = innkeeperDay(false), kept = innkeeperDay(true);
  assert.ok(free.at.some((b) => b !== inn.id), 'unmarked, the innkeeper leaves the inn now and then');
  // Marked: once back in (they may have been out when the mark was made), never out again.
  const first = kept.at.indexOf(inn.id);
  assert.ok(first >= 0 && first < 120, `back in the inn soon (${first})`);
  const out = kept.at.slice(first).filter((b) => b !== inn.id).length;
  assert.equal(out, 0, `marked, out of the inn ${out} times`);
});

test('marked: a kept person is not sent across the town, and is let go when the mark is gone', () => {
  const life = new TownLife(plan, 7, 10);
  const who = life.agents.find((a) => a.person.trade === 'innkeeper' && a.person.role === 'trade')!;
  life.keep(new Map([[who.person.id, inn.id]]));
  life.seek(who, inn.door[0] + 30, inn.door[1], { x: 0, z: 0 }, 60);
  assert.equal(who.seek, undefined, 'not sent');
  assert.ok(life.isKept(who.person.id));
  life.keep(new Map());
  assert.ok(!life.isKept(who.person.id));
});
