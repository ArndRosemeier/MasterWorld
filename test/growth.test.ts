import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classic } from '../src/setting/classic';
import { GROWTH_SOURCES } from '../src/setting/contract';
import { Character } from '../src/game/character';
import { carryRenown, evenDanger, fightXp, levelOf, levelOfDanger, topLevel } from '../src/game/growth';
import { fightBot } from '../src/game/bot';
import { plainItem } from '../src/game/items';
import { outlineCellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';

const g = classic.growth;
const danger = (id: string) => classic.creatures.find((c) => c.id === id)!.danger;

test('growth: twenty levels on a rising curve; a level adds health, stamina and mana', () => {
  assert.equal(topLevel(g), 20);
  assert.equal(levelOf(g, 0), 1);
  assert.equal(levelOf(g, g.xp[1] - 0.1), 1);
  assert.equal(levelOf(g, g.xp[1]), 2);
  assert.equal(levelOf(g, 1e9), 20);
  for (let i = 2; i < g.xp.length; i++) assert.ok(g.xp[i] - g.xp[i - 1] > g.xp[i - 1] - g.xp[i - 2], 'each level dearer than the last');
  const hero = new Character(classic), h = hero.maxHealth, s = hero.maxStamina;
  hero.learnToUse('mend');
  const m = hero.maxMana;
  assert.equal(hero.gain(g.xp[4]), 4, 'four levels at once');
  assert.equal(hero.level, 5);
  assert.equal(hero.maxHealth, h + 4 * g.perLevel.health);
  assert.equal(hero.maxStamina, s + 4 * g.perLevel.stamina);
  assert.equal(hero.maxMana, m + 4 * g.perLevel.mana);
  // A hero with no magic has no mana, whatever their level.
  const plain = new Character(classic);
  plain.gain(g.xp[9]);
  assert.equal(plain.maxMana, 0);
});

test('growth: every deed and discovery gives experience, each only once', () => {
  const hero = new Character(classic);
  let total = 0;
  for (const k of GROWTH_SOURCES) {
    const before = hero.xp;
    hero.earn(`${k}:one`, k);
    assert.equal(hero.xp - before, g.deeds[k], `${k} gives experience`);
    total += g.deeds[k];
    hero.earn(`${k}:one`, k);
    assert.equal(hero.xp, total, `${k} counts once`);
  }
  // A save keeps what was counted.
  const again = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.equal(again.xp, hero.xp);
  assert.equal(again.earn('kept:one', 'kept'), 0);
  // Learning and reading count as well, once each.
  const reader = new Character(classic);
  reader.learn('mend');
  assert.equal(reader.xp, g.deeds.learn);
  const tome = plainItem(classic.items, classic.items.items.find((i) => i.teaches && i.teaches !== 'mend')!.id);
  reader.pack.push(tome);
  assert.equal(reader.readWriting(tome), null);
  assert.equal(reader.xp, 2 * g.deeds.learn + g.deeds.read);
});

test('growth: a foe gives experience by its danger against the level; outgrown foes give next to nothing', () => {
  // An even fight gives its danger's worth; a stronger foe more (up to twice), a weaker one far less.
  assert.equal(fightXp(g, evenDanger(g, 3), 3), Math.round(evenDanger(g, 3) * g.fight * 10) / 10);
  assert.ok(fightXp(g, danger('ghoul'), 1) > fightXp(g, danger('goblin'), 1));
  assert.ok(fightXp(g, danger('goblin'), 1) > 5 * fightXp(g, danger('goblin'), 4));
  assert.equal(fightXp(g, danger('rat'), 3), 0);
  // A bot killing rats and giant rats for an hour past level 5 (one every ten seconds) gains less than a level.
  const hero = new Character(classic);
  hero.gain(g.xp[4]);
  for (let s = 0; s < 3600; s += 10) hero.gain(fightXp(g, danger(s % 20 ? 'rat' : 'giant rat'), hero.level));
  assert.equal(hero.level, 5, `${hero.xp} xp`);
  // The target card's level: an even fight at a level reads that level.
  for (const l of [1, 4, 12]) assert.equal(levelOfDanger(g, evenDanger(g, l)), l);
  assert.equal(levelOfDanger(g, danger('rat')), 1);
});

test('growth: a fight won gives experience; an old save\'s reputation becomes experience', () => {
  const hero = new Character(classic);
  const c = Array.from({ length: 24 }, (_, i) => outlineCellar(testDecision(i), testHouse(i), classic.dungeons.cellar)).find((x) => x.dweller.id === 'goblins')!;
  const r = fightBot(c, classic, 3, hero, 400);
  assert.ok(r.kills > 0);
  assert.ok(hero.xp > 0, 'the goblins gave experience');
  const old = new Character(classic);
  carryRenown(old, { ...old.save(), xp: undefined }, { renown: 35 });
  assert.equal(old.xp, 350);
  const now = new Character(classic);
  carryRenown(now, now.save(), { renown: 35 });
  assert.equal(now.xp, 0, 'a save with experience keeps it as it is');
});
