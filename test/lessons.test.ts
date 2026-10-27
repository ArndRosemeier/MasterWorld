import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { townsfolk } from '../src/sim/people';
import { Character } from '../src/game/character';
import { guildHouses, staffGuilds } from '../src/game/guilds';
import { lessonPrice, lessonsFor, takeLesson, teacherOf } from '../src/game/lessons';

const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
const folk = townsfolk(plan, 3);
staffGuilds(folk, guildHouses(plan, 'town', classic));
const teachers = folk.map((p) => teacherOf(classic, p)).filter((t) => t);

test('lessons: the guild houses\' trainers and the innkeeper teach; homemakers do not', () => {
  const keepers = new Set(teachers.map((t) => t!.keeper));
  for (const k of ['master-at-arms', 'lodge-master', 'locksmith', 'innkeeper']) assert.ok(keepers.has(k), `${k} teaches`);
  // The smith's and the carter's lessons moved into the guild houses (D49).
  assert.ok(!keepers.has('smith') && !keepers.has('carter'));
  assert.equal(folk.filter((p) => p.role === 'homemaker').map((p) => teacherOf(classic, p)).filter(Boolean).length, 0);
});

test('lessons: a lesson is one point for coin, dearer as the skill rises, none past the rank or what the teacher knows', () => {
  const arms = classic.guilds!.find((t) => t.keeper === 'master-at-arms')!;
  const inn = classic.trainers.find((t) => t.keeper === 'innkeeper')!;
  const hero = new Character(classic);
  hero.coins = 0;
  const blades = Math.floor(hero.skills.get('blades')!);
  assert.equal(takeLesson(hero, arms, 'blades'), 'coin');
  assert.equal(takeLesson(hero, arms, 'speech'), 'not-taught');
  const price = lessonPrice(arms, blades);
  hero.coins = price;
  assert.equal(takeLesson(hero, arms, 'blades'), null);
  assert.equal(hero.coins, 0);
  assert.equal(hero.skills.get('blades'), blades + 1);
  // Rising: each point costs more than the one before.
  for (let l = 0; l < 40; l++) assert.ok(lessonPrice(arms, l + 1) > lessonPrice(arms, l));
  // Lessons stop short of the rank's top (the rest only use teaches, D49).
  hero.coins = 1e6;
  hero.skills.set('blades', 20);
  assert.equal(takeLesson(hero, arms, 'blades'), 'taught-out');
  assert.equal(lessonsFor(classic, arms, hero).find((l) => l.skill === 'blades')!.price, null);
  // A skill not opened yet takes no lessons (the caravan guard never learned shields).
  assert.equal(takeLesson(hero, arms, 'shields'), 'closed');
  // A skill no guild teaches: as far as its teacher knows.
  hero.skills.set('speech', inn.upTo);
  assert.equal(takeLesson(hero, inn, 'speech'), 'taught-out');
  // Fixed by the teacher: a stronger hero pays the same for the same level (D29).
  const strong = new Character(classic);
  strong.skills.set('axes', 30);
  assert.equal(lessonsFor(classic, arms, strong).find((l) => l.skill === 'maces')!.price, lessonsFor(classic, arms, new Character(classic)).find((l) => l.skill === 'maces')!.price);
});
