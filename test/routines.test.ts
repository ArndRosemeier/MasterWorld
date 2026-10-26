import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { routines } from '../src/setting/classic/routines';
import { validateRoutines, type RoutinesDef } from '../src/setting/contract';
import { dayPlan, isRestDay, taskAt } from '../src/sim/routines';
import { TownLife, type Agent } from '../src/sim/townLife';

const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });
/** Real seconds per game hour (D37: a 60-minute day). */
const HOUR = 150;

/** A town run from `from` to `to` game hours since the start, a step of `dt` real seconds. */
function run(from: number, to: number, dt = 1): TownLife {
  const life = new TownLife(plan, 7, from);
  for (let s = 0; s < (to - from) * HOUR; s += dt) life.step(dt, from + s / HOUR);
  return life;
}
const out = (life: TownLife, who: (a: Agent) => boolean = () => true) => life.agents.filter((a) => who(a) && !a.hidden).length;
const building = (life: TownLife, a: Agent) => (a.spot >= 0 ? life.spots[a.spot].building : -1);

test('routines: the classic setting\'s days are valid, and broken ones are caught', () => {
  assert.deepEqual(validateRoutines(routines, 'classic'), []);
  const bad: RoutinesDef = { ...routines, restDay: 9, roles: { ...routines.roles, child: { workday: [{ at: 3, do: 'play' }, { at: 2, do: 'nap' as never }] } } };
  const errors = validateRoutines(bad, 'bad');
  for (const e of ['restDay', 'start at hour 0', 'must rise', 'unknown']) assert.ok(errors.some((x) => x.includes(e)), `caught: ${e}`);
});

test('routines: everyone keeps their own hours, a little different each day, the same for a seed', () => {
  const life = new TownLife(plan, 7, 0);
  const wake = (a: Agent, day: number) => { const p = dayPlan(routines, a.person, day); return p.at[p.task.findIndex((t) => t !== 'sleep')]; };
  const adults = life.agents.filter((a) => a.person.role === 'homemaker');
  const first = adults.map((a) => wake(a, 0));
  assert.ok(Math.max(...first) - Math.min(...first) > 1, 'early risers and late ones');
  assert.ok(adults.some((a) => wake(a, 0) !== wake(a, 1)), 'days vary');
  assert.deepEqual(first, new TownLife(plan, 7, 0).agents.filter((a) => a.person.role === 'homemaker').map((a) => wake(a, 0)));
  // The sociable go to the inn on more evenings than the shy.
  const innDays = (a: Agent) => { let n = 0; for (let d = 0; d < 6; d++) if (taskAt(dayPlan(routines, a.person, d), 20) === 'inn') n++; return n; };
  const masters = life.agents.filter((a) => a.person.role === 'trade' && a.person.trade !== 'innkeeper' && a.person.trade !== 'baker');
  const social = masters.filter((a) => a.person.social > 0.7), shy = masters.filter((a) => a.person.social < 0.3);
  const mean = (xs: Agent[]) => xs.reduce((s, a) => s + innDays(a), 0) / xs.length;
  assert.ok(mean(social) > mean(shy) * 2, `inn evenings: sociable ${mean(social).toFixed(2)}, shy ${mean(shy).toFixed(2)}`);
});

test('routines: after dark the streets empty, the children first', () => {
  const evening = run(17, 20);
  const kids = out(evening, (a) => a.person.role === 'child');
  assert.equal(kids, 0, `${kids} children out at 20:00`);
  assert.ok(out(evening) < evening.agents.length * 0.15, `${out(evening)} of ${evening.agents.length} out at 20:00`);
  const inn = evening.agents.filter((a) => building(evening, a) === plan.buildings.find((b) => b.kind === 'inn')!.id && a.person.work !== building(evening, a));
  assert.ok(inn.length >= 10, `${inn.length} guests at the inn at 20:00`);
  const night = run(22, 24 + 2);
  assert.ok(out(night) < night.agents.length * 0.01, `${out(night)} out at 2:00`);
  assert.ok(night.agents.filter((a) => a.act === 'sleep').length > night.agents.length * 0.95, 'everyone abed');
});

test('routines: by day the trades are at their own work, the children at play, the baker up before dawn', () => {
  const day = run(9, 10.5);
  const masters = day.agents.filter((a) => a.person.role === 'trade' && a.person.work >= 0);
  const atWork = masters.filter((a) => building(day, a) === a.person.work).length;
  assert.ok(atWork > masters.length * 0.8, `${atWork} of ${masters.length} masters at their own work`);
  const kids = day.agents.filter((a) => a.person.role === 'child');
  const playing = kids.filter((a) => a.act === 'play' || (a.act === 'walk' && a.next === 'play')).length;
  assert.ok(playing > kids.length * 0.5, `${playing} of ${kids.length} children at play`);
  const dawn = run(2, 4.5);
  const baker = dawn.agents.find((a) => a.person.trade === 'baker' && a.person.role === 'trade')!;
  assert.ok(baker && building(dawn, baker) === baker.person.work && baker.act !== 'sleep', `the baker ${baker?.act}`);
  const smith = dawn.agents.find((a) => a.person.trade === 'smith' && a.person.role === 'trade')!;
  assert.equal(smith.act, 'sleep', 'the smith still asleep');
});

test('routines: every seventh day the town gathers at the temple in the morning, and nobody works the shops', () => {
  const rest = routines.restDay;
  assert.ok(isRestDay(routines, rest) && !isRestDay(routines, rest + 1) && isRestDay(routines, rest + routines.week));
  const temple = plan.buildings.find((b) => b.kind === 'temple');
  assert.ok(temple, 'the town has a temple');
  const life = run(rest * 24 + 8, rest * 24 + 10.5);
  const there = life.agents.filter((a) => building(life, a) === temple!.id && a.act !== 'walk').length;
  assert.ok(there > life.agents.length * 0.5, `${there} of ${life.agents.length} at the temple`);
  const working = life.agents.filter((a) => a.person.role === 'trade' && a.person.trade !== 'innkeeper' && a.spot >= 0 && life.spots[a.spot].use === 'work').length;
  assert.ok(working <= 2, `${working} at their tools on the rest day`);
  // A working day at the same hour: the temple is quiet.
  const work = run((rest + 1) * 24 + 8, (rest + 1) * 24 + 10.5);
  const quiet = work.agents.filter((a) => building(work, a) === temple!.id).length;
  assert.ok(quiet < work.agents.length * 0.05, `${quiet} at the temple on a working day`);
});
