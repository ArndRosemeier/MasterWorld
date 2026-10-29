import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { Character } from '../src/game/character';
import { plainItem } from '../src/game/items';
import { abilityPrice, bardTells, GuildBook, guildHouses, houseIn, teach, teachingsOf, teachRefusal } from '../src/game/guilds';
import type { DecisionLog, RetreatDecision } from '../src/world/decisions';
import { parseSeed } from '@futuremagic/core';
import { openWorld } from '../src/vgm/builder';
import { Township } from '../src/game/township';
import { SMALL } from './small';

const witch = classic.guilds!.find((g) => g.keeper === 'hedge-witch')!;
const under = classic.guilds!.find((g) => g.keeper === 'undercroft-keeper')!;
const ability = (id: string) => classic.abilities.find((a) => a.id === id)!;
const log: DecisionLog = [];

test('teachers: the hedge witch teaches a first spell for a fresh hero\'s coin; mana comes with it (D59)', () => {
  const hero = new Character(classic), mend = ability('mend');
  assert.ok(hero.coins >= abilityPrice(witch, mend) && hero.maxMana === 0);
  assert.equal(teach(witch, hero, mend, new GuildBook(), log), null);
  assert.ok(hero.knows('mend') && hero.mana === hero.maxMana && hero.maxMana > 0);
  assert.ok(!hero.knows('regrowth'), 'only the spell taught');
  assert.ok(hero.bar.includes('mend'), 'onto the action bar');
});

test('teachers: further spells wait for the hero\'s level and cost more; spells of other schools are not taught here', () => {
  const hero = new Character(classic), book = new GuildBook();
  hero.coins = 1000;
  const skin = ability('stone-skin');
  assert.equal(teachRefusal(witch, hero, skin, book, log), 'level');
  hero.xp = classic.growth.xp[skin.level! - 1];
  const coins = hero.coins;
  book.assign(witch.keeper, 0);
  // The witch's task: a place out on the land cleared after she asked.
  const done: DecisionLog = [{ kind: 'dungeon', id: 'c', template: 'barrow', town: 't', building: 1, site: { x: 300, z: 0, yaw: 0 }, seed: 1, setPiece: 'x' }, { kind: 'kept', id: 'k', promise: 'c', at: 1 }];
  assert.equal(teachRefusal(witch, hero, skin, book, log), 'task');
  assert.equal(teach(witch, hero, skin, book, done), null);
  assert.ok(hero.knows('stone-skin') && hero.coins === coins - abilityPrice(witch, skin) && abilityPrice(witch, skin) > abilityPrice(witch, ability('mend')));
  assert.equal(teach(witch, hero, skin, book, done), 'known');
  assert.equal(teachRefusal(witch, hero, ability('fire-dart'), book, log), 'not-taught');
});

test('teachers: the hidden Undercroft teaches shadow and frost, but sells no bird form; the bard tells its way in', () => {
  assert.deepEqual(teachingsOf(classic, under).filter((a) => !a.school).map((a) => a.id), []);
  for (const g of classic.guilds!) assert.equal(teachRefusal(g, new Character(classic), ability('bird'), new GuildBook(), log), 'not-taught', `${g.keeper} does not sell it`);
  const book = new GuildBook();
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

test('teachers: a save keeps the spells learned and the mana that came with them', () => {
  const hero = new Character(classic);
  teach(witch, hero, ability('mend'), new GuildBook(), log);
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.ok(again.knows('mend') && again.maxMana === hero.maxMana && !again.knows('regrowth'));
  assert.equal(new Character(classic, JSON.parse(JSON.stringify(new Character(classic).save()))).maxMana, 0);
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
  // Fire asks a hero who has grown a little (D58).
  const hero = new Character(classic), dart = ability('fire-dart');
  assert.equal(teachRefusal(h.guild, hero, dart, new GuildBook(), log), 'level');
  hero.xp = classic.growth.xp[dart.level! - 1];
  hero.coins = 1000;
  assert.equal(teach(h.guild, hero, dart, new GuildBook(), log), null);
  assert.ok(hero.knows('fire-dart'));
});

test('teachers: a writing found below teaches its spell, brings mana and crumbles; read again it says so', () => {
  const hero = new Character(classic);
  const tome = plainItem(classic.items, 'tome-embers');
  hero.pack.push(tome);
  assert.equal(hero.readWriting(tome), null);
  assert.ok(hero.knows('fireball') && hero.maxMana > 0 && !hero.pack.includes(tome));
  hero.pack.push(tome);
  assert.match(hero.readWriting(tome) ?? '', /already/);
  // Writings lie in the treasure of places below, rarely.
  const found = new Set(classic.items.treasure.flatMap((t) => t.items.map(([id]) => id)));
  for (const w of classic.items.items.filter((i) => i.teaches)) assert.ok(found.has(w.id), `${w.id} can be found`);
});
