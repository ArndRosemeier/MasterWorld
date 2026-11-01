import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import { classic } from '../src/setting/classic';
import { Character, oldPoints } from '../src/game/character';
import { findChance, plainItem, rollLoot } from '../src/game/items';
import { GuildBook, questGift, teach, teachRefusal } from '../src/game/guilds';
import type { DecisionLog } from '../src/world/decisions';

const witch = classic.guilds!.find((g) => g.keeper === 'hedge-witch')!;
const ability = (id: string) => classic.abilities.find((a) => a.id === id)!;
const log: DecisionLog = [];
const POTION = 'learning-potion';

test('ability points (D61): a fresh hero has the first level\'s point, and every level brings one more', () => {
  const hero = new Character(classic);
  assert.equal(hero.points, classic.growth.points.perLevel);
  assert.equal(classic.growth.points.perLevel, 1);
  hero.gain(classic.growth.xp[3]);
  assert.equal(hero.level, 4);
  assert.equal(hero.points, 4, 'one for each level reached');
  hero.beginAs(classic.backgrounds[0]);
  assert.equal(hero.points, 1, 'a new life starts again with one');
});

test('ability points: a trainer takes one with the coin; without one free the lesson is refused and nothing is paid', () => {
  const hero = new Character(classic), book = new GuildBook();
  hero.coins = 1000;
  assert.equal(teach(witch, hero, ability('mend'), book, log), null);
  assert.equal(hero.points, 0);
  const regrowth = witch.teaches.map(ability).find((a) => a.id !== 'mend' && (a.level ?? 1) <= 1 + 1)!;
  hero.xp = classic.growth.xp[(regrowth.level ?? 1) - 1];
  const coins = hero.coins;
  assert.equal(teachRefusal(witch, hero, regrowth, book, log), 'point');
  assert.equal(teach(witch, hero, regrowth, book, log), 'point');
  assert.ok(!hero.knows(regrowth.id) && hero.coins === coins, 'not learned, not paid');
  hero.gain(classic.growth.xp[hero.level] - hero.xp);
  assert.equal(hero.points, 1);
  assert.equal(teach(witch, hero, regrowth, book, log), null);
  assert.ok(hero.knows(regrowth.id) && hero.points === 0);
});

test('ability points: a writing needs a free point, else it stays in the pack until the hero has grown', () => {
  const hero = new Character(classic), tome = plainItem(classic.items, 'tome-embers');
  hero.points = 0;
  hero.pack.push(tome);
  assert.match(hero.readWriting(tome) ?? '', /ability point/);
  assert.ok(!hero.knows('fireball') && hero.pack.includes(tome), 'it waits in the pack');
  hero.points = 1;
  assert.equal(hero.readWriting(tome), null);
  assert.ok(hero.knows('fireball') && hero.points === 0 && !hero.pack.includes(tome));
});

test('ability points: a deed\'s gift, a worn item\'s ability and the background\'s cost none', () => {
  const hero = new Character(classic);
  const bg = classic.backgrounds.find((b) => b.abilities.length)!;
  hero.beginAs(bg);
  assert.equal(hero.points, 1, 'the background\'s abilities took nothing');
  // The Undercroft keeper's gift (C14): learned without a point.
  const under = classic.guilds!.find((g) => g.quest)!;
  const kept: DecisionLog = [{ kind: 'dungeon', id: 'q', template: 'barrow', town: 't', building: 1, site: { x: 300, z: 0, yaw: 0 }, seed: 1, setPiece: 'x', quest: under.keeper }, { kind: 'kept', id: 'k', promise: 'q', at: 1 }];
  hero.points = 0;
  assert.equal(questGift(classic, kept, 'q', hero)?.reward, under.quest!.reward);
  assert.ok(hero.knows(under.quest!.reward) && hero.points === 0);
  // A legendary item's ability comes with wearing it, at no cost.
  const u = classic.items.uniques.find((x) => x.grants)!;
  const it = { def: u.base, rarity: 'legendary' as const, name: u.name, bonuses: {}, grants: u.grants };
  hero.pack.push(it);
  hero.equip(it);
  assert.ok(hero.knows(u.grants!) && hero.points === 0);
});

