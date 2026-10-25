import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown, pointInPoly } from '@futuremagic/settlement';
import { TownLife } from '../src/sim/townLife';
import type { ActivityKind } from '../src/sim/spots';

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
  const did = life.agents.map(() => new Set<ActivityKind>());
  const t0 = performance.now();
  for (let s = 0; s < 16 * HOUR; s += 1) {
    life.step(1, 6 + s / HOUR);
    for (const a of life.agents) {
      allS++;
      if (idle.includes(a.act)) idleS++;
      if (a.act === 'walk') walkS++;
      if (a.act !== 'walk') did[a.person.id].add(a.act);
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

test('town life: with the clock stopped the town keeps busy, and walkers keep to the streets', () => {
  const life = new TownLife(plan, 7, 16);
  let walking = 0, inside = 0;
  const busy = new Set<number>();
  for (let s = 0; s < 600; s++) {
    life.step(1, 16);
    for (const a of life.agents) {
      if (a.act !== 'walk') continue;
      busy.add(a.person.id);
      walking++;
      if (plan.buildings.some((b) => Math.abs(b.cx - a.x) < 12 && Math.abs(b.cz - a.z) < 12 && pointInPoly(b.poly, a.x, a.z))) inside++;
    }
  }
  assert.ok(busy.size > life.agents.length * 0.5, `${busy.size} of ${life.agents.length} went somewhere in 10 minutes`);
  assert.ok(inside / walking < 0.03, `${((inside / walking) * 100).toFixed(1)} % of walking steps inside a house`);
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
