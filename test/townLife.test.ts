import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown, pointInPoly } from '@futuremagic/settlement';
import { goingThrough, roundTheWork, TownLife, type Agent } from '../src/sim/townLife';
import type { ActivityKind, Spot } from '../src/sim/spots';

// A town on flat land (no terrain needed): the plan is all the simulation reads.
const plan = planTown({ seed: 7, x: 0, z: 0, radius: 130, height: () => 10 });
/** Real seconds per game hour (a 24-minute day). */
const HOUR = 60;

test('town life: everyone has a home, the trades are worked, the stalls kept, the temple tended', () => {
  const life = new TownLife(plan, 7, 10);
  const roles = new Set(life.agents.map((a) => a.person.role));
  for (const r of ['trade', 'trader', 'homemaker', 'child']) assert.ok(roles.has(r as never), `a ${r}`);
  if (plan.buildings.some((b) => b.kind === 'temple')) assert.ok(roles.has('keeper'), 'a temple keeper');
  assert.ok(life.agents.length > 150, `${life.agents.length} people`);
});

test('town life: through a whole day nobody stands around, and everyone does several things', () => {
  const life = new TownLife(plan, 7, 6);
  const idle: ActivityKind[] = ['wait', 'stroll'];
  let idleS = 0, allS = 0, walkS = 0;
  // Indoors counts by the building: at work in the shop, at home, at the inn are different things.
  const did = life.agents.map(() => new Set<string>());
  const t0 = performance.now();
  for (let s = 0; s < 16 * HOUR; s += 1) {
    life.step(1, 6 + s / HOUR);
    for (const a of life.agents) {
      allS++;
      if (idle.includes(a.act)) idleS++;
      if (a.act === 'walk') walkS++;
      if (a.act !== 'walk') did[a.person.id].add(a.act === 'indoors' ? `in ${life.spots[a.spot]?.building}` : a.act);
    }
  }
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `${ms.toFixed(0)} ms for a day`);
  assert.ok(idleS / allS < 0.05, `idle ${((idleS / allS) * 100).toFixed(1)} %`);
  assert.ok(walkS / allS < 0.35, `walking ${((walkS / allS) * 100).toFixed(1)} %`);
  const adults = life.agents.filter((a) => a.person.role !== 'child');
  const few = adults.filter((a) => did[a.person.id].size < 3).length;
  assert.ok(few / adults.length < 0.05, `${few} of ${adults.length} adults did fewer than 3 things`);
});

test('town life: with the clock stopped the town keeps busy, and nobody seen out of doors is ever in a house\'s walls', () => {
  const life = new TownLife(plan, 7, 16);
  const inWalls: string[] = [];
  const busy = new Set<number>();
  for (let s = 0; s < 600; s++) {
    life.step(1, 16);
    for (const a of life.agents) {
      if (a.act === 'walk') busy.add(a.person.id);
      // Walking round a house, at work by it, at play before it (a walk once cut through the next house).
      if (!a.hidden && plan.buildings.some((b) => Math.abs(b.cx - a.x) < 12 && Math.abs(b.cz - a.z) < 12 && pointInPoly(b.poly, a.x, a.z))) inWalls.push(`${a.act} ${a.x.toFixed(1)}, ${a.z.toFixed(1)}`);
    }
  }
  assert.ok(busy.size > life.agents.length * 0.5, `${busy.size} of ${life.agents.length} went somewhere in 10 minutes`);
  assert.deepEqual(inWalls.slice(0, 5), [], `${inWalls.length} seen in a house's walls`);
});

test('town life: the VGM gathers the town on the market, then sends everyone indoors', () => {
  const life = new TownLife(plan, 7, 14);
  const [x, z] = plan.centre;
  life.order({ kind: 'gather', x, z, radius: 12, from: 14, to: 15 });
  life.order({ kind: 'stayIn', from: 15, to: 16 });
  for (let s = 0; s < 400; s++) life.step(1, 14);
  const there = life.agents.filter((a) => Math.hypot(a.x - x, a.z - z) < 20).length;
  assert.ok(there > life.agents.length * 0.8, `${there} of ${life.agents.length} gathered`);
  for (let s = 0; s < 400; s++) life.step(1, 15.5);
  const out = life.agents.filter((a) => !a.hidden).length;
  assert.ok(out < life.agents.length * 0.03, `${out} still out`);
});

