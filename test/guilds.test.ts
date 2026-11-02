import { test } from 'node:test';
import assert from 'node:assert/strict';
import { houseShape, planTown, signPlace } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { townsfolk } from '../src/sim/people';
import { Character } from '../src/game/character';
import { abilityPrice, GuildBook, bardOf, guildHouses, staffGuilds, teach, teachingsOf, teachRefusal } from '../src/game/guilds';
import { Standing } from '../src/game/standing';
import type { Decision, DecisionLog } from '../src/world/decisions';

const arms = classic.guilds!.find((g) => g.keeper === 'master-at-arms')!;
const lodge = classic.guilds!.find((g) => g.keeper === 'lodge-master')!;

/** A hero raised to `level` (D58). */
const atLevel = (hero: Character, level: number): Character => { hero.xp = classic.growth.xp[level - 1]; return hero; };

test('guilds: a trainer teaches an ability for coin once the hero\'s level is up to it (D59: no skills)', () => {
  const hero = new Character(classic); // the caravan guard: knows cleave from their past
  const book = new GuildBook(), log: DecisionLog = [];
  const ability = (id: string) => classic.abilities.find((a) => a.id === id)!;
  assert.deepEqual(teachingsOf(classic, arms).map((a) => a.id), arms.teaches);
  assert.equal(teachRefusal(arms, hero, ability('cleave'), book, log), 'known', 'the past taught it');
  const bash = ability('bash');
  assert.equal(teachRefusal(arms, hero, bash, book, log), 'level', 'a fresh hero is not ready');
  atLevel(hero, bash.level!);
  hero.coins = abilityPrice(arms, bash) - 1;
  assert.equal(teach(arms, hero, bash, book, log), 'coin');
  hero.coins += 1;
  assert.equal(teach(arms, hero, bash, book, log), null);
  assert.ok(hero.knows('bash') && hero.coins === 0 && hero.bar.includes('bash'));
  assert.equal(teach(arms, hero, bash, book, log), 'known');
  assert.equal(teachRefusal(lodge, hero, bash, book, log), 'not-taught');
  // Dearer the higher the level: n^1.5 times the price of the first.
  assert.ok(abilityPrice(arms, ability('sunder')) > 4 * abilityPrice(arms, bash));
});

test('guilds: abilities from the task\'s level on wait for the guild\'s task: a place cleared after the trainer asked', () => {
  const hero = atLevel(new Character(classic), 10), book = new GuildBook();
  hero.coins = 1e6;
  const brace = classic.abilities.find((a) => a.id === 'brace')!;
  assert.ok(brace.level! >= arms.task.from);
  let log: Decision[] = [];
  assert.equal(teachRefusal(arms, hero, brace, book, log), 'task');
  const place: Decision = { kind: 'dungeon', id: 'cellar-1', template: 'cellar', town: 'town-1', building: 3, seed: 1, setPiece: 'x' };
  log = [place, { kind: 'kept', id: 'kept-1', promise: 'cellar-1', at: 5 }];
  assert.equal(book.taskDone(arms, log), false, 'not asked yet');
  book.assign('master-at-arms', 10);
  assert.equal(book.taskDone(arms, log), false, 'cleared before it was asked');
  assert.equal(book.thank(arms, log), false, 'nothing to thank for yet');
  log = [...log, { ...place, id: 'cellar-2' }, { kind: 'kept', id: 'kept-2', promise: 'cellar-2', at: 12 }];
  assert.equal(book.taskDone(arms, log), true);
  assert.equal(teach(arms, hero, brace, book, log), null);
  // The Lodge asks for a place out on the land: a cellar does not count.
  book.assign('lodge-master', 10);
  assert.equal(book.taskDone(lodge, log), false);
  // The Undercroft asks for a place below a house: a cave out on the land does not count, a cellar does.
  const under = classic.guilds!.find((g) => g.keeper === 'undercroft-keeper')!, cave: Decision = { ...place, id: 'cave-1', template: 'cave', site: { x: 0, z: 0, yaw: 0 } };
  const book2 = new GuildBook();
  book2.assign(under.keeper, 10);
  assert.equal(book2.taskDone(under, [cave, { kind: 'kept', id: 'kept-3', promise: 'cave-1', at: 12 }]), false);
  assert.equal(book2.taskDone(under, log), true);
  // Thanks for the task come once (a deed counts once, D54), and a save keeps that.
  assert.equal(book.thank(arms, log), true);
  assert.equal(book.thank(arms, log), false);
  const saved = new GuildBook(JSON.parse(JSON.stringify(book.bookSave())));
  assert.equal(saved.taskDone(arms, log), true);
  assert.equal(saved.thank(arms, log), false);
  assert.ok(new Character(classic, JSON.parse(JSON.stringify(hero.save()))).knows('brace'));
});

