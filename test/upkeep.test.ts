import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TownPlan } from '@futuremagic/settlement';
import { classic } from '../src/setting/classic/index';
import { Character } from '../src/game/character';
import { defOf, plainItem } from '../src/game/items';
import { fightBot } from '../src/game/bot';
import { outlineCellar } from '../src/world/dungeon/cellar';
import { testDecision, testHouse } from '../src/world/dungeon/variety';
import { WEAR, condition, mendAll, mends, morningAfter, repairCost, takeRoom, wakePlace, wearOf, wearState, wornBy } from '../src/game/upkeep';

const up = classic.upkeep;
const worth = (it: { def: string }) => defOf(classic.items, it.def).value;

test('upkeep: fighting wears the weapon and the armour, and worn gear strikes and guards less well', () => {
  const hero = new Character(classic);
  const sword = hero.worn.main!, jack = hero.worn.body!;
  const fresh = { damage: hero.weapon.damage[1], armour: hero.armour, power: hero.power };
  // A real cellar fight, played by the bot: the blade wears as it strikes, the armour as it is struck.
  const r = fightBot(outlineCellar(testDecision(1), testHouse(1), classic.dungeons.cellar), classic, 1, hero, 400);
  assert.ok(r.kills > 0, 'the bot fought');
  assert.ok(wearOf(hero.worn.main!) > 0, 'the blade is worn');
  assert.ok(wearOf(hero.worn.body!) > 0 || wearOf(hero.worn.head!) > 0, 'some armour is worn');
  assert.equal(wearOf(sword), 0, 'items are plain data: the old one is unchanged');
  // Half-broken: three quarters of its strength; broken: half.
  hero.worn.main = { ...sword, wear: 0.5 };
  hero.worn.body = { ...jack, wear: 1 };
  assert.ok(Math.abs(hero.weapon.damage[1] - fresh.damage * 0.75) < 1e-9);
  assert.ok(hero.armour < fresh.armour);
  assert.ok(hero.power < fresh.power, `power ${hero.power} < ${fresh.power}`);
  assert.equal(wearState(hero.worn.body!), 'broken');
});

test('upkeep: a blade lasts a few cellars, rarer things last longer, and the game hears when it looks worse', () => {
  const sword = plainItem(classic.items, 'short-sword');
  const blows = (it: typeof sword) => { let n = 0; while (wearOf(it) < 1) { it = wornBy(it, WEAR.blow); n++; } return n; };
  const common = blows(sword), rare = blows({ ...sword, rarity: 'rare' });
  assert.ok(common >= 150 && common <= 400, `${common} blows`);
  assert.ok(rare > common * 1.3);
  const hero = new Character(classic);
  let said = null;
  for (let i = 0; i < 400 && !said; i++) said = hero.wear('main', WEAR.blow);
  assert.equal(said?.state, 'worn');
  assert.equal(hero.wear('cloak', 0.5), null, 'nothing worn there: nothing happens');
});

test('upkeep: the smith mends for a share of the worth, most worn first, as far as the purse goes', () => {
  const hero = new Character(classic);
  const sword = hero.worn.main!, jack = hero.worn.body!;
  assert.equal(repairCost(sword, worth(sword), up), 0, 'nothing to mend');
  assert.deepEqual(mends(hero, worth, up), []);
  hero.worn.main = { ...sword, wear: 0.8 };
  hero.worn.body = { ...jack, wear: 0.2 };
  const list = mends(hero, worth, up);
  assert.deepEqual(list.map((m) => m.slot), ['main', 'body']);
  assert.equal(list[0].cost, Math.round(worth(sword) * 0.8 * up.repair));
  assert.ok(list[1].cost >= 1);
  // Enough only for the jack: the sword is left, the jack mended.
  hero.coins = list[1].cost;
  const poor = mendAll(hero, worth, up);
  assert.deepEqual(poor.mended.map((i) => i.def), [jack.def]);
  assert.deepEqual(poor.left.map((i) => i.def), [sword.def]);
  assert.equal(hero.coins, 0);
  assert.equal(condition(hero.worn.body!), 1);
  hero.coins = 1000;
  const rich = mendAll(hero, worth, up);
  assert.equal(rich.spent, list[0].cost);
  assert.equal(hero.coins, 1000 - list[0].cost);
  assert.equal(hero.worn.main!.wear, undefined, 'good as new');
});

test('upkeep: a room at the inn costs its price, restores the hero, wakes them in the morning and is where they wake after a fall', () => {
  assert.equal(morningAfter(20, 7), 31, 'evening of day 0: up at 7 on day 1');
  assert.equal(morningAfter(24 + 1, 7), 24 + 7, 'one in the morning: up at 7 the same day');
  assert.equal(morningAfter(24 + 12, 7), 48 + 7, 'noon: the next morning');
  const hero = new Character(classic);
  hero.health = 5;
  hero.stamina = 1;
  hero.coins = up.room - 1;
  assert.equal(takeRoom(hero, 20, { town: 't', building: 3 }, up), null, 'too poor');
  assert.equal(hero.health, 5);
  hero.coins = up.room + 4;
  const night = takeRoom(hero, 20, { town: 't', building: 3 }, up)!;
  assert.equal(night.wake, 31);
  assert.equal(hero.coins, 4);
  assert.equal(hero.health, hero.maxHealth);
  assert.equal(hero.stamina, hero.maxStamina);
  assert.deepEqual(hero.lodging, { town: 't', building: 3 });
  // Saved and loaded, the hero still has their room (and their gear its wear).
  hero.worn.main = { ...hero.worn.main!, wear: 0.3 };
  const back = new Character(classic, JSON.parse(JSON.stringify(hero.save())));
  assert.deepEqual(back.lodging, { town: 't', building: 3 });
  assert.equal(back.worn.main!.wear, 0.3);
  // Where they wake: their room; without one the temple; a new life has no room.
  const plan = (...kinds: string[]) => ({ buildings: kinds.map((kind, id) => ({ id, kind })) }) as unknown as Pick<TownPlan, 'buildings'>;
  const town = plan('house', 'temple', 'smithy', 'inn');
  assert.deepEqual(wakePlace(back.lodging, 't', town), { kind: 'room', building: 3 });
  assert.deepEqual(wakePlace(null, 't', town), { kind: 'temple', building: 1 });
  assert.deepEqual(wakePlace({ town: 'elsewhere', building: 3 }, 't', town), { kind: 'temple', building: 1 });
  assert.deepEqual(wakePlace(null, 't', plan('inn')), { kind: 'inn', building: 0 });
  back.beginAs(classic.backgrounds[0]);
  assert.equal(back.lodging, null);
});
