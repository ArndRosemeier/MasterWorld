import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayOf, drawTitle, shuffled, titleSeed } from '../src/app/title/draw';
import { CodeWatch, PEOPLES, RUMOURS, SECRET, TOASTS } from '../src/app/title/lines';
import { DIVE_SECONDS, GIANT_SPEED, divePose, giantPose, orbitPose, type Orbit } from '../src/app/title/route';
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
      assert.ok(at[1] > hills.ground(at[0], at[2]) + 45, `t=${t} near=${near}: ${at[1]}`);
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

test('title: the giant comes now and then, and paces the far land on the ground', () => {
  const many = Array.from({ length: 200 }, (_, i) => drawTitle(titleSeed('2026-10-25', i)).giant);
  const share = many.filter(Boolean).length / many.length;
  assert.ok(share > 0.15 && share < 0.45, `giant in ${share} of the titles`);
  const o: Orbit = { centre: [100, 20, -50], turn: -1, angle: 1.2, ground: (x, z) => 20 + Math.sin(x * 0.01) * 5 + z * 0.001 };
  let last = giantPose(o, 9, 0);
  for (let t = 0.5; t < 400; t += 0.5) {
    const p = giantPose(o, 9, t);
    const far = Math.hypot(p.x - 100, p.z + 50);
    assert.ok(far > 200 && far < 500, `out on the far land (${far} m)`);
    assert.equal(p.y, o.ground(p.x, p.z));
    const step = Math.hypot(p.x - last.x, p.z - last.z);
    assert.ok(step <= GIANT_SPEED * 0.5 + 1e-6, `walks, does not jump (${step} m)`);
    // It faces the way it walks (but where it turns round).
    if (step > GIANT_SPEED * 0.5 - 1e-3 && p.yaw === last.yaw) {
      const d = Math.atan2(-(p.x - last.x), -(p.z - last.z)) - p.yaw;
      assert.ok(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) < 1e-6, `facing off by ${d}`);
    }
    last = p;
  }
});
