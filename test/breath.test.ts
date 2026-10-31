import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic/index';
import { Breath, BREATH } from '../src/game/breath';
import { Character } from '../src/game/character';
import { plainItem } from '../src/game/items';
import { Walker, type WalkWorld } from '../src/game/walker';

// S5: breath under water runs out without water breathing and holds with it.
test('breath: held under water it runs out and the hero drowns (never below the last point); with water breathing it holds', () => {
  const b = new Breath(), most = 100;
  let lost = 0;
  for (let t = 0; t < BREATH - 1; t += 0.1) lost += b.breathe(0.1, true, false, most);
  assert.equal(lost, 0, 'no harm while the breath lasts');
  assert.ok(!b.gasping);
  for (let t = 0; t < 5; t += 0.1) lost += b.breathe(0.1, true, false, most);
  assert.ok(b.gasping, 'out of breath');
  assert.ok(lost > 15 && lost < 40, `${lost.toFixed(1)} health lost drowning for some 4 s`);
  // At the air it comes back within seconds.
  for (let t = 0; t < 6; t += 0.1) b.breathe(0.1, false, false, most);
  assert.equal(b.share, 1);
  // Breathing water: minutes under, no breath spent.
  let gilled = 0;
  for (let t = 0; t < 300; t += 0.1) gilled += b.breathe(0.1, true, true, most);
  assert.equal(gilled, 0);
  assert.equal(b.share, 1);
});

test('breath: the draught of the deep and the vitae spell give water breathing; a healing draught is still the one drunk in a fight', () => {
  const hero = new Character(classic);
  const deep = plainItem(classic.items, 'deep-draught');
  hero.pack.push(deep);
  assert.ok(!hero.gills);
  assert.notEqual(hero.remedy?.def, 'deep-draught', 'not taken for a healing draught');
  hero.consume(deep);
  assert.ok(hero.gills, 'breathes water');
  assert.ok(!hero.pack.includes(deep), 'drunk');
  assert.ok(hero.effectsOn.find((w) => w.def.gills)!.left >= 120, 'for minutes');
  const spell = classic.abilities.find((a) => a.id === 'deep-breath');
  assert.ok(spell && spell.school === 'vitae' && spell.taught, 'a vitae spell');
  assert.ok(spell.ops.some((o) => o.op === 'effect' && o.effect.id === 'gills' && o.effect.duration >= 120));
  assert.ok(classic.guilds!.some((g) => g.teaches.includes('deep-breath')), 'taught by a guild house');
  const herb = classic.shops.find((s) => s.keeper === 'herbalist');
  assert.ok(herb?.goods.some(([id]) => id === 'deep-draught'), 'the harbour herbalist sells it');
  assert.ok(classic.items.treasure.some((t) => t.items.some(([id]) => id === 'deep-draught')), 'found in treasure');
});

test('breath: diving takes the head under; out of breath the body comes up whatever is pressed', () => {
  const sea: WalkWorld = { height: () => -12, rockSurface: () => null, waterLevel: () => 0 };
  const w = new Walker(sea);
  w.place(0, 0);
  assert.equal(w.mode, 'swim');
  assert.ok(!w.headUnder, 'afloat, the head out');
  const swim = { forward: 0, strafe: 0, heading: 0, walk: false, up: false, down: true };
  for (let i = 0; i < 120; i++) w.step(swim, 1 / 60);
  assert.ok(w.headUnder, 'under after diving');
  // Out of breath: down still pressed, the body comes up.
  w.surfacing = true;
  for (let i = 0; i < 240; i++) w.step(swim, 1 / 60);
  assert.ok(!w.headUnder, 'up at the air again');
});