test('ability points: the potion of learning gives one when drunk, and heals nothing', () => {
  const hero = new Character(classic), potion = plainItem(classic.items, POTION);
  hero.points = 0;
  hero.pack.push(potion);
  assert.ok(!hero.remedies.includes(potion), 'not taken for a healing draught');
  assert.equal(hero.consume(potion), 0);
  assert.equal(hero.points, 1);
  assert.ok(!hero.pack.includes(potion), 'drunk');
});

test('ability points: kept in the save; an old save gets one a level, less what it learned (not its background\'s)', () => {
  const hero = new Character(classic);
  hero.gain(classic.growth.xp[2]);
  hero.points = 2;
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.equal(again.points, 2);
  const bg = classic.backgrounds.find((b) => b.abilities.length)!;
  // An old save at level 5 that learned two abilities besides its background's.
  const learned = [...bg.abilities, 'mend', 'regrowth'];
  const old = { ...hero.save(), points: undefined, background: bg.id, learned, xp: classic.growth.xp[4] };
  assert.equal(new Character(classic, JSON.parse(JSON.stringify(old))).points, 5 - 2);
  assert.equal(oldPoints(classic, 1, bg.id, [...bg.abilities, 'mend', 'regrowth', 'fireball']), 0, 'never fewer than none');
});

test('ability points: the potion lies only in treasure (hoards, chests, stashes, wrecks), likelier the more dangerous, never on a body or at a shop', () => {
  const holding = classic.items.treasure.filter((t) => t.finds?.some((f) => f.item === POTION)).map((t) => t.id).sort();
  assert.deepEqual(holding, ['cellar-chest', 'lair', 'stash', 'wreck']);
  const bodies = new Set(classic.creatures.map((c) => c.loot).filter(Boolean));
  for (const id of holding) assert.ok(!bodies.has(id), `${id} is no creature's loot`);
  assert.ok(classic.items.treasure.every((t) => !t.items.some(([id]) => id === POTION)), 'never in a table\'s usual items');
  assert.ok((classic.shops ?? []).every((s) => !s.goods.some(([id]) => id === POTION)), 'no trader sells it');
  const lair = classic.items.treasure.find((t) => t.id === 'lair')!.finds![0]!;
  const chest = classic.items.treasure.find((t) => t.id === 'cellar-chest')!.finds![0]!;
  // Uncommon: about one lair in ten at a fresh hero's danger, more in deep and deadly places; rarer in a chest.
  assert.ok(findChance(lair, 10) > 0.06 && findChance(lair, 10) < 0.13, `${findChance(lair, 10)}`);
  assert.ok(findChance(lair, 25) > findChance(lair, 10) && findChance(lair, 60) <= 0.3);
  assert.ok(findChance(chest, 7) < 0.03);
  // Rolled: the lair's hoard at danger 10 holds one about as often as the chance says.
  let found = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) if (rollLoot(classic.items, 'lair', 10, new Rng(1000 + i)).items.some((it) => it.def === POTION)) found++;
  assert.ok(Math.abs(found / N - findChance(lair, 10)) < 0.03, `${found} of ${N}`);
});

test('potion of learning: the light winds up the hero\'s body in one spiral and ends at the brow, never above it', async () => {
  const { moteAt } = await import('../src/app/spellFx/learningGlow');
  const feet = [10, 5, -3] as const;
  let seen = 0, last = -1;
  for (let t = 0; t < 3.6; t += 0.05) {
    for (let i = 0; i < 24; i++) {
      const at = moteAt(i, t, feet);
      if (!at) continue;
      seen++;
      assert.ok(at[1] >= feet[1] && at[1] <= feet[1] + 1.62 + 1e-9, `height ${at[1] - feet[1]}`);
      assert.ok(Math.hypot(at[0] - feet[0], at[2] - feet[2]) <= 0.83, 'within the body\'s width');
    }
  }
  assert.ok(seen > 100);
  // One after another: a later mote is never ahead of an earlier one of the same strand.
  for (let i = 0; i < 22; i++) {
    const a = moteAt(i, 1.5, feet), b = moteAt(i + 2, 1.5, feet);
    if (a && b) { assert.ok(b[1] <= a[1] + 1e-9); last = a[1]; }
  }
  assert.ok(last >= 0);
});
