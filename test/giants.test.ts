import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting } from '../src/setting/contract';
import { awake, extraOf, groupDanger, unbiddenDanger } from '../src/sim/wild';
import { WALK_R, radiusOf, walkRadius } from '../src/sim/creatures';
import { territoryOf, wildFor } from '../src/vgm/wild';
import { dangerAt } from '../src/vgm/dungeons';
import { encounterFor, membersOf, typicalDanger } from '../src/vgm/encounters';
import { giantPlan, LIBRARY_KINDS } from '../src/render/libraryAnimals';
import { startWorld } from './frontierLand';
import { Character } from '../src/game/character';
import { levelOfDanger } from '../src/game/growth';
import { hitChance } from '../src/sim/combat';

const seed = parseSeed('masterworld');
const { terrain } = startWorld();
const town = terrain.towns[0];
const places = wildFor({ seed, log: [], towns: terrain.towns, terrain, hours: 0, setting: classic }, town).map(territoryOf);
const def = (id: string) => classic.creatures.find((c) => c.id === id)!;
const GIANTS = ['giant elk', 'giant turtle', 'giant boar', 'giant wolf'];

test('the giants are in the setting: their own creatures, with loot that fits, and the setting still validates', () => {
  assert.deepEqual(validateSetting(classic), []);
  for (const id of GIANTS) {
    const d = def(id);
    assert.equal(d.body.kind, 'beast', id);
    assert.ok(d.body.kind === 'beast' && d.body.giant && d.body.giant >= 5, `${id} is a giant by the Deform recipe, grown many times (not just a big one)`);
    assert.ok(d.loot && classic.items.treasure.some((t) => t.id === d.loot), `${id} has its own loot`);
  }
  // Their loot is theirs: no giant hide off a plain deer, and nothing from a person's pockets.
  for (const t of classic.items.treasure.filter((t) => t.id.startsWith('giant-'))) {
    for (const [item] of t.items) assert.ok(classic.items.items.some((i) => i.id === item), `${t.id}: ${item} exists`);
    assert.equal(t.coins[1], 0, `${t.id}: an animal carries no coin`);
  }
});

test('two giants are peaceful and near, as a promise; two hunt and live only where the land holds their danger (D29)', () => {
  for (const id of ['giant elk', 'giant turtle']) {
    const d = def(id);
    assert.equal(d.temper, 'placid', `${id} takes no notice of the hero, and is afraid of nothing`);
    assert.equal(d.morale, 1, `${id} never runs from a fight it is in`);
    assert.ok(!d.wary, `${id} keeps no flight distance`);
    // Struck, a giant fights as one (its danger is its blows and health): far beyond a fresh hero, and safe only because it never starts a fight.
    assert.ok(levelOfDanger(classic.growth, d.danger) >= 8, `${id} is no fight for a fresh hero (level ${levelOfDanger(classic.growth, d.danger)})`);
    assert.equal(d.faction, 'great', `${id}: the great beasts are at feud with nobody`);
  }
  for (const [a, b] of classic.factions.matrix) assert.ok(a !== 'great' && b !== 'great', 'nobody is at feud with the great beasts');
  for (const w of ['giant-boar', 'giant-wolves']) {
    const wd = classic.wild.find((x) => x.id === w)!, e = classic.encounters.find((x) => x.id === w)!;
    // The nearest the group may live, with its biggest company, must be a danger the land there holds.
    const worst = groupDanger(Array.from({ length: e.count[1] }, (_, i) => (i === 0 ? e.creatures[0] : e.creatures[1])), classic.creatures);
    const far = dangerAt({ decision: { x: wd.ring[0], z: 0 } }, { x: 0, z: 0 });
    assert.ok(worst <= far, `${w}: ${worst} fits ${far} at ${wd.ring[0]} m`);
    assert.ok(wd.ring[0] >= 2000, `${w} is far out`);
  }
});

