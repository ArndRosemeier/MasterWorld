import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { OpenGround, type Land } from '../src/sim/wild';
import { Den, keepApart, radiusOf, type Quarry } from '../src/sim/creatures';
import { Held, Steady } from '../src/render/steady';

const guard = { defence: 20, armour: 1, open: false };
const hero = (x: number, z: number): Quarry => ({ x, y: 0, z, noise: 1, light: 0, alive: true, guard });
/** Flat land with a strip of deep water from x = a to x = b, and trunks (circles) where given. */
const landWith = (a: number, b: number, trunks: [number, number, number][] = []): Land => ({
  height: () => 0,
  waterDepth: (x) => (x > a && x < b ? 1.5 : 0),
  blocked: (x, z, r) => trunks.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + r),
});
const denOn = (land: Land, x: number, z: number, n = 1, seed = 7) =>
  new Den(new OpenGround(land, [{ x, z, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: 'wolf', room: 0 })), classic.creatures, seed);
/** Set it on the hero (a blow that missed) where it stands. */
const rouse = (den: Den, q: Quarry) => { for (const c of den.creatures) den.wound(c, { damage: 0, outcome: 'miss' }, q); };

test('mob nav: walks round a trunk in its way, wades shallows and takes a small step in its stride', () => {
  const g = new OpenGround({ ...landWith(100, 101, [[1, 0, 0.3]]), height: (x) => (x > 3 ? 0.25 : 0), waterDepth: (x) => (x > 5 && x < 6 ? 0.4 : 0) }, [{ x: 0, z: 0, r: 1 }]);
  let x = 0, z = 0;
  for (let i = 0; i < 200; i++) { const to = g.slide(x, x > 3 ? 0.25 : 0, z, 0.05, 0, 0.35); assert.ok(to, `moves on at ${x.toFixed(2)}`); x = to.x; z = to.z; }
  assert.ok(x > 7, `got past the trunk, the step and the shallows (x ${x.toFixed(1)})`);
});

test('mob nav: stuck at a brook, it hops across in a seen leap, and only once a minute', () => {
  const land = landWith(2, 5);
  const den = denOn(land, 0, 0), c = den.creatures[0];
  c.x = 0; c.z = 0;
  const q = hero(9, 0);
  rouse(den, q);
  let air = 0, high = 0, hops = 0, was = false;
  for (let i = 0; i < 100 && c.x < 5; i++) {
    den.step(0.1, q);
    if (c.hop) { air += 0.1; high = Math.max(high, c.y); }
    if (c.hop && !was) hops++;
    was = !!c.hop;
    assert.ok(land.waterDepth(c.x, c.z) === 0 || c.hop, 'never walks into deep water');
  }
  assert.ok(c.x > 5, `over the brook (x ${c.x.toFixed(1)})`);
  assert.equal(hops, 1);
  assert.ok(air >= 0.4 && high > 0.3, `a leap you see: ${air.toFixed(1)} s, ${high.toFixed(2)} m up`);
  assert.ok(c.hopIn > 50, 'no other hop for a minute');
});

test('mob nav: a hero across a river it cannot hop: it does not stand at the shore for ever, it goes home', () => {
  const den = denOn(landWith(2, 20), 0, 0), c = den.creatures[0];
  c.x = 0; c.z = 0;
  const q = hero(26, 0);
  rouse(den, q);
  let left = -1;
  for (let i = 0; i < 150; i++) {
    den.step(0.1, q);
    if (left < 0 && c.state !== 'fight') left = i * 0.1;
  }
  assert.ok(left > 0 && left < 12, `gave up after ${left.toFixed(1)} s`);
  assert.ok(c.x < 2, 'never in the river');
  assert.notEqual(c.state, 'fight', 'and leaves the hero alone a while');
});

test('mob nav: one in deep water walks out of it', () => {
  const den = denOn(landWith(-3, 3), 6, 0), c = den.creatures[0];
  c.x = 0; c.z = 0;
  for (let i = 0; i < 200; i++) den.step(0.1, hero(40, 40));
  assert.ok(Math.abs(c.x) >= 3, `out at x ${c.x.toFixed(1)}`);
});

test('mob nav: two fighting the hero never stand in one spot, nor two of different groups', () => {
  const land = landWith(100, 101);
  const a = denOn(land, -3, 0, 2), b = denOn(land, -3, 0.2, 1, 9);
  for (const c of [...a.creatures, ...b.creatures]) { c.x = -3; c.z = 0; }
  const q = hero(0, 0);
  rouse(a, q); rouse(b, q);
  for (let i = 0; i < 80; i++) { a.step(0.05, q); b.step(0.05, q); keepApart([a, b]); }
  const all = [...a.creatures, ...b.creatures];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const d = Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z);
    assert.ok(d >= (radiusOf(all[i].def) + radiusOf(all[j].def)) * 0.9, `${i} and ${j} ${d.toFixed(2)} m apart`);
  }
});

test('mob nav: at the edge of its reach it stands, not stepping in and out each frame', () => {
  const den = denOn(landWith(100, 101), -2, 0), c = den.creatures[0];
  c.x = -2; c.z = 0;
  rouse(den, hero(0, 0));
  for (let i = 0; i < 60; i++) den.step(0.05, hero(0, 0));
  let flips = 0, last = c.act;
  // The hero sways a hand's breadth back and forth.
  for (let i = 0; i < 100; i++) {
    den.step(0.05, hero(i % 2 ? 0.12 : 0, 0));
    if ((c.act === 'run') !== (last === 'run')) flips++;
    last = c.act;
  }
  assert.ok(flips <= 4, `${flips} flips between standing and running`);
});

test('anti-jitter: what is drawn follows a body that steps back and forth smoothly, and a clip holds a moment', () => {
  const s = new Steady().ease(0, 0, 0, 0, 0);
  let most = 0;
  for (let i = 0; i < 60; i++) { s.ease(1 / 60, i % 2 ? 0.1 : 0, 0, 0, i % 2 ? 0.6 : -0.6); most = Math.max(most, Math.abs(s.yaw)); }
  assert.ok(Math.abs(s.x - 0.05) < 0.04, `it stays between (${s.x.toFixed(3)})`);
  assert.ok(most < 0.3, `facing sways ${most.toFixed(2)} rad, not 0.6`);
  assert.ok(s.pace < 1.5, `a still body's pace ${s.pace.toFixed(2)}`);
  s.ease(1 / 60, 20, 0, 0, 0);
  assert.equal(s.x, 20, 'a far jump is taken at once');
  const h = new Held('idle');
  assert.equal(h.pick(0.05, 'walk'), 'idle');
  assert.equal(h.pick(0.05, 'idle'), 'idle');
  assert.equal(h.pick(0.1, 'walk'), 'idle');
  assert.equal(h.pick(0.15, 'walk'), 'walk');
  assert.equal(h.pick(0.01, 'swing', true), 'swing');
});
