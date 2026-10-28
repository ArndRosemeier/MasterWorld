import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic';
import { Character } from '../src/game/character';
import { GuildBook, openRank, questDue, questGift, spellRefusal } from '../src/game/guilds';
import { Standing } from '../src/game/standing';
import { openWorld } from '../src/vgm/builder';
import { questFor, questOf, questReward } from '../src/vgm/quests';
import { keepPromise } from '../src/vgm/leads';
import type { DecisionLog } from '../src/world/decisions';
import { SMALL } from './small';

const under = classic.guilds!.find((g) => g.keeper === 'undercroft-keeper')!;
const bird = under.quest!.reward;

test('quests: bird form is gained only through the Undercroft keeper\'s deed', () => {
  const seed = parseSeed('masterworld');
  const { terrain, log: first, home } = openWorld(seed, classic, SMALL);
  const town = terrain.towns[0], c = { seed, terrain, home, dungeons: classic.dungeons };
  const hero = new Character(classic);
  hero.coins = 1e6;
  // No trainer sells it, for any coin.
  for (const g of classic.guilds!) assert.notEqual(spellRefusal(classic, g, hero, classic.abilities.find((a) => a.id === bird)!), null);
  // The keeper speaks of it only to a student whose name is good enough.
  assert.equal(questDue(under, hero, 100, first), false, 'not a student');
  assert.equal(openRank(classic, under, hero, 'cryomancy', new GuildBook(), first, 0), null);
  assert.equal(questDue(under, hero, under.quest!.renown - 1, first), false, 'not known well enough');
  assert.equal(questDue(under, hero, under.quest!.renown, first), true);
  // The VGM makes its place: a kind the guild asks for, out on the land, its household the keeper's.
  const d = questFor({ guild: under, town, building: 7, hours: 30 }, { ...c, log: first })!;
  assert.ok(d && under.quest!.kinds.includes(d.template) && d.site, `a ${d?.template} out on the land`);
  assert.equal(d.quest, under.keeper);
  assert.equal(d.building, 7);
  let log: DecisionLog = [...first, d];
  assert.equal(questOf(log, under.keeper), d);
  assert.equal(questFor({ guild: under, town, building: 7, hours: 31 }, { ...c, log }), null, 'asked once');
  assert.equal(questDue(under, hero, 100, log), false, 'and never again');
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

test('quests: good deeds raise one reputation, each once; the keeper reads it wherever it was earned', () => {
  const s = new Standing(classic, 'elf');
  assert.equal(s.renown, 0, 'nobody has heard of a new hero');
  s.keptFor('dwarf', 'cave-1');
  s.deed('band:event-1', 'human', classic.standing.kept, true);
  s.deed('wolves:wild-3', 'halfling', classic.standing.help);
  s.deed('tend:traveller-2', 'human', classic.standing.help);
  for (const k of ['band:event-1', 'wolves:wild-3', 'tend:traveller-2']) assert.deepEqual(s.deed(k, 'human', 50), [], `${k} counts once`);
  assert.equal(s.renown, 2 * classic.standing.kept + 2 * classic.standing.help);
  assert.ok(s.renown >= under.quest!.renown, 'enough for the keeper, whoever was helped');
});
