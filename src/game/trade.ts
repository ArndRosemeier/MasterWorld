/**
 * Trade (plan 11.5): the town's merchants with their stock and coin, what a thing is worth and what they
 * pay and ask for it. The smith, the inn's keeper and the market's traders each keep the setting's shop
 * for their trade. Stock is limited and seeded; what the hero sells stays on the shelf to be bought back;
 * over the days stock and coin come back towards what the shop likes to hold. Prices follow what the
 * town has: what a shop here makes is cheaper, and the more of a thing the town's merchants already hold,
 * the less they pay for it and the less they ask. The hero's speech skill narrows the gap. Pure: saved
 * as plain data.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { ItemCatalog, Rarity, SettingModule, ShopDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { Character } from './character';
import { defOf, plainItem, rollItem, type Item } from './items';

/** How much more a rarer thing is worth than a plain one of its kind. */
const RARITY_WORTH: Record<Rarity, number> = { common: 1, uncommon: 2.5, rare: 6, legendary: 20 };
/** Copper per skill point an item adds. */
const BONUS_WORTH = 4;
/** Things a merchant keeps that they did not make, at most (the rest is sold on). */
const SECOND_HAND = 12;

/** What a thing is worth as new, in copper: its kind's value by its rarity, and what it adds. */
export function itemWorth(cat: ItemCatalog, item: Item): number {
  const bonus = Object.values(item.bonuses).reduce((a, b) => a + b, 0);
  return Math.round(defOf(cat, item.def).value * RARITY_WORTH[item.rarity] + bonus * BONUS_WORTH);
}

/** How much the hero's speech narrows a merchant's margin (0 .. 0.2). */
export function haggle(speech: number): number { return Math.min(0.2, Math.max(0, speech) / 300); }

export interface Merchant {
  /** The townsperson who keeps it. */
  readonly person: number;
  readonly shop: ShopDef;
  readonly stock: Item[];
  coins: number;
  /** The day the stock was last filled. */
  day: number;
}

export interface MerchantSave {
  readonly person: number;
  readonly keeper: string;
  readonly stock: readonly Item[];
  readonly coins: number;
  readonly day: number;
}
export type MarketSave = readonly MerchantSave[];

/** Why a trade did not happen (null: it did). */
export type Refusal = 'coin' | 'their-coin' | 'not-bought' | 'worn' | 'gone' | null;

export class Market {
  readonly merchants: Merchant[] = [];
  private readonly byPerson = new Map<number, Merchant>();
  private readonly cat: ItemCatalog;
  /** Item ids some shop in town makes. */
  private readonly made = new Set<string>();

  /** The town's merchants: each keeper of a shop's trade (or a market trader) gets that shop. */
  constructor(private readonly setting: SettingModule, people: readonly Person[], private readonly seed: number, day: number, saved?: MarketSave) {
    this.cat = setting.items;
    const kept = new Map<string, number>();
    for (const p of people) {
      const shop = shopOf(setting, p);
      if (!shop || (kept.get(shop.keeper) ?? 0) >= (shop.most ?? Infinity)) continue;
      kept.set(shop.keeper, (kept.get(shop.keeper) ?? 0) + 1);
      for (const [id] of shop.goods) this.made.add(id);
      const was = saved?.find((m) => m.person === p.id && m.keeper === shop.keeper);
      const m: Merchant = was
        ? { person: p.id, shop, stock: [...was.stock], coins: was.coins, day: was.day }
        : { person: p.id, shop, stock: this.fresh(shop, p.id), coins: shop.purse, day };
      this.merchants.push(m);
      this.byPerson.set(p.id, m);
    }
    this.restock(day);
  }

  /** The merchant a townsperson is, or null. */
  of(person: number): Merchant | null { return this.byPerson.get(person) ?? null; }

  /** A shop's first stock: some of each of its goods. */
  private fresh(shop: ShopDef, person: number): Item[] {
    const r = new Rng(deriveSeed(this.seed, 'shop', person, 'open'));
    const out: Item[] = [];
    for (const [id, want] of shop.goods) for (let n = r.int(Math.ceil(want / 2), want); n > 0; n--) out.push(this.forge(shop, id, r));
    return out;
  }

  private forge(shop: ShopDef, id: string, r: Rng): Item {
    return shop.quality ? rollItem(this.cat, id, shop.quality, r) : plainItem(this.cat, id);
  }

