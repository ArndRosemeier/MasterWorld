import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Rng } from '@futuremagic/core';
import { planTown } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic';
import { townsfolk } from '../src/sim/people';
import { Character } from '../src/game/character';
import { plainItem, rollLoot, type Item } from '../src/game/items';
import { Market, itemWorth, type Merchant } from '../src/game/trade';

const plan = planTown({ seed: 3, x: 0, z: 0, radius: 72, height: () => 10 });
const folk = townsfolk(plan, 3);
const market = (day = 0, saved?: ReturnType<Market['save']>) => new Market(classic, folk, 3, day, saved);
const keeper = (m: Market, k: string): Merchant => {
  const x = m.merchants.find((y) => y.shop.keeper === k);
  assert.ok(x, `a ${k} in town`);
  return x;
};

test('trade: the smith, the inn and the market stalls keep shops with limited stock and coin', () => {
  const m = market();
  for (const k of ['smith', 'innkeeper', 'trader']) {
    const s = keeper(m, k);
    assert.ok(s.stock.length > 0 && s.stock.length < 40, `${k}: ${s.stock.length} things`);
    assert.equal(s.coins, s.shop.purse);
  }
  // Seeded: the same town, the same shelves.
  assert.deepEqual(market().save(), m.save());
  // The smith's are rolled as finds: some are better than plain.
  assert.ok(keeper(m, 'smith').stock.length >= 10);
});

test('trade: a seeded hero sells a find and buys an upgrade (done-check A2)', () => {
  const m = market();
  const hero = new Character(classic);
  const loot = rollLoot(classic.items, 'lair', 12, new Rng(7));
  hero.pack.push(...loot.items);
  hero.coins += loot.coins;
  const trader = keeper(m, 'trader'), smith = keeper(m, 'smith');
  // Sell every find someone in town buys.
  const before = hero.coins;
  for (const it of [...hero.pack]) {
    const to = [smith, trader].find((s) => m.pays(s, it, hero.skill('speech')) > 0 && s.coins >= m.pays(s, it, hero.skill('speech')));
    if (to) assert.equal(m.sell(hero, to, it), null);
  }
  assert.ok(hero.coins > before, `sold for ${hero.coins - before} copper`);
  assert.ok(loot.items.some((i) => trader.stock.includes(i) || smith.stock.includes(i)), 'what was sold is on their shelf');
  // Buy the best upgrade the smith has, and wear it.
  const power = hero.power;
  const up = m.upgradeFor(hero, smith);
  assert.ok(up, `an upgrade for ${hero.coins} copper at power ${power}`);
  assert.equal(m.buy(hero, smith, up.item), null);
  hero.equip(up.item);
  assert.ok(hero.power > power, `power ${power} -> ${hero.power}`);
  assert.ok(!smith.stock.includes(up.item));
});

test('trade: they ask more than they pay, speech narrows it, and rarer is dearer', () => {
  const m = market(), s = keeper(m, 'smith');
  const sword = plainItem(classic.items, 'short-sword');
  assert.ok(m.pays(s, sword, 10) < m.asks(s, sword, 10));
  assert.ok(m.pays(s, sword, 60) > m.pays(s, sword, 10));
  assert.ok(m.asks(s, sword, 60) < m.asks(s, sword, 10));
  const keen: Item = { ...sword, rarity: 'rare', name: 'Keen short sword of the Edge', bonuses: { blades: 7, dodge: 3 } };
  assert.ok(itemWorth(classic.items, keen) > itemWorth(classic.items, sword) * 5);
});

test('trade: prices follow what the town has; a glut pays less, and they keep their kind', () => {
  const m = market(), inn = keeper(m, 'innkeeper'), trader = keeper(m, 'trader');
  const hero = new Character(classic);
  const pelt = () => plainItem(classic.items, 'wolf-pelt');
  const first = m.pays(trader, pelt(), 12);
  for (let k = 0; k < 4; k++) { const p = pelt(); hero.pack.push(p); assert.equal(m.sell(hero, trader, p), null); }
  assert.ok(m.pays(trader, pelt(), 12) < first, 'the fifth pelt fetches less');
  // Made in town is cheaper than brought in: bread (the inn bakes) against a pelt's worth.
  assert.ok(m.townFactor('bread') < m.townFactor('garnet'));
  // The innkeeper buys no swords.
  const sword = plainItem(classic.items, 'short-sword');
  hero.pack.push(sword);
  assert.equal(m.sell(hero, inn, sword), 'not-bought');
});

test('trade: no coin, no sale; their purse and shelves come back over the days; saves carry over', () => {
  const m = market(), s = keeper(m, 'smith');
  const hero = new Character(classic);
  hero.coins = 0;
  assert.equal(m.buy(hero, s, s.stock[0]), 'coin');
  hero.coins = 100_000;
  const n = s.stock.length;
  for (const it of [...s.stock].slice(0, 6)) assert.equal(m.buy(hero, s, it), null);
  assert.equal(s.stock.length, n - 6);
  const rich = s.coins;
  assert.ok(rich > s.shop.purse);
  // Worn things are not sold off the hero's back.
  const worn = hero.worn.main!;
  assert.equal(m.sell(hero, s, worn), 'worn');
  // A merchant short of coin cannot buy.
  s.coins = 0;
  hero.pack.push(plainItem(classic.items, 'mace'));
  assert.equal(m.sell(hero, s, hero.pack[hero.pack.length - 1]), 'their-coin');
  const saved = m.save();
  const again = market(0, saved);
  assert.deepEqual(again.save(), saved);
  again.restock(3);
  const s2 = keeper(again, 'smith');
  assert.ok(s2.coins > s.shop.purse * 0.8, `${s2.coins} copper after three days`);
  assert.ok(s2.stock.length > n - 6, 'the smith made some again');
});
