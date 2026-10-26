import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { townsfolk } from '../src/sim/people';
import { Character } from '../src/game/character';
import { lessonPrice, lessonsFor, takeLesson, teacherOf } from '../src/game/lessons';

const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
const folk = townsfolk(plan, 3);
const teachers = folk.map((p) => teacherOf(classic, p)).filter((t) => t);

test('lessons: the smith, the old caravan guard and the innkeeper teach; homemakers do not', () => {
  const keepers = new Set(teachers.map((t) => t!.keeper));
  for (const k of ['smith', 'carter', 'innkeeper']) assert.ok(keepers.has(k), `a ${k} teaches`);
  assert.equal(folk.filter((p) => p.role === 'homemaker').map((p) => teacherOf(classic, p)).filter(Boolean).length, 0);
});

test('lessons: a lesson is one point for coin, dearer as the skill rises, none past what the teacher knows', () => {
  const smith = classic.trainers.find((t) => t.keeper === 'smith')!;
  const hero = new Character(classic);
  hero.coins = 0;
  const blades = Math.floor(hero.skills.get('blades')!);
  assert.equal(takeLesson(hero, smith, 'blades'), 'coin');
  assert.equal(takeLesson(hero, smith, 'speech'), 'not-taught');
  const price = lessonPrice(smith, blades);
  hero.coins = price;
  assert.equal(takeLesson(hero, smith, 'blades'), null);
  assert.equal(hero.coins, 0);
  assert.equal(hero.skills.get('blades'), blades + 1);
  // Rising: each point costs more than the one before, a lot more by the teacher's limit.
  for (let l = 0; l < smith.upTo - 1; l++) assert.ok(lessonPrice(smith, l + 1) > lessonPrice(smith, l));
  assert.ok(lessonPrice(smith, smith.upTo - 1) > lessonPrice(smith, 10) * 3);
  hero.skills.set('blades', smith.upTo);
  hero.coins = 1e6;
  assert.equal(takeLesson(hero, smith, 'blades'), 'taught-out');
  assert.equal(lessonsFor(classic, smith, hero).find((l) => l.skill === 'blades')!.price, null);
  // Fixed by the teacher: a stronger hero pays the same for the same level (D29).
  const strong = new Character(classic);
  strong.skills.set('axes', 30);
  assert.equal(lessonsFor(classic, smith, strong).find((l) => l.skill === 'maces')!.price, lessonsFor(classic, smith, new Character(classic)).find((l) => l.skill === 'maces')!.price);
});
