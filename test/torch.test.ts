import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic as setting } from '../src/setting/classic/index';
import { Character } from '../src/game/character';

test('every new hero starts with a torch in the off hand, whatever their past', () => {
  const torch = setting.items.items.find((d) => d.id === 'torch');
  assert.equal(torch?.slot, 'off');
  for (const bg of setting.backgrounds) {
    const c = new Character(setting);
    c.beginAs(bg);
    assert.equal(c.worn.off?.def, 'torch', bg.id);
    assert.ok(c.worn.main, `${bg.id} keeps a one-handed weapon beside it`);
  }
});

test('a torch is no shield: it neither blocks nor adds a shield\'s knack to power', () => {
  const c = new Character(setting);
  c.beginAs(setting.backgrounds[0]);
  const lit = c.power;
  assert.equal(c.blockChance, 0);
  c.unequip('off');
  assert.equal(c.power, lit);
});
