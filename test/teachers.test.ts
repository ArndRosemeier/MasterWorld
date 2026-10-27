import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { Character } from '../src/game/character';
import { bardTells, GuildBook, guildHouses, houseIn, learnSpell, openRank, spellRefusal, spellsOf } from '../src/game/guilds';
import type { DecisionLog } from '../src/world/decisions';

const witch = classic.guilds!.find((g) => g.keeper === 'hedge-witch')!;
const under = classic.guilds!.find((g) => g.keeper === 'undercroft-keeper')!;
const ability = (id: string) => classic.abilities.find((a) => a.id === id)!;
const log: DecisionLog = [];

test('teachers: the hedge witch opens a school for a fresh hero’s coin, with its first spell and mana', () => {
  const hero = new Character(classic);
  assert.ok(hero.coins >= witch.openPrice! && hero.maxMana === 0);
  assert.equal(openRank(classic, witch, hero, 'vitae', new GuildBook(), log), null);
  assert.ok(hero.opened('vitae') && hero.knows('mend') && hero.mana === hero.maxMana && hero.maxMana > 0);
  assert.ok(!hero.knows('regrowth'), 'only the first spell comes with the school');
  assert.ok(hero.bar.includes('mend'), 'onto the action bar');
});

test('teachers: further spells wait for the school’s level and cost coin; other schools wait to be opened', () => {
  const hero = new Character(classic), book = new GuildBook();
  hero.coins = 1000;
  openRank(classic, witch, hero, 'geomancy', book, log);
  const skin = ability('stone-skin');
  assert.equal(spellRefusal(classic, witch, hero, skin), 'unearned');
  hero.skills.set('geomancy', skin.level!);
  const coins = hero.coins;
  assert.equal(learnSpell(classic, witch, hero, skin), null);
  assert.ok(hero.knows('stone-skin') && hero.coins < coins);
  assert.equal(learnSpell(classic, witch, hero, skin), 'known');
  assert.equal(spellRefusal(classic, witch, hero, ability('regrowth')), 'closed', 'vitae is not open');
  assert.equal(spellRefusal(classic, witch, hero, ability('fire-dart')), 'not-taught');
});

test('teachers: the hidden Undercroft teaches shadow, frost and bird form; the bard tells its way in', () => {
  assert.deepEqual(spellsOf(classic, under).filter((a) => !a.skill).map((a) => a.id), ['bird']);
  const hero = new Character(classic), book = new GuildBook();
  hero.coins = 1000;
  assert.equal(learnSpell(classic, under, hero, ability('bird')), null);
  assert.ok(hero.knows('bird'));
  const town = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const houses = guildHouses(town, 'town', classic);
  assert.ok(!book.onMap('town-1', under));
  const told = bardTells(classic, 'town-1', houses, book, () => 'Nell');
  assert.ok(told.some((t) => t.includes('Undercroft') && t.includes(under.way!)));
  assert.ok(told.some((t) => t.includes('hedge witch') && t.includes('vitae')));
  assert.ok(book.onMap('town-1', under) && houseIn('town-1', under.keeper));
  // The witch's cottage is at the town's edge, a little out of the way.
  const w = houses.find((h) => h.guild === witch)!, arms = houses.find((h) => h.guild.keeper === 'master-at-arms')!;
  assert.ok(Math.hypot(w.b.cx, w.b.cz) > Math.hypot(arms.b.cx, arms.b.cz));
});

test('teachers: a save made before the teachers never opens magic; one after keeps it', () => {
  const hero = new Character(classic);
  const old = JSON.parse(JSON.stringify(hero.save()));
  delete old.ranks;
  const back = new Character(classic, old);
  for (const k of ['vitae', 'geomancy', 'umbramancy', 'cryomancy']) assert.ok(!back.opened(k), k);
  hero.coins = 100;
  openRank(classic, witch, hero, 'vitae', new GuildBook(), log);
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.ok(again.opened('vitae') && again.knows('mend') && !again.opened('geomancy'));
});