test('town life: the same seed and steps give the same town', () => {
  const a = new TownLife(plan, 7, 9), b = new TownLife(plan, 7, 9);
  for (let s = 0; s < 120; s++) { a.step(0.5, 9); b.step(0.5, 9); }
  assert.deepEqual(a.agents.map((g) => [g.x, g.z, g.act]), b.agents.map((g) => [g.x, g.z, g.act]));
});

test('town life: the start town (D41) costs well under its 2 ms a frame', () => {
  const town = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const life = new TownLife(town, 3, 6);
  life.focus = { x: 0, z: 0 }; // the player in the middle: every walk in detail
  const frames = 4000, dt = 1 / 60;
  const ms: number[] = [];
  // Fifteen game hours in 4000 frames (much faster than D37's 60-minute day): the busiest mix of walks and choices.
  for (let f = 0; f < frames; f++) {
    const t0 = performance.now();
    life.step(dt * 13.5, 6 + (f / frames) * 15);
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  const mean = ms.reduce((s, x) => s + x, 0) / frames, p99 = ms[Math.floor(frames * 0.99)];
  // On a slow CI runner too: the budget is 2 ms, the check allows half of it on average.
  assert.ok(mean < 1, `mean ${mean.toFixed(3)} ms for ${life.agents.length} people`);
  assert.ok(p99 < 2, `99th percentile ${p99.toFixed(3)} ms`);
});

test('town life: orders are timed in game hours since the start, so a curfew on day 2 leaves day 1 alone', () => {
  const life = new TownLife(plan, 7, 14);
  life.order({ kind: 'stayIn', from: 24 + 14, to: 24 + 16 });
  for (let s = 0; s < 400; s++) life.step(1, 14.5);
  const outDay1 = life.agents.filter((a) => !a.hidden).length;
  for (let s = 0; s < 400; s++) life.step(1, 24 + 14.5);
  const outDay2 = life.agents.filter((a) => !a.hidden).length;
  assert.ok(outDay1 > life.agents.length * 0.2, `${outDay1} out on day 1`);
  assert.ok(outDay2 < life.agents.length * 0.03, `${outDay2} out under the curfew`);
});

test('town life: the elf walks in along a road, stays the night at the inn, and leaves by a road', () => {
  const life = new TownLife(plan, 7, 0);
  const elf = life.agents.find((a) => a.person.role === 'traveller')!;
  assert.ok(elf, 'a traveller');
  const inn = plan.buildings[elf.person.home];
  const fromCentre = () => Math.hypot(elf.x - plan.centre[0], elf.z - plan.centre[1]);
  const seen = new Set<string>();
  let farthest = 0, nearest = Infinity;
  life.focus = { x: plan.centre[0], z: plan.centre[1] };
  for (let s = 0; s < 72 * HOUR; s += 1) {
    life.step(1, s / HOUR);
    seen.add(elf.act);
    if (elf.act === 'away') { assert.ok(elf.hidden); farthest = Math.max(farthest, fromCentre()); }
    nearest = Math.min(nearest, Math.hypot(elf.x - inn.door[0], elf.z - inn.door[1]));
  }
  assert.ok(seen.has('away') && seen.has('walk') && seen.has('sleep'), [...seen].join(' '));
  assert.ok(farthest > plan.radius, `away at ${farthest.toFixed(0)} m from the centre`);
  assert.ok(nearest < 1, 'at the inn');
});

test('town life: two at one bench or table sit side by side, never in one place', () => {
  const life = new TownLife(plan, 7, 17);
  let shared = 0, pairs = 0;
  for (let s = 0; s < 900; s++) {
    life.step(1, 17 + s / HOUR);
    if (s % 10) continue;
    const at = life.agents.filter((a) => !a.hidden && a.act !== 'walk' && a.spot >= 0 && life.spots[a.spot].cap > 1);
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) {
      if (at[i].spot !== at[j].spot) continue;
      pairs++;
      if (Math.hypot(at[i].x - at[j].x, at[i].z - at[j].z) < 0.5) shared++;
    }
  }
  assert.ok(pairs > 0, 'some spots are shared');
  assert.equal(shared, 0, `${shared} of ${pairs} pairs in one place`);
});

