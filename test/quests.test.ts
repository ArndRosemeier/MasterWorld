import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic';
import { Character } from '../src/game/character';
import { GuildBook, questDue, questGift, teach, teachingsOf, teachRefusal } from '../src/game/guilds';
import { questFor, questOf, questReward, taskFor, taskOf } from '../src/vgm/quests';
import { keepPromise } from '../src/vgm/leads';
import type { DecisionLog } from '../src/world/decisions';
import { startWorld } from './frontierLand';

const under = classic.guilds!.find((g) => g.keeper === 'undercroft-keeper')!;
const bird = under.quest!.reward;

test('quests: bird form is gained only through the Undercroft keeper\'s deed', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log: first, home } = startWorld();
  const town = terrain.towns[0], c = { seed, terrain, home, dungeons: classic.dungeons };
  const hero = new Character(classic);
  hero.coins = 1e6;
  // No trainer sells it, for any coin.
  for (const g of classic.guilds!) assert.equal(teachRefusal(g, hero, classic.abilities.find((a) => a.id === bird)!, new GuildBook(), first), 'not-taught');
  // The keeper speaks of it only to a student of the level it asks (D58).
  hero.xp = classic.growth.xp[under.quest!.level - 1];
  assert.equal(questDue(under, hero, first), false, 'not a student');
  const frost = teachingsOf(classic, under).find((a) => a.school === 'cryomancy' && (a.level ?? 1) < under.task.from)!;
  assert.equal(teach(under, hero, frost, new GuildBook(), first), null);
  assert.equal(questDue(under, hero, first), true);
  hero.xp = classic.growth.xp[under.quest!.level - 2];
  assert.equal(questDue(under, hero, first), false, 'not grown enough');
  hero.xp = classic.growth.xp[under.quest!.level - 1];
  // The VGM makes its place: a kind the guild asks for, out on the land, its household the keeper's.
  const d = questFor({ guild: under, town, building: 7, hours: 30 }, { ...c, log: first })!;
  assert.ok(d && under.quest!.kinds.includes(d.template) && d.site, `a ${d?.template} out on the land`);
  assert.equal(d.quest, under.keeper);
  assert.equal(d.building, 7);
  let log: DecisionLog = [...first, d];
  assert.equal(questOf(log, under.keeper), d);
  assert.equal(questFor({ guild: under, town, building: 7, hours: 31 }, { ...c, log }), null, 'asked once');
  assert.equal(questDue(under, hero, log), false, 'and never again');
  // Not done yet: no gift. Cleared and told: the gift, once.
  assert.equal(questReward(classic, log, d.id), null);
  assert.equal(questGift(classic, log, d.id, hero), null);
  assert.ok(!hero.knows(bird));
  log = [...log, keepPromise(log, d.id, 40)!];
  assert.equal(questGift(classic, log, d.id, hero)?.reward, bird);
  assert.ok(hero.knows(bird));
  assert.equal(questGift(classic, log, d.id, hero), null, 'given once');
  // A place of a guild without a deed gives nothing.
  assert.equal(questReward(classic, [...log, { ...d, id: 'cave-9', quest: undefined }, { kind: 'kept', id: 'k9', promise: 'cave-9', at: 41 }], 'cave-9'), null);
});

test('quests: a guild\'s task names one place, of the kind it asks, and only that place does it', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log: first, home } = startWorld();
  const town = terrain.towns[0], c = { seed, terrain, home, dungeons: classic.dungeons };
  const guild = (k: string) => classic.guilds!.find((g) => g.keeper === k)!;
  // Below a house: a cellar, its household its own.
  const cellar = taskFor({ guild: under, town, building: 7, hours: 30 }, { ...c, log: first })!;
  assert.ok(cellar && !cellar.site && cellar.task === under.keeper && cellar.building !== 7, 'a cellar under a house of the town');
  // Out on the land: a place with a site, its household the trainer's.
  const witch = guild('hedge-witch'), out = taskFor({ guild: witch, town, building: 7, hours: 30 }, { ...c, log: first })!;
  assert.ok(out?.site && out.building === 7 && out.task === witch.keeper);
  let log: DecisionLog = [...first, cellar];
  assert.equal(taskOf(log, under.keeper), cellar);
  assert.equal(taskFor({ guild: under, town, building: 7, hours: 31 }, { ...c, log }), null, 'named once');
  const book = new GuildBook();
  book.assign(under.keeper, 30);
  // Another place kept does not do it, even a cellar.
  const other = { ...cellar, id: 'cellar-77', task: undefined };
  log = [...log, other, { kind: 'kept', id: 'k-77', promise: 'cellar-77', at: 40 }];
  assert.equal(book.taskDone(under, log), false, 'not the place named');
  log = [...log, keepPromise(log, cellar.id, 41)!];
  assert.equal(book.taskDone(under, log), true);
});