test('the giants the start world places stand where their groups may, never too strong for the place', () => {
  const kinds = new Set(places.map((t) => t.kind));
  assert.ok(kinds.has('giant-elk'), `the start has its giant elk (${[...kinds].join(', ')})`);
  assert.ok(kinds.has('giant-turtle'), `and its giant turtle by the water (${[...kinds].join(', ')})`);
  // The turtle lies on a bank with water within a stone's throw of it.
  const turtle = places.find((t) => t.kind === 'giant-turtle')!;
  let wet = false;
  for (let k = 0; k < 8; k++) if (terrain.waterDepth(turtle.x + Math.cos(k * Math.PI / 4) * 26, turtle.z + Math.sin(k * Math.PI / 4) * 26) >= 0.5) wet = true;
  assert.ok(wet, 'water beside the turtle');
  for (const t of places.filter((t) => t.members.some((m) => GIANTS.includes(m)))) {
    const near = Math.hypot(t.x - town.decision.x, t.z - town.decision.z);
    // Only those who may start a fight must fit the land's danger (D29); the placid giants start none.
    assert.ok(unbiddenDanger(t.members, classic.creatures) <= Math.max(18, dangerAt({ decision: t }, town.decision)), `${t.id} at ${near.toFixed(0)} m fits the land`);
    if (t.members.some((m) => def(m).temper === 'hostile')) assert.ok(near >= 2400, `${t.id}: a hunting giant lives far out`);
    assert.equal(terrain.waterDepth(t.x, t.z), 0, `${t.id} on dry land`);
  }
});

test('no giant is ever met below ground: no encounter of theirs is for a place below, and none is chosen for one', () => {
  const giantEncounters = classic.encounters.filter((e) => e.creatures.some((c) => GIANTS.includes(c)));
  assert.equal(giantEncounters.length, 4);
  for (const e of giantEncounters) assert.ok(!e.where.includes('below'), `${e.id} is not for a cellar`);
  for (let s = 1; s <= 300; s++) {
    for (const danger of [10, 18, 30, 50]) {
      const met = encounterFor({ setting: classic, seed: s, where: 'below', danger });
      if (met) assert.ok(!giantEncounters.some((e) => e.id === met.encounter), `a giant below (${met.encounter})`);
    }
  }
  for (const lore of Object.values(classic.dungeons)) {
    for (const d of lore?.dwellers ?? []) assert.ok(!giantEncounters.some((e) => e.id === (d as { encounter?: string }).encounter), 'a dweller is a giant');
  }
});

test('a giant wolf leads a pack of plain wolves, and is the only one of its kind in it', () => {
  const e = classic.encounters.find((x) => x.id === 'giant-wolves')!;
  for (let s = 0; s < 80; s++) {
    const m = membersOf(e, s);
    assert.equal(m[0], 'giant wolf');
    assert.ok(m.slice(1).every((x) => x === 'wolf'), m.join(','));
    assert.ok(m.length >= 3 && m.length <= 4);
  }
  // One giant and plain wolves (were every member a giant, two would weigh twice the giant's danger).
  assert.ok(typicalDanger(classic, e) < 2 * def('giant wolf').danger, 'its typical danger counts one giant');
  // Encounters that are not "lone" are drawn as before.
  const rats = classic.encounters.find((x) => x.id === 'ghoul-and-bones')!;
  assert.deepEqual(membersOf(rats, 5), membersOf(rats, 5));
});

test('a giant is the Deform recipe, seeded: the same body for the same animal, another for another, none at strength 0', () => {
  const a = giantPlan(6, 42), b = giantPlan(6, 42), c = giantPlan(6, 43);
  assert.ok(a && b && c);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.parts, c.parts);
  assert.equal(a.scale, 6, 'grown six times');
  assert.ok(Math.abs(a.gait.rate - 1 / Math.sqrt(6)) < 1e-6, 'slower for its size');
  assert.ok(a.parts.leg.girth > 1.3, 'thick legs for the weight');
  assert.equal(giantPlan(undefined, 42), null);
  assert.equal(giantPlan(1, 42), null);
  assert.equal(giantPlan(0, 42), null);
});

