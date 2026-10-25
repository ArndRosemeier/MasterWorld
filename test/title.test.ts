import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, drawTitle, shuffled, titleSeed } from '../src/app/title/draw';
import { CodeWatch, PEOPLES, RUMOURS, SECRET, TOASTS } from '../src/app/title/lines';
import { DIVE_SECONDS, divePose, orbitPose, type Orbit } from '../src/app/title/route';
import { WEATHER_KINDS } from '../src/world/weather';

test('title: the same day and counter draw the same title, others differ', () => {
  const a = drawTitle(titleSeed('2026-10-25', 3)), b = drawTitle(titleSeed('2026-10-25', 3));
  assert.deepEqual(a, b);
  const many = Array.from({ length: 40 }, (_, i) => drawTitle(titleSeed('2026-10-25', i)));
  assert.ok(new Set(many.map((d) => d.still)).size === 3, 'all three stills come up');
  assert.ok(new Set(many.map((d) => d.weather)).size >= 3, 'the weather varies');
  for (const d of many) {
    assert.ok(d.hour >= 6 && d.hour <= 19, `hour ${d.hour}`);
    assert.ok((WEATHER_KINDS as readonly string[]).includes(d.weather));
    // Storms have their own still; a clear dawn never shows the storm picture.
    assert.equal(d.still === 'storm', d.weather === 'storm' || d.weather === 'rain');
  }
});

test('title: day strings and shuffles', () => {
  assert.equal(dayOf(new Date(2026, 0, 5)), '2026-01-05');
  const s = shuffled(RUMOURS, 7);
  assert.deepEqual([...s].sort(), [...RUMOURS].sort());
  assert.deepEqual(s, shuffled(RUMOURS, 7));
  assert.notDeepEqual(s, shuffled(RUMOURS, 8));
});

test('title: the secret code is heard once complete, and survives a wrong key', () => {
  const w = new CodeWatch(SECRET);
  const keys = ['KeyX', 'ArrowUp', ...SECRET];
  const heard = keys.map((k) => w.heard(k));
  assert.deepEqual(heard.map((h, i) => (h ? i : -1)).filter((i) => i >= 0), [keys.length - 1]);
});

test('title: words exist for every toy and people', () => {
  for (const lines of Object.values(TOASTS)) assert.ok(lines.length > 0);
  assert.deepEqual(PEOPLES.map((p) => p.id), ['humans', 'dwarves', 'halflings', 'elves']);
});

const hills: Orbit = { centre: [0, 50, 0], turn: 1, angle: 0.4, ground: (x, z) => 50 + 30 * Math.sin(x / 200) * Math.cos(z / 170) };

test('title: the orbit keeps above the land and comes closer when allowed', () => {
  for (let t = 0; t < 300; t += 7) {
    for (const near of [0, 1]) {
      const { at } = orbitPose(hills, t, near);
      assert.ok(at[1] > hills.ground(at[0], at[2]) + 60, `t=${t} near=${near}: ${at[1]}`);
    }
  }
  const far = orbitPose(hills, 10, 0).at, close = orbitPose(hills, 10, 1).at;
  assert.ok(Math.hypot(close[0], close[2]) < Math.hypot(far[0], far[2]) * 0.6);
  // It moves, slowly and smoothly.
  const a = orbitPose(hills, 50, 0.5).at, b = orbitPose(hills, 50 + 1 / 60, 0.5).at;
  assert.ok(Math.hypot(a[0] - b[0], a[2] - b[2]) < 1);
});

test('title: the dive starts at the orbit and lands exactly behind the hero', () => {
  const from = orbitPose(hills, 30, 0.3), to = { at: [5, 52, 4] as [number, number, number], look: [5, 52, 10] as [number, number, number] };
  assert.deepEqual(divePose(from, to, 0), from);
  const end = divePose(from, to, 1);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(end.at[i] - to.at[i]) < 1e-9 && Math.abs(end.look[i] - to.look[i]) < 1e-9);
  // Halfway it is still well up in the air, not cutting through the hills.
  const mid = divePose(from, to, 0.5);
  assert.ok(mid.at[1] > to.at[1] + 40);
  assert.ok(DIVE_SECONDS > 2 && DIVE_SECONDS < 6);
});
