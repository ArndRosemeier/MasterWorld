import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { openWorld } from '../src/vgm/builder';
import { Wilds, type Land } from '../src/sim/wild';
import { territoryOf, wildFor } from '../src/vgm/wild';
import { paceOf, woundOf, type Quarry } from '../src/sim/creatures';
import { WALK } from '../src/game/walker';
import { SMALL } from './small';

const seed = parseSeed('masterworld');
const { terrain } = openWorld(seed, classic, SMALL);
const town = terrain.towns[0];
const land: Land = { height: (x, z) => terrain.height(x, z), waterDepth: (x, z) => terrain.waterDepth(x, z), blocked: (x, z, r) => town.solid(x, z, r) };
const places = wildFor({ seed, log: [], towns: terrain.towns, terrain, hours: 0, setting: classic }, town).map(territoryOf);
const guard = { defence: 20, armour: 1, open: false };
const hero = (x: number, z: number, noise = 1): Quarry => ({ x, y: terrain.height(x, z), z, noise, light: 0, alive: true, guard });

test('wounds: a badly hurt beast that runs is slower than the running hero; left alone, it heals', () => {
  const wilds = new Wilds(places, land, classic.creatures);
  const band = wilds.bands.find((b) => b.territory.kind === 'wolves')!;
  const wolf = band.den.creatures[0];
  // Whole, at full pace; a scratch does not slow it; near death, barely a third of it.
  assert.equal(paceOf(wolf), 1);
  wolf.health = wolf.def.health * 0.8;
  assert.equal(paceOf(wolf), 1);
  wolf.health = wolf.def.health * 0.25;
  assert.ok(wolf.def.speed * paceOf(wolf) < WALK.run, `a wolf at a quarter runs ${(wolf.def.speed * paceOf(wolf)).toFixed(1)} m/s`);
  wolf.health = wolf.def.health;
  // Struck hard, it runs: measured, slower than the hero can run.
  const t = band.territory;
  const at = () => hero(wolf.x + 6, wolf.z);
  wilds.step(0.1, at());
  band.den.wound(wolf, { damage: wolf.def.health * 0.8, outcome: 'hit' }, at());
  assert.equal(wolf.state, 'flee');
  let most = 0;
  for (let i = 0; i < 40; i++) {
    const x0 = wolf.x, z0 = wolf.z;
    wilds.step(0.1, at());
    most = Math.max(most, Math.hypot(wolf.x - x0, wolf.z - z0) / 0.1);
  }
  assert.ok(most > 0.5 && most < WALK.run, `fleeing at ${most.toFixed(1)} m/s`);
  // The hero gone far off: it heals, never past whole, and the pace comes back with it.
  const hurt = wolf.health;
  const away = hero(t.x + t.r + 60, t.z, 0);
  for (let i = 0; i < 600; i++) wilds.step(0.1, away);
  assert.ok(wolf.health > hurt + wolf.def.health * 0.3, `healed ${hurt.toFixed(0)} -> ${wolf.health.toFixed(0)}`);
  assert.ok(wolf.health <= wolf.def.health);
  assert.ok(woundOf(wolf) < 0.5);
});

test('wounds: no healing in a fight or right after a blow', () => {
  const wilds = new Wilds(places, land, classic.creatures);
  const band = wilds.bands.find((b) => b.territory.kind === 'wolves')!;
  const wolf = band.den.creatures[0];
  const at = () => hero(wolf.x + 1.5, wolf.z);
  wilds.step(0.1, at());
  band.den.wound(wolf, { damage: 4, outcome: 'hit' }, at());
  const h = wolf.health;
  for (let i = 0; i < 30; i++) wilds.step(0.1, at());
  assert.ok(wolf.health <= h, 'not while it fights');
});
