import { test } from 'node:test';
import assert from 'node:assert/strict';
import { houseShape, planTown, signPlace } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { townsfolk } from '../src/sim/people';
import { Character } from '../src/game/character';
import { GuildBook, bardOf, guildHouses, openRank, rankRefusal, staffGuilds } from '../src/game/guilds';
import { takeLesson } from '../src/game/lessons';
import type { Decision, DecisionLog } from '../src/world/decisions';

const arms = classic.guilds!.find((g) => g.keeper === 'master-at-arms')!;
const lodge = classic.guilds!.find((g) => g.keeper === 'lodge-master')!;

test('guilds: a skill cannot rise before a trainer opens it; then use raises it up to its rank', () => {
  const hero = new Character(classic); // the caravan guard: blades open, shields not
  const book = new GuildBook(), log: DecisionLog = [];
  assert.equal(hero.rankOf('shields'), -1);
  const v = hero.skills.get('shields')!;
  for (let i = 0; i < 50; i++) hero.practise('shields', 20);
  assert.equal(hero.skills.get('shields'), v, 'no use counts before it is opened');
  hero.coins = 0;
  assert.equal(openRank(classic, arms, hero, 'shields', book, log), 'coin');
  hero.coins = 1000;
  assert.equal(openRank(classic, arms, hero, 'shields', book, log), null);
  assert.equal(hero.rankOf('shields'), 0);
  assert.equal(hero.coins, 1000 - classic.skillRanks![0].price);
  for (let i = 0; i < 3000; i++) hero.practise('shields', 30);
  assert.equal(hero.skills.get('shields'), classic.skillRanks![0].upTo, 'up to its rank, no further');
  // Skills open to everyone, and those no guild teaches, rise from the start.
  assert.equal(hero.rankOf('dodge'), 0);
  assert.equal(hero.rankOf('speech'), null);
  assert.equal(openRank(classic, lodge, hero, 'blades', book, log), 'not-taught');
});

test('guilds: a rank needs the one before earned by use, and the third the guild\'s task', () => {
  const hero = new Character(classic), book = new GuildBook();
  let log: Decision[] = [];
  hero.coins = 1e6;
  // Lessons stop short of the rank's top: the next rank waits for use.
  while (!takeLesson(hero, arms, 'blades'));
  assert.ok(hero.skills.get('blades')! < classic.skillRanks![0].upTo);
  assert.equal(rankRefusal(classic, arms, hero, 'blades', book, log), 'unearned');
  for (let i = 0; i < 3000 && hero.skills.get('blades')! < hero.capOf('blades'); i++) hero.practise('blades', 30);
  assert.equal(openRank(classic, arms, hero, 'blades', book, log), null);
  assert.equal(hero.rankOf('blades'), 1);
  hero.skills.set('blades', hero.capOf('blades'));
  assert.equal(rankRefusal(classic, arms, hero, 'blades', book, log), 'task');
  // The task: a place cleared after the trainer asked.
  const place: Decision = { kind: 'dungeon', id: 'cellar-1', template: 'cellar', town: 'town-1', building: 3, seed: 1, setPiece: 'x' };
  log = [place, { kind: 'kept', id: 'kept-1', promise: 'cellar-1', at: 5 }];
  assert.equal(book.taskDone(arms, log), false, 'not asked yet');
  book.assign('master-at-arms', 10);
  assert.equal(book.taskDone(arms, log), false, 'cleared before it was asked');
  log = [...log, { ...place, id: 'cellar-2' }, { kind: 'kept', id: 'kept-2', promise: 'cellar-2', at: 12 }];
  assert.equal(book.taskDone(arms, log), true);
  // The Lodge asks for a place out on the land: a cellar does not count.
  book.assign('lodge-master', 10);
  assert.equal(book.taskDone(lodge, log), false);
  const before = book.standing(arms, hero, log);
  assert.equal(openRank(classic, arms, hero, 'blades', book, log), null);
  assert.ok(book.standing(arms, hero, log) > before, 'standing with the guild grows');
  // Kept in a save.
  assert.equal(new GuildBook(JSON.parse(JSON.stringify(book.bookSave()))).taskDone(arms, log), true);
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.equal(again.rankOf('blades'), 2);
  // An older save: what the hero had, opened as far as it had come.
  const old = { ...hero.save(), ranks: undefined, skills: { ...hero.save().skills, axes: 30 } };
  assert.equal(new Character(classic, old).rankOf('axes'), 1);
});

test('guilds: houses in towns and villages, none in a hamlet; trainers and a bard', () => {
  const town = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const houses = guildHouses(town, 'town', classic);
  assert.deepEqual(houses.map((h) => h.guild.keeper), ['master-at-arms', 'lodge-master', 'locksmith']);
  assert.equal(new Set(houses.map((h) => h.b.id)).size, 3, 'each in its own house');
  assert.ok(houses.find((h) => h.guild.keeper === 'locksmith')!.guild.hidden);
  const folk = townsfolk(town, 3);
  staffGuilds(folk, houses);
  for (const h of houses) assert.ok(folk.some((p) => p.home === h.b.id && p.trade === h.guild.keeper), `${h.guild.keeper} has a trainer`);
  assert.ok(bardOf(folk, town), 'a bard at the inn');
  const village = planTown({ seed: 4, x: 0, z: 0, radius: 70, height: () => 10, size: 'village' });
  assert.deepEqual(guildHouses(village, 'village', classic).map((h) => h.guild.keeper), ['master-at-arms']);
  const hamlet = planTown({ seed: 5, x: 0, z: 0, radius: 45, height: () => 10, size: 'hamlet' });
  assert.deepEqual(guildHouses(hamlet, 'hamlet', classic), []);
});

test('guilds: no two guild houses next door to each other where the town has room', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const hs = guildHouses(planTown({ seed, x: 0, z: 0, radius: 72, height: () => 10 }), 'town', classic);
    for (const a of hs) for (const b of hs) if (a !== b) assert.ok(Math.hypot(a.b.cx - b.b.cx, a.b.cz - b.b.cz) >= 30, `seed ${seed}: ${a.guild.keeper} by ${b.guild.keeper}`);
  }
});

test('guilds: every guild house in a village or town has its trainer', () => {
  for (const size of ['village', 'town'] as const) {
    for (let seed = 1; seed <= 8; seed++) {
      const plan = planTown({ seed, x: 0, z: 0, radius: size === 'village' ? 55 : 72, height: () => 10, size });
      const folk = townsfolk(plan, seed), hs = guildHouses(plan, size, classic);
      staffGuilds(folk, hs);
      for (const h of hs) assert.equal(folk.filter((p) => p.trade === h.guild.keeper && p.work === h.b.id).length, 1, `${size} ${seed}: ${h.guild.keeper}`);
    }
  }
});

test('guilds: the open houses\' masters dress for their calling; the hidden one\'s keeper looks like anyone', () => {
  const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const folk = townsfolk(plan, 3);
  staffGuilds(folk, guildHouses(plan, 'town', classic));
  const by = (k: string) => folk.find((p) => p.trade === k)!;
  assert.equal(by('master-at-arms').dress, 'fighter');
  assert.equal(by('lodge-master').dress, 'traveller');
  assert.equal(by('locksmith').dress, undefined);
});

test('guilds: a guild with a sign takes a house with free front wall for it', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    for (const h of guildHouses(planTown({ seed, x: 0, z: 0, radius: 72, height: () => 10 }), 'town', classic)) {
      if (h.guild.sign && !h.guild.hidden) assert.ok(signPlace(h.b, houseShape(h.b))?.flat, `seed ${seed}: ${h.guild.keeper}`);
    }
  }
});
