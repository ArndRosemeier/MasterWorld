import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { Character } from '../src/game/character';
import { plainItem } from '../src/game/items';
import { bardTells, GuildBook, guildHouses, houseIn, learnSpell, openRank, spellRefusal, spellsOf } from '../src/game/guilds';
import type { DecisionLog, RetreatDecision } from '../src/world/decisions';
import { parseSeed } from '@futuremagic/core';
import { openWorld } from '../src/vgm/builder';
import { Township } from '../src/game/township';
import { SMALL } from './small';

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
  const told = bardTells(classic, { id: 'town-1', x: 0, z: 0 }, houses, book, () => 'Nell');
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

test('teachers: the warden keeps watch at a half-ruined tower past the start town’s fields and teaches fire and light', () => {
  const { terrain, log } = openWorld(parseSeed('masterworld'), classic, SMALL);
  const town = terrain.towns[0], d = town.decision;
  const r = log.find((x): x is RetreatDecision => x.kind === 'retreat')!;
  assert.ok(r && r.keeper === 'tower-warden' && r.town === d.id);
  const far = Math.hypot(r.x - d.x, r.z - d.z);
  assert.ok(far > d.radius + 100 && far < d.radius + 800, `${far.toFixed(0)} m out`);
  assert.equal(terrain.waterDepth(r.x, r.z), 0);
  const t = new Township(town, { seed: parseSeed('masterworld'), setting: classic, log: () => log, hours: () => 10 });
  const h = t.guilds.find((x) => x.guild.keeper === 'tower-warden')!;
  assert.ok(h && h.out === r, 'the warden belongs to the start town');
  const a = t.life.agents.find((x) => x.person.trade === 'tower-warden')!;
  assert.ok(a && Math.hypot(a.x - r.x, a.z - r.z) < 6 && !a.hidden, 'at the door');
  for (let i = 0; i < 50; i++) t.life.step(60, 10 + i);
  assert.ok(Math.hypot(a.x - r.x, a.z - r.z) < 6, 'and stays there day and night');
  const told = bardTells(classic, d, t.guilds, new GuildBook(), () => 'Odo');
  assert.ok(told.some((x) => x.includes('half-ruined tower') && x.includes('pyromancy') && /(north|south|east|west)/.test(x)), told.join(' | '));
  const hero = new Character(classic);
  assert.equal(openRank(classic, h.guild, hero, 'pyromancy', new GuildBook(), log), null);
  assert.ok(hero.knows('fire-dart'));
});

test('teachers: a writing found below teaches its spell, opens its school and crumbles; read again it says so', () => {
  const hero = new Character(classic);
  const tome = plainItem(classic.items, 'tome-embers');
  hero.pack.push(tome);
  assert.equal(hero.readWriting(tome), null);
  assert.ok(hero.knows('fireball') && hero.opened('pyromancy') && hero.maxMana > 0 && !hero.pack.includes(tome));
  hero.pack.push(tome);
  assert.match(hero.readWriting(tome) ?? '', /already/);
  // Writings lie in the treasure of places below, rarely.
  const found = new Set(classic.items.treasure.flatMap((t) => t.items.map(([id]) => id)));
  for (const w of classic.items.items.filter((i) => i.teaches)) assert.ok(found.has(w.id), `${w.id} can be found`);
});
