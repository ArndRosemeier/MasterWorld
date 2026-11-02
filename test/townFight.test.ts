import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { townsfolk } from '../src/sim/people';
import { TownLife } from '../src/sim/townLife';
import { TownFight, type TownFightEvent } from '../src/sim/townFight';
import { Den, type Quarry } from '../src/sim/creatures';
import { opposed } from '../src/sim/factions';
import { OpenGround, type Land } from '../src/sim/wild';

// R6 (D65): the town's watch, its able folk and the rest when raiders come in.
const flat: Land = { height: () => 0, waterDepth: () => 0, blocked: () => false };
const guard = { defence: 20, armour: 1, open: false };
const far: Quarry = { x: 900, y: 0, z: 900, noise: 0, light: 0, alive: true, guard };
const SIZES = { hamlet: 70, village: 70, town: 100, capital: 160 } as const;

function town(size: keyof typeof SIZES, seed = 3, hour = 11) {
  const plan = planTown({ seed, x: 0, z: 0, size, radius: SIZES[size], farmland: false, height: () => 10 });
  const people = townsfolk(plan, seed);
  const life = new TownLife(plan, seed, hour, classic.routines, people);
  for (let s = 0; s < 60; s++) life.step(1, hour + s / 3600);
  return { plan, people, life, radius: SIZES[size], hour };
}
const raiders = (kind: string, n: number, x: number, z = 0, seed = 5): Den => {
  const d = new Den(new OpenGround(flat, [{ x, z, r: 0.01 }]), Array.from({ length: n }, () => ({ creature: kind, room: 0 })), classic.creatures, seed);
  d.creatures.forEach((c, i) => { c.x = x + (i % 2) * 1.2; c.z = z + Math.floor(i / 2) * 1.2; c.dir = Math.PI; });
  d.feud = (a, b) => opposed(classic, a, b);
  return d;
};

test('watch: every town has some watchmen: able grown-ups with arms, who are not the trades or the keeper', () => {
  for (const size of ['hamlet', 'village', 'town', 'capital'] as const) {
    const { people } = town(size);
    const watch = people.filter((p) => p.watch);
    assert.ok(watch.length >= 1 && watch.length <= 8, `${size}: ${watch.length} watchmen`);
    for (const p of watch) {
      assert.ok(p.age >= 20 && p.age <= 45 && p.role === 'homemaker' && p.dress === 'fighter' && p.trade === '', `${size}: person ${p.id}`);
    }
  }
  assert.ok(town('capital').people.filter((p) => p.watch).length > town('hamlet').people.filter((p) => p.watch).length, 'a bigger town has a bigger watch');
});

test('watch: by day they walk the streets', () => {
  const { life } = town('town', 3, 10);
  const mine = life.agents.filter((a) => a.person.watch);
  const seen = new Set<string>();
  for (let s = 0; s < 400; s++) { life.step(1, 10 + s / 3600); for (const a of mine) seen.add(a.act); }
  assert.ok(seen.has('stroll') || seen.has('walk'), `they patrol (${[...seen].join(', ')})`);
  assert.ok(!seen.has('sleep'), 'and are not abed at ten');
});

/** A raid on the town: the raiders' den placed at its edge, the town stepped with them for `secs`. */
function raid(kind: string, n: number, size: keyof typeof SIZES = 'town', secs = 150) {
  const t = town(size), fight = new TownFight(t.life, { x: 0, z: 0, radius: t.radius }, classic, flat, 9);
  const band = raiders(kind, n, t.radius * 0.6);
  const events: TownFightEvent[] = [];
  for (let s = 0; s < secs * 10; s++) {
    const dt = 0.1;
    t.life.step(dt, t.hour + s / 36000);
    band.neighbours = fight.den ? [fight.den] : [];
    events.push(...band.step(dt, far).map((e) => e as TownFightEvent), ...fight.raidStep(dt, [band], far));
  }
  return { ...t, fight, band, events };
}

test('raid: the watch comes out first, able folk join against wolves, and the weak go indoors', () => {
  const r = raid('wolf', 3, 'town', 8);
  const muster = r.events.find((e) => e.kind === 'muster');
  assert.ok(muster && muster.kind === 'muster', 'the town was called out');
  assert.ok(muster.watch.length >= 1, 'the watch is out');
  assert.ok(muster.watch.every((a) => a.person.watch), 'and they are the watch');
  assert.ok(muster.able.every((a) => !a.person.watch && a.person.age >= 18 && a.person.age <= 55 && a.person.role !== 'child'), 'able folk are grown');
  assert.ok(muster.watch.length + muster.able.length <= Math.max(6, muster.watch.length), 'only as many as the raiders are twice over (or the whole watch)');
  // Everyone out of doors near a raider who is not fighting is running home or already in.
  for (const a of r.life.agents) {
    if (a.post || a.hidden) continue;
    assert.ok(!r.life.alarmed.has(a.person.id) || a.run || a.act === 'walk', `person ${a.person.id} (${a.person.role}) runs`);
  }
  for (const a of r.life.agents) if (a.person.role === 'child' && r.life.alarmed.has(a.person.id)) assert.ok(a.hidden || a.run, 'children hide');
});

test('raid: nobody of the town dies, the raiders are beaten or driven off, and the town goes back to its day', () => {
  const r = raid('wolf', 3, 'town', 400);
  assert.ok(r.events.some((e) => e.kind === 'clear'), 'it ended');
  assert.equal(r.fight.phase, 'calm');
  assert.equal(r.life.alarmed.size, 0, 'the doors are open again');
  assert.ok(!r.events.some((e) => e.kind === 'died' && e.who.def.faction === 'watch'), 'nobody of the town died');
  assert.ok(r.life.agents.every((a) => !a.post), 'and nobody is left at the fray');
  assert.ok(r.band.creatures.every((c) => c.state === 'dead' || c.state === 'meek' || c.state === 'flee' || c.state === 'idle'), 'the wolves are done with');
});

test('raid: against a band too strong the able folk stay out and only the watch fights; the watch is knocked down, not killed', () => {
  const r = raid('skeleton', 4, 'town', 200);
  const muster = r.events.find((e) => e.kind === 'muster');
  assert.ok(muster && muster.kind === 'muster' && muster.able.length === 0, 'the watch alone');
  assert.ok(!r.events.some((e) => e.kind === 'died' && e.who.def.faction === 'watch'), 'nobody of the town died');
  assert.ok(r.events.some((e) => e.kind === 'down'), 'some of the watch were knocked down');
  assert.ok(r.events.some((e) => e.kind === 'up'), 'and got up again');
});

test('raid: a hamlet with one watchman has the able folk beside him', () => {
  const r = raid('goblin', 3, 'hamlet', 6);
  const muster = r.events.find((e) => e.kind === 'muster');
  assert.ok(muster && muster.kind === 'muster' && muster.watch.length + muster.able.length >= 2);
});