test('guilds: an old save\'s skills and ranks are dropped; what it learned and its gear stay, the gear\'s bonuses as qualities', () => {
  const hero = new Character(classic);
  const save = hero.save();
  const old = { ...save, skills: { blades: 30, dodge: 12 }, ranks: { blades: 2 }, worn: { ...save.worn, main: { def: 'short-sword', rarity: 'rare' as const, name: 'Old sword', bonuses: { blades: 6, dodge: 3, orientation: 4 } as never } } };
  const back = new Character(classic, JSON.parse(JSON.stringify(old)));
  assert.ok(back.knows('cleave'));
  assert.deepEqual(back.worn.main?.bonuses, { aim: 6, guard: 3 });
  assert.equal(back.bonus('aim'), 6);
  assert.equal(!('skills' in back.save()) && !('ranks' in back.save()), true);
});

test('guilds: repeating a deed adds nothing, to standing or experience', () => {
  const standing = new Standing(classic, 'human'), log: DecisionLog = [];
  const book = new GuildBook();
  book.assign('master-at-arms', 0);
  const done: DecisionLog = [{ kind: 'dungeon', id: 'c', template: 'cellar', town: 't', building: 1, seed: 1, setPiece: 'x' }, { kind: 'kept', id: 'k', promise: 'c', at: 1 }];
  const hero = new Character(classic);
  for (let i = 0; i < 5; i++) if (book.thank(arms, done)) { standing.deed(`task:${arms.keeper}`, 'human', classic.standing.task); hero.earn(`task:${arms.keeper}`, 'task'); }
  for (let i = 0; i < 5; i++) { standing.deed(`task:${arms.keeper}`, 'human', classic.standing.task); hero.earn(`task:${arms.keeper}`, 'task'); }
  assert.equal(hero.xp, classic.growth.deeds.task, 'the task counted once');
  assert.equal(standing.value('human'), classic.peoples.find((p) => p.id === 'human')!.kin + classic.standing.task);
  assert.equal(book.thank(arms, log), false);
  assert.equal(new Character(classic, JSON.parse(JSON.stringify(hero.save()))).earn(`task:${arms.keeper}`, 'task'), 0, 'a save keeps the deeds counted');
  standing.keptFor('dwarf', 'cave-1');
  assert.deepEqual(new Standing(classic, 'human', JSON.parse(JSON.stringify(standing.save()))).keptFor('dwarf', 'cave-1'), [], 'and the deeds done');
});

test('guilds: houses in towns and villages, none in a hamlet; trainers and a bard', () => {
  const town = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
  const houses = guildHouses(town, 'town', classic);
  assert.deepEqual(houses.map((h) => h.guild.keeper), ['master-at-arms', 'lodge-master', 'locksmith', 'hedge-witch', 'undercroft-keeper']);
  assert.equal(new Set(houses.map((h) => h.b.id)).size, 5, 'each in its own house');
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

test('guilds: only houses where fighting is taught are halls; the witch and the hidden houses are homes', () => {
  assert.deepEqual(classic.guilds!.filter((g) => g.hall).map((g) => g.keeper), ['master-at-arms', 'lodge-master']);
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
