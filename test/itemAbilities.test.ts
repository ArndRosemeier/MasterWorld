import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { validateSetting, type SettingModule } from '../src/setting/contract';
import { Character } from '../src/game/character';
import { rollItem, uniqueItem } from '../src/game/items';
import { cellarFight } from './fightKit';

const lantern = classic.items.uniques.find((u) => u.id === 'lantern-blade')!;

test('item abilities: every legendary piece of the canon gives one, only items give them, nobody teaches them', () => {
  for (const u of classic.items.uniques) {
    const a = classic.abilities.find((x) => x.id === u.grants);
    assert.ok(a?.item && !a.taught, `${u.id} grants an item-only ability`);
  }
  const hero = new Character(classic);
  for (const a of classic.abilities.filter((x) => x.item)) {
    assert.ok(!hero.knows(a.id), `${a.id} not known at the start`);
    assert.equal(hero.learn(a.id), false, `${a.id} cannot be learned`);
  }
  const bad: SettingModule = { ...classic, abilities: classic.abilities.map((a) => (a.item ? { ...a, taught: true } : a)) };
  assert.ok(validateSetting(bad).some((e) => /item-only and cannot be taught/.test(e)));
});

test('item abilities: a found legendary carries its ability; worn it is on the bar, taken off it goes', () => {
  // Roll at a deep danger until the legendary blade turns up.
  const rng = new Rng(9);
  let found = null;
  for (let i = 0; i < 20000 && !found; i++) { const it = rollItem(classic.items, 'short-sword', 30, rng); if (it.rarity === 'legendary' && it.name === lantern.name) found = it; }
  assert.ok(found, 'the lantern blade turns up');
  assert.equal(found!.grants, 'deeplight');
  const hero = new Character(classic);
  hero.pack.push(found!);
  hero.equip(found!);
  assert.ok(hero.knows('deeplight') && hero.bar.includes('deeplight'));
  // Saved and loaded, it is still there.
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.ok(again.knows('deeplight') && again.bar.includes('deeplight'));
  hero.unequip('main');
  assert.ok(!hero.knows('deeplight') && !hero.bar.includes('deeplight'));
});

test('item abilities: a legendary from an older save gets its ability back', () => {
  const hero = new Character(classic);
  const { grants: _, ...old } = uniqueItem(lantern);
  const saved = { ...JSON.parse(JSON.stringify(hero.save())), worn: { ...hero.worn, main: old } };
  const loaded = new Character(classic, saved);
  assert.equal(loaded.worn.main?.grants, 'deeplight');
  assert.ok(loaded.knows('deeplight'));
});

test('item abilities: each plays in a cellar fight without fault', () => {
  for (const [i, u] of classic.items.uniques.entries()) {
    const { d, hero, foe, pose } = cellarFight(50 + i, 1.8, [uniqueItem(u)]);
    d.step(0.01, pose);
    d.fight.pick(foe);
    const stamina = hero.stamina;
    assert.equal(d.fight.use(u.grants!), null, u.grants);
    const ev = Array.from({ length: 30 }, () => d.step(0.05, pose)).flat();
    assert.ok(ev.some((e) => e.kind === 'recipe' && e.event.kind === 'went'), `${u.grants} went off`);
    assert.ok(hero.stamina < stamina, `${u.grants} cost stamina`);
  }
});
