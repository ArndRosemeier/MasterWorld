import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting } from '../src/setting/contract';
import { groupDanger } from '../src/sim/wild';
import { territoryOf, wildFor } from '../src/vgm/wild';
import { dangerAt } from '../src/vgm/dungeons';
import { encounterFor, membersOf, typicalDanger } from '../src/vgm/encounters';
import { giantPlan, LIBRARY_KINDS } from '../src/render/libraryAnimals';
import { startWorld } from './frontierLand';

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
    assert.ok(d.body.kind === 'beast' && d.body.giant && d.body.giant > 0 && d.body.giant <= 1, `${id} is a giant by the Deform recipe`);
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
    assert.equal(d.temper, 'skittish', `${id} does not attack on sight`);
    assert.ok(d.danger <= 18, `${id} is no danger to a fresh hero`);
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
    assert.ok(groupDanger(t.members, classic.creatures) <= Math.max(18, dangerAt({ decision: t }, town.decision)), `${t.id} at ${near.toFixed(0)} m fits the land`);
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
  assert.ok(typicalDanger(classic, e) < 36, 'its typical danger counts one giant');
  // Encounters that are not "lone" are drawn as before.
  const rats = classic.encounters.find((x) => x.id === 'ghoul-and-bones')!;
  assert.deepEqual(membersOf(rats, 5), membersOf(rats, 5));
});

test('a giant is the Deform recipe, seeded: the same body for the same animal, another for another, none at strength 0', () => {
  const a = giantPlan(0.6, 42), b = giantPlan(0.6, 42), c = giantPlan(0.6, 43);
  assert.ok(a && b && c);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.parts, c.parts);
  assert.ok(a.scale > 1.5 && a.scale < 2.6, `grown ${a.scale.toFixed(2)} times`);
  assert.ok(a.gait.rate < 1, 'slower for its size');
  assert.equal(giantPlan(undefined, 42), null);
  assert.equal(giantPlan(0, 42), null);
});

test('the giants have a library body with a clip for every doing', () => {
  assert.deepEqual(LIBRARY_KINDS.elk.ids, ['elk']);
  assert.deepEqual(LIBRARY_KINDS.turtle.ids, ['tortoise-stylized']);
  for (const id of ['giant elk', 'giant turtle']) {
    const b = def(id).body;
    assert.ok(b.kind === 'beast' && ['elk', 'turtle'].includes(b.species), id);
  }
});