test('the giants awe: grown many times, as long as their length says, towering over a hero, and bigger than any other beast', () => {
  // The normal animal's length as drawn (the library's elk 2.3 m, the tortoise 0.85 m x 1.3, the others the setting's own).
  const base: Record<string, number> = { 'giant elk': 2.3, 'giant turtle': 1.1, 'giant boar': def('boar').body.kind === 'beast' ? (def('boar').body as { length: number }).length : 0, 'giant wolf': (def('wolf').body as { length: number }).length };
  const others = classic.creatures.filter((c) => !GIANTS.includes(c.id) && c.body.kind === 'beast').map((c) => (c.body as { length: number }).length);
  for (const id of GIANTS) {
    const b = def(id).body as { length: number; giant: number };
    assert.ok(Math.abs(b.length / (base[id] * b.giant) - 1) < 0.1, `${id}: ${b.length} m is about ${base[id]} x ${b.giant}`);
    assert.ok(b.length >= 9, `${id} is ${b.length} m long: a house, not a horse`);
    assert.ok(b.length > 2 * Math.max(...others), `${id} dwarfs every other beast`);
  }
});

test('a giant keeps the room of its whole body from other bodies, and walks the land as a body no wider than a bear', () => {
  for (const id of GIANTS) {
    const d = def(id);
    assert.ok(radiusOf(d) >= 2.5, `${id} blocks ${radiusOf(d)} m round`);
    assert.equal(walkRadius(d), WALK_R, `${id} finds its way between trunks as a ${WALK_R} m body`);
  }
  assert.equal(radiusOf(def('giant turtle')), 6.2, 'the turtle is round: its shell is its footprint');
  // Nothing else changes: every other creature walks the land at its own radius.
  for (const c of classic.creatures.filter((c) => !GIANTS.includes(c.id))) assert.equal(walkRadius(c), radiusOf(c), c.id);
  // Their blows reach from a head that high, past their body's room.
  for (const id of GIANTS) assert.ok(def(id).attacks[0].reach >= 2, `${id} reaches ${def(id).attacks[0].reach} m`);
});

test('a giant is awake, and drawn, from afar: no popping up at 260 m', () => {
  const far = extraOf(['giant elk'], classic.creatures), lone = extraOf(['wolf'], classic.creatures);
  assert.ok(far >= 500 && lone === 0, `${far} m more, ${lone} m more`);
  assert.equal(extraOf(['giant wolf', 'wolf', 'wolf'], classic.creatures), far, 'a pack with a giant in it');
  // The hero 700 m from the territory's edge: a giant's group is awake (the distance less its extra), a deer herd is not.
  assert.ok(awake(false, 700 - far) && !awake(false, 700 - lone), 'seen across a valley');
});

test('the giants have a library body with a clip for every doing', () => {
  assert.deepEqual(LIBRARY_KINDS.elk.ids, ['elk']);
  assert.deepEqual(LIBRARY_KINDS.turtle.ids, ['tortoise-stylized']);
  for (const id of ['giant elk', 'giant turtle']) {
    const b = def(id).body;
    assert.ok(b.kind === 'beast' && ['elk', 'turtle'].includes(b.species), id);
  }
});

test('every beast\'s danger is its fight: its blows and its health against a fresh hero (a giant turtle once read "weaker than you")', () => {
  // A fight's weight is the damage each side deals while the other is beaten (Lanchester: the square root of the foe's blows times how long it lasts).
  const hero = new Character(classic), w = hero.guard(), blow = hero.blow();
  const per = (damage: readonly [number, number], prowess: number, armour: number, kind: string) => Math.max(1, (damage[0] + damage[1]) / 2 * (1 + prowess / 220) - armour * (kind === 'pierce' ? 0.6 : 1));
  for (const c of classic.creatures.filter((c) => c.body.kind === 'beast')) {
    const a = c.attacks[0];
    const dealt = hitChance(a.prowess, w.defence) * per(a.damage, a.prowess, w.armour, a.kind) / a.time;
    const lasts = c.health / (hitChance(blow.prowess, c.defence) * per(blow.damage, blow.prowess, c.armour, blow.kind) / hero.weapon.time);
    const weight = Math.sqrt(dealt * lasts);
    assert.ok(c.danger >= 0.8 * weight && c.danger <= 1.45 * weight, `${c.id}: danger ${c.danger}, its fight weighs ${weight.toFixed(1)} (${(0.8 * weight).toFixed(0)} to ${(1.45 * weight).toFixed(0)})`);
  }
});