  /**
   * A new day (or days): each merchant's coin comes back halfway to their purse a day, a missing piece of
   * their own goods is made again with an even chance a day, and old second-hand things are sold on.
   */
  restock(day: number): void {
    for (const m of this.merchants) {
      for (let d = m.day + 1; d <= day; d++) {
        const r = new Rng(deriveSeed(this.seed, 'shop', m.person, d));
        m.coins = Math.round(m.coins + (m.shop.purse - m.coins) * 0.5);
        for (const [id, want] of m.shop.goods) {
          const have = m.stock.filter((i) => i.def === id).length;
          for (let n = have; n < want; n++) if (r.chance(0.5)) m.stock.push(this.forge(m.shop, id, r));
        }
        const own = new Set(m.shop.goods.map(([id]) => id));
        const second = m.stock.filter((i) => !own.has(i.def));
        for (const i of second.slice(0, Math.max(0, second.length - SECOND_HAND))) m.stock.splice(m.stock.indexOf(i), 1);
      }
      m.day = Math.max(m.day, day);
    }
  }

  /** How many of a kind the town's merchants hold. */
  held(id: string): number {
    let n = 0;
    for (const m of this.merchants) for (const i of m.stock) if (i.def === id) n++;
    return n;
  }

  /** What the town has sets the price: made here is cheaper, and plenty of it cheaper still (0.7 .. 1.3). */
  townFactor(id: string): number {
    const scarce = Math.min(1.15, Math.max(0.8, 1.15 - 0.05 * this.held(id)));
    return (this.made.has(id) ? 0.9 : 1.13) * scarce;
  }

  /** What the merchant asks for one of their things, given the hero's speech. */
  asks(m: Merchant, item: Item, speech: number): number {
    return Math.max(1, Math.round(itemWorth(this.cat, item) * m.shop.asks * this.townFactor(item.def) * (1 - haggle(speech) / 2)));
  }

  /** What the merchant pays for one of the hero's things (0: they do not buy that kind). */
  pays(m: Merchant, item: Item, speech: number): number {
    if (!m.shop.buys.includes(defOf(this.cat, item.def).kind)) return 0;
    return Math.max(1, Math.round(itemWorth(this.cat, item) * m.shop.pays * this.townFactor(item.def) * (1 + haggle(speech))));
  }

  /** The hero buys one of the merchant's things into the pack. */
  buy(hero: Character, m: Merchant, item: Item): Refusal {
    if (!m.stock.includes(item)) return 'gone';
    const price = this.asks(m, item, hero.skill('speech'));
    if (hero.coins < price) return 'coin';
    return this.hand(hero, m, item, m.stock, hero.pack, -price);
  }

  /** The hero sells a thing from the pack (not something worn). */
  sell(hero: Character, m: Merchant, item: Item): Refusal {
    if (!hero.pack.includes(item)) return Object.values(hero.worn).includes(item) ? 'worn' : 'gone';
    const price = this.pays(m, item, hero.skill('speech'));
    if (!price) return 'not-bought';
    if (m.coins < price) return 'their-coin';
    return this.hand(hero, m, item, hero.pack, m.stock, price);
  }

  /** The thing goes across the counter and the coin the other way (`gain`: the hero's), and speech is trained. */
  private hand(hero: Character, m: Merchant, item: Item, from: Item[], to: Item[], gain: number): null {
    from.splice(from.indexOf(item), 1);
    to.push(item);
    hero.coins += gain;
    m.coins -= gain;
    hero.practise('speech', bargain(Math.abs(gain)));
    return null;
  }

  /**
   * The best thing of the merchant's the hero can afford that makes them stronger once worn, and the
   * power it gives (the bot and the shop's "for you" mark use it); null if nothing does.
   */
  upgradeFor(hero: Character, m: Merchant): { item: Item; power: number } | null {
    const speech = hero.skill('speech');
    let best: { item: Item; power: number } | null = null;
    for (const item of m.stock) {
      if (!defOf(this.cat, item.def).slot || this.asks(m, item, speech) > hero.coins) continue;
      const trial = new Character(this.setting, hero.save());
      trial.pack.push(item);
      trial.equip(item);
      if (trial.power > (best?.power ?? hero.power)) best = { item, power: trial.power };
    }
    return best;
  }

  save(): MarketSave {
    return this.merchants.map((m) => ({ person: m.person, keeper: m.shop.keeper, stock: [...m.stock], coins: m.coins, day: m.day }));
  }
}

/** The shop a townsperson keeps, if any: their own trade's, or the market's for a trader. */
export function shopOf(setting: SettingModule, p: Person): ShopDef | null {
  const keeper = p.role === 'trader' ? 'trader' : p.role === 'trade' ? p.trade : '';
  return (keeper && setting.shops.find((s) => s.keeper === keeper)) || null;
}

/** How hard a bargain of this size trains speech (a skill level's worth of challenge). */
const bargain = (price: number) => 6 + Math.log2(1 + price) * 2;
