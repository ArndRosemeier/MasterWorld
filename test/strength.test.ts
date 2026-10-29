import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic';
import { validateSetting, type AbilityDef, type SettingModule } from '../src/setting/contract';
import { Character } from '../src/game/character';
import { strengthOf } from '../src/game/growth';
import { Alone, Recipes } from '../src/game/recipe';
import { cellarFight } from './fightKit';

const g = classic.growth;
const ability = (id: string) => classic.abilities.find((a) => a.id === id)!;
const atLevel = (level: number, setting: SettingModule = classic) => { const h = new Character(setting); h.xp = setting.growth.xp[level - 1]; return h; };
const here = { x: 0, y: 0, z: 0 };

test('strength: the same ability at level 1 and level 10 differs as the setting says (G2)', () => {
  const dart = ability('fire-dart'), up = 10 - (dart.level ?? 1);
  const one = strengthOf(g, dart, dart.level ?? 1), ten = strengthOf(g, dart, 10);
  assert.deepEqual(one, { damage: 1, heal: 1, duration: 1, range: 1 }, 'at its own level as written');
  assert.ok(Math.abs(ten.damage - (1 + g.scale.damage * up)) < 1e-9);
  assert.ok(Math.abs(ten.duration - (1 + g.scale.duration * up)) < 1e-9);
  assert.ok(Math.abs(ten.range - (1 + g.scale.range * up)) < 1e-9);
  // Never weaker below its level (the debug menu may hand one out early).
  assert.deepEqual(strengthOf(g, ability('fireball'), 1), one);
  // Mend heals more at level 10, by the setting's share.
  const heal = (level: number) => {
    const h = atLevel(level);
    h.learn('mend');
    h.mana = h.maxMana;
    h.health = 1;
    const r = new Recipes(h, new Alone(h, () => here), classic.effects!, 1);
    assert.equal(r.begin(ability('mend'), null, here), null);
    for (let t = 0; t < 2; t += 0.1) r.elapse(0.1, here);
    return h.health - 1;
  };
  assert.ok(Math.abs(heal(10) / heal(1) - (1 + g.scale.heal * 9)) < 0.01, `${heal(1)} -> ${heal(10)}`);
});

test('strength: an ability\'s own scale overrides the setting\'s; spell power on the gear adds to spells only', () => {
  const steady: AbilityDef = { ...ability('fire-dart'), id: 'steady-dart', scale: { damage: 0 } };
  const setting: SettingModule = { ...classic, abilities: [...classic.abilities, steady] };
  assert.deepEqual(validateSetting(setting), []);
  assert.equal(strengthOf(g, steady, 15).damage, 1);
  assert.ok(strengthOf(g, steady, 15).duration > 1, 'the rest as the setting says');
  assert.ok(validateSetting({ ...classic, abilities: [...classic.abilities, { ...steady, scale: { damage: 2 } }] }).some((e) => e.includes('scale.damage')));
  assert.ok(Math.abs(strengthOf(g, ability('fire-dart'), 1, 10).damage - (1 + g.scale.spell * 10)) < 1e-9);
  assert.equal(strengthOf(g, ability('cleave'), 1, 10).damage, 1, 'an art gains nothing from spell power');
  // The hero reads it with their level and what they wear.
  const h = atLevel(6);
  h.worn.ring = { def: classic.items.items.find((i) => i.slot === 'ring')!.id, rarity: 'rare', name: 'Ring of embers', bonuses: { spell: 8 } };
  assert.deepEqual(h.strengthOf(ability('fire-dart')), strengthOf(g, ability('fire-dart'), 6, 8));
});

test('strength: a weapon blow grows with the level; a fresh hero hits as before', () => {
  const swing = ability('strike');
  const one = new Character(classic).blow(undefined, swing), ten = atLevel(10).blow(undefined, swing);
  assert.equal(one.power, 1);
  assert.ok(Math.abs(ten.power! - (1 + g.scale.damage * 9)) < 1e-9);
  assert.ok(atLevel(10).power > atLevel(1).power + 10, 'the VGM reads a grown hero as stronger');
  // A spell's effect lasts longer for a grown hero: the frost on a foe.
  const chill = (level: number) => {
    const { d, hero, foe, pose } = cellarFight(5);
    hero.xp = g.xp[level - 1];
    d.step(0.01, pose);
    d.fight.recipes.putOn(foe.id, { id: 'chilled', magnitude: 0.4, duration: 3 }, hero.strengthOf(ability('frost-shard')));
    return d.fight.recipes.listOf(foe.id).find((w) => w.def.id === 'chilled')!.left;
  };
  assert.ok(chill(12) > chill(1) * 1.15, `${chill(1)} -> ${chill(12)}`);
});
