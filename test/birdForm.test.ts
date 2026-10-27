import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { changeLook, Shapeshift } from '../src/game/birdForm';
import { BirdFlight, FLIGHT, type FlightIntent } from '../src/sim/birdFlight';
import { Character } from '../src/game/character';
import { shapeOf } from '../src/game/recipe';


const bird = classic.abilities.find((a) => shapeOf(a)?.into === 'bird')!;
const calm = { fighting: false };

test('bird form: a taught ability, 15 s to change, not known by a fresh hero', () => {
  assert.ok(bird, 'the classic setting has bird form');
  assert.equal(shapeOf(bird)!.change, 15);
  assert.ok(bird.taught);
  const hero = new Character(classic);
  assert.ok(!hero.knows(bird.id));
  assert.ok(hero.learn(bird.id));
  assert.ok(hero.bar.includes(bird.id), 'learned onto the bar');
});

test('bird form: never begun in a fight, on a horse, in water or under a roof', () => {
  const s = new Shapeshift(bird);
  assert.match(s.callOn({ fighting: true }) ?? '', /fight/);
  assert.match(s.callOn({ fighting: false, riding: true }) ?? '', /horse/);
  assert.match(s.callOn({ fighting: false, swimming: true }) ?? '', /water/);
  assert.match(s.callOn({ fighting: false, roofed: true }) ?? '', /sky/);
  assert.equal(s.phase, 'self');
});

test('bird form: the change takes its 15 s, a fight breaks it, using it again calls it off', () => {
  const s = new Shapeshift(bird);
  const ev: string[] = [];
  assert.equal(s.callOn(calm, ev as never), null);
  assert.deepEqual(ev, ['began']);
  for (let t = 0; t < 14.5; t += 0.5) assert.deepEqual(s.tickChange(0.5, calm), []);
  assert.equal(s.phase, 'changing');
  assert.ok(s.progress > 0.9 && s.progress < 1);
  assert.deepEqual(s.tickChange(0.6, calm), ['became']);
  assert.equal(s.phase, 'bird');
  // Another change, broken by a fight halfway.
  const b = new Shapeshift(bird);
  b.callOn(calm);
  b.tickChange(7, calm);
  assert.deepEqual(b.tickChange(0.1, { fighting: true }), ['broken']);
  assert.equal(b.phase, 'self');
  // And one called off.
  b.callOn(calm);
  const off: string[] = [];
  b.callOn(calm, off as never);
  assert.deepEqual(off, ['stopped']);
  assert.equal(b.phase, 'self');
});

test('bird form: in the air, turning back lands first; on the ground it turns back, then cools down', () => {
  const s = new Shapeshift(bird);
  s.callOn(calm);
  s.tickChange(15.1, calm);
  const ev: string[] = [];
  s.callOn({ fighting: false, grounded: false }, ev as never);
  assert.deepEqual(ev, ['landing']);
  assert.ok(s.landing);
  assert.deepEqual(s.tickChange(0.1, { fighting: false, grounded: false }), []);
  assert.deepEqual(s.tickChange(0.1, { fighting: false, grounded: true }), ['returning']);
  s.tickChange(1, calm);
  assert.ok(s.progress < 1, "changing back");
  assert.deepEqual(s.tickChange(shapeOf(bird)!.back + 0.1, calm), ['returned']);
  assert.equal(s.phase, 'self');
  assert.ok(s.cooling > 0);
  assert.match(s.callOn(calm) ?? '', /not ready/);
});

/** Flat ground at 10 m, a lake east of x = 50 (water at 12 m), a wall at x = -20. */
const world = {
  height: () => 10,
  waterLevel: (x: number) => (x > 50 ? 12 : null),
  wall: (x: number) => x < -20,
};
const fly = (f: BirdFlight, i: Partial<FlightIntent>, secs: number) => {
  for (let t = 0; t < secs; t += 1 / 30) f.steer({ forward: 0, heading: f.yaw, up: false, down: false, walk: false, land: false, ...i }, 1 / 30);
};

test('bird flight: takes off, climbs, flaps on, glides down and lands on dry ground', () => {
  const f = new BirdFlight(world);
  f.perch(0, 0, 0);
  assert.ok(f.grounded);
  fly(f, { forward: 1 }, 1);
  assert.ok(f.grounded && f.doing === 'run', 'runs on the ground');
  fly(f, { up: true, forward: 1 }, 4);
  assert.ok(!f.grounded, 'took off');
  const high = f.pos.y;
  assert.ok(high > 20, `climbed to ${high}`);
  fly(f, { forward: 1 }, 2);
  assert.ok(Math.abs(f.pos.y - high) < 4, 'flapping on holds about its height');
  assert.ok(f.pos.z < -40, 'flew north (yaw 0 faces −z)');
  fly(f, { land: true }, 20);
  assert.ok(f.grounded, 'landed');
  assert.equal(f.pos.y, 10);
});

test('bird flight: never under the ground, over water it skims, the sky has a ceiling, walls stop it', () => {
  const f = new BirdFlight(world);
  f.perch(40, 0, -Math.PI / 2); // facing east, towards the lake
  fly(f, { up: true }, 1);
  fly(f, { down: true, forward: 1 }, 12);
  assert.ok(!f.grounded, 'did not land on the water');
  assert.ok(f.pos.y >= 12 + FLIGHT.overWater - 1e-9, 'skims over it');
  fly(f, { up: true, forward: 1 }, 120);
  assert.ok(f.pos.y <= f.floor(f.pos.x, f.pos.z) + FLIGHT.ceiling + 1e-9, "under the ceiling");
  const w = new BirdFlight(world);
  w.perch(-19, 0, Math.PI / 2); // facing west, at the wall
  fly(w, { forward: 1 }, 2);
  assert.ok(w.pos.x >= -20, 'stopped at the wall');
});

test('bird form: the change shows the hero shrinking into the feathers and the bird growing out of them', () => {
  const at0 = changeLook(0), mid = changeLook(0.5), end = changeLook(1);
  assert.equal(at0.hero, 1);
  assert.equal(at0.bird, 0);
  assert.ok(mid.glow > 0.9 && mid.hero < 1 && mid.hero > 0, 'feathers wheel while the hero shrinks');
  assert.equal(end.hero, 0);
  assert.equal(end.bird, 1);
  assert.ok(end.glow < 0.01, 'the feathers are gone at the end');
});