test('town life: the hero walks around townsfolk, and is never stuck in one who walks into them', () => {
  const life = new TownLife(plan, 7, 12);
  const a = life.agents.find((x) => !x.hidden)!;
  assert.ok(life.touches(a.x + 0.4, a.z, 0.32, a.x + 3, a.z), 'blocked walking into them');
  assert.ok(!life.touches(a.x + 0.4, a.z, 0.32, a.x + 0.3, a.z), 'free when already touching');
  assert.ok(!life.touches(a.x + 2, a.z, 0.32, a.x + 3, a.z), 'free at a distance');
});

test('town life: someone at work behind a barrel comes round it to talk, and is seen walking there', () => {
  const s = { id: 0, activity: 'serve', use: 'work', cap: 1, secs: [30, 80], outside: true, x: 0, z: 0, dir: 0, building: -1, door: false, users: 1 } as Spot;
  const way = roundTheWork(s, { x: 0, z: 0 }, 2.5, 0.2)!;
  assert.ok(way, 'the barrel stands between them');
  const [tx, tz] = way.slice(-2), fx = 0.9, fz = 0;
  // From where they end up, the barrel is no longer in the way.
  const dx = 2.5 - tx, dz = 0.2 - tz, l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((fx - tx) * dx + (fz - tz) * dz) / l2));
  assert.ok(Math.hypot(tx + dx * t - fx, tz + dz * t - fz) > 0.75, 'in plain view');
  assert.ok(Math.hypot(tx - fx, tz - fz) > 1, 'beside it, not on it');
  assert.equal(roundTheWork(s, { x: 0, z: 0 }, -2, 0), null, 'from behind them nothing is in the way');
  assert.equal(roundTheWork({ ...s, activity: 'sell' }, { x: 0, z: 0 }, 2.5, 0.2), null, 'a seller talks across the stall');
  // In a town: held, they walk there and then talk, facing the hero.
  const life = new TownLife(plan, 7, 10);
  const a = life.agents.find((x) => x.spot >= 0 && ['smith', 'stoke', 'bake', 'craft', 'tend', 'serve', 'quench'].includes(life.spots[x.spot].activity) && !x.hidden);
  assert.ok(a, 'someone at their work');
  const sp = life.spots[a.spot], hx = sp.x + Math.cos(sp.dir) * 2.6, hz = sp.z + Math.sin(sp.dir) * 2.6;
  life.hold(a, hx, hz);
  assert.equal(a.act, 'walk');
  for (let i = 0; i < 20; i++) life.step(0.25, 10 + i / 14400);
  assert.equal(a.act, 'chat');
  assert.ok(Math.abs(Math.atan2(Math.sin(a.dir - Math.atan2(hz - a.z, hx - a.x)), Math.cos(a.dir - Math.atan2(hz - a.z, hx - a.x)))) < 0.01, 'facing the hero');
  life.letGo(a);
  assert.ok(!a.held);
});

test('town life: someone sitting on a bench talks sitting, as they sat, and gets up after', () => {
  const life = new TownLife(plan, 7, 10);
  let a: Agent | undefined;
  for (let i = 0; i < 400 && !a; i++) {
    life.step(5, 10 + i / 720);
    a = life.agents.find((x) => x.act === 'sit' && !x.hidden);
  }
  assert.ok(a, 'someone sits');
  const { x, z, dir } = a;
  life.hold(a, x + 1.5, z + 0.5);
  for (let i = 0; i < 8; i++) life.step(0.25, 11);
  assert.deepEqual([a.act, a.x, a.z, a.dir], ['sit', x, z, dir], 'still on their seat, not stood up in the bench');
  life.letGo(a);
  assert.ok(!a.held);
});

test('town life: a gate opens at night for someone on their way through it, not for someone going along the wall', () => {
  // A gateway at the origin; the wall runs along x.
  const walker = (x: number, z: number, path: number[]) => ({ x, z, act: 'walk', hidden: false, path, pi: 0 }) as unknown as Agent;
  assert.ok(goingThrough(walker(0, -15, [0, -5, 0, 10]), 0, 0, 22), 'coming up to it and on through');
  assert.ok(!goingThrough(walker(-15, 6, [-5, 6, 15, 6]), 0, 0, 22), 'along the street inside');
  assert.ok(!goingThrough(walker(0, -30, [0, 10]), 0, 0, 22), 'still too far off');
  assert.ok(!goingThrough({ ...walker(0, -5, [0, 10]), act: 'chat' } as Agent, 0, 0, 22), 'standing by it');
});
