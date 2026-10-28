import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HitchLog } from '../src/app/hitchLog';

/** A log on a fake clock: `tick(ms)` moves it on. */
function clocked(heap = () => 0) {
  let t = 0;
  const events: { t: number; ms: number; what: string; kind: string }[] = [];
  const log = new HitchLog(() => t, { events }, heap);
  return { log, events, tick: (ms: number) => { t += ms; }, get t() { return t; } };
}

test('a slow frame is kept with its costliest parts, a quick one is not', () => {
  const c = clocked();
  for (let i = 0; i < 3; i++) { c.log.startFrame(); c.log.part('towns'); c.tick(5); c.log.part('render'); c.tick(5); c.log.endFrame(); c.tick(6); }
  c.log.startFrame(); c.log.part('towns'); c.tick(400); c.log.part('render'); c.tick(5); c.log.endFrame(); c.tick(6);
  c.log.startFrame();
  assert.equal(c.log.hitches.length, 1);
  const h = c.log.hitches[0];
  assert.equal(Math.round(h.ms), 411);
  assert.equal(h.parts[0][0], 'towns');
  assert.equal(Math.round(h.outside), 6);
  assert.match(c.log.report(), /1 slow frames .* of 5/);
});

test('time outside the loop, worker answers and shader builds in it are named', () => {
  const c = clocked();
  c.log.startFrame(); c.log.part('a'); c.tick(5); c.log.endFrame();
  c.tick(200);
  c.log.note('terrain:chunk'); c.log.note('terrain:chunk');
  c.events.push({ t: c.t, ms: 30, what: 'Mesh', kind: 'gl-link' });
  c.tick(300);
  c.log.startFrame(); c.log.part('a'); c.tick(5); c.log.endFrame();
  c.tick(10);
  c.log.startFrame();
  assert.equal(c.log.hitches.length, 1);
  const h = c.log.hitches[0];
  assert.equal(Math.round(h.outside), 500);
  assert.ok(h.seen.includes('terrain:chunk ×2'));
  assert.ok(h.seen.some((s) => s.startsWith('shader gl-link')));
});

test('a long task told after its frame goes to that frame; a big heap drop is a GC', () => {
  let heap = 400 * 2 ** 20;
  const c = clocked(() => heap);
  c.log.startFrame(); c.tick(5); c.log.endFrame(); c.tick(10);
  c.log.startFrame(); c.tick(5); c.log.endFrame(); c.tick(300);
  heap -= 80 * 2 ** 20;
  c.log.startFrame(); c.tick(5); c.log.endFrame(); c.tick(10);
  c.log.startFrame();
  assert.equal(c.log.hitches.length, 1);
  assert.equal(Math.round(c.log.hitches[0].freedMb), 80);
  c.log.note('long task', 290, 25);
  assert.ok(c.log.hitches[0].seen.includes('long task 290 ms'));
});
