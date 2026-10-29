/**
 * Trade (plan 11.5): the town's merchants with their stock and coin, what a thing is worth and what they
 * pay and ask for it. The smith, the inn's keeper and the market's traders each keep the setting's shop
 * for their trade. Stock is limited and seeded; what the hero sells stays on the shelf to be bought back;
 * over the days stock and coin come back towards what the shop likes to hold. Prices follow what the
 * town has: what a shop here makes is cheaper, and the more of a thing the town's merchants already hold,
 * the less they pay for it and the less they ask. The hero's speech (their level and gear) narrows the gap, and their
 * standing with the merchant's people (plan 11.6) moves it. Pure: saved
 * as plain data.
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import type { ItemCatalog, Rarity, SettingModule, ShopDef } from '../setting/contract';
import type { Person } from '../sim/people';
import { Character } from './character';
import { defOf, itemAs, plainItem, type Item } from './items';
import type { Standing } from './standing';
import { condition } from './upkeep';

/** How much more a rarer thing is worth than a plain one of its kind. */
const RARITY_WORTH: Record<Rarity, number> = { common: 1, uncommon: 2.5, rare: 6, legendary: 20 };
/** Copper per quality point an item adds. */
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
  /** The townsperson who keeps it, and their people (their standing with the hero moves the prices). */
  readonly person: number;
  readonly race: string;
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
  /** The hero's standing with each people (plan 11.6): a merchant asks more and pays less of someone their people dislikes. */
  standing: Standing | null = null;

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
        ? { person: p.id, race: p.race, shop, stock: [...was.stock], coins: was.coins, day: was.day }
        : { person: p.id, race: p.race, shop, stock: this.fresh(shop, p.id), coins: shop.purse, day };
      this.merchants.push(m);
      this.byPerson.set(p.id, m);
    }
    this.restock(day);
  }

  /** The merchant a townsperson is, or null. */
  of(person: number): Merchant | null { return this.byPerson.get(person) ?? null; }

  /** A shop's first stock: some of each of its goods, and its fine work. */
  private fresh(shop: ShopDef, person: number): Item[] {
    const r = new Rng(deriveSeed(this.seed, 'shop', person, 'open'));
    const out: Item[] = [];
    for (const [id, want] of shop.goods) for (let n = r.int(Math.ceil(want / 2), want); n > 0; n--) out.push(plainItem(this.cat, id));
    this.fineWork(shop, out, r);
    return out;
  }

  /** Make the fine pieces the shelf lacks: uncommon ones of any wearable good, the rare ones of the dearest. */
  private fineWork(shop: ShopDef, stock: Item[], r: Rng): void {
    const f = shop.fine;
    if (!f) return;
    const own = shop.goods.map(([id]) => defOf(this.cat, id)).filter((d) => d.slot);
    const dearest = [...own].sort((a, b) => b.value - a.value)[0];
    const has = (rarity: Rarity) => stock.filter((i) => i.rarity === rarity && own.some((d) => d.id === i.def)).length;
    for (let n = has('uncommon'); n < f.uncommon; n++) stock.push(itemAs(this.cat, r.pick(own).id, 'uncommon', f.danger, r));
    for (let n = has('rare'); n < f.rare; n++) stock.push(itemAs(this.cat, dearest.id, 'rare', f.danger, r));
  }

  /**
   * Days pass: each merchant's coin comes back halfway to their purse a day; on the shop's restock day
   * (every `restock` days, each shop on its own) the shelf is filled again: the plain goods to what they
   * like to hold, the fine work made anew where it was sold, old second-hand things sold on.
   */
  restock(day: number): void {
    for (const m of this.merchants) {
      for (let d = m.day + 1; d <= day; d++) {
        m.coins = Math.round(m.coins + (m.shop.purse - m.coins) * 0.5);
        if ((d + m.person) % m.shop.restock) continue;
        const r = new Rng(deriveSeed(this.seed, 'shop', m.person, d));
        for (const [id, want] of m.shop.goods) {
          const have = m.stock.filter((i) => i.def === id && i.rarity === 'common').length;
          for (let n = have; n < want; n++) m.stock.push(plainItem(this.cat, id));
        }
        this.fineWork(m.shop, m.stock, r);
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

  /** What a thing is worth across the counter: as new, less its wear, as the town has it. */
  private worthHere(item: Item): number { return itemWorth(this.cat, item) * condition(item) * this.townFactor(item.def); }

  /** What the merchant asks for one of their things, given the hero's speech. */
  asks(m: Merchant, item: Item, speech: number): number {
    return Math.max(1, Math.round(this.worthHere(item) * m.shop.asks * (1 - haggle(speech) / 2) * (this.standing?.prices(m.race).asks ?? 1)));
  }

  /** What the merchant pays for one of the hero's things (0: they do not buy that kind). */
  pays(m: Merchant, item: Item, speech: number): number {
    if (!m.shop.buys.includes(defOf(this.cat, item.def).kind)) return 0;
    return Math.max(1, Math.round(this.worthHere(item) * m.shop.pays * (1 + haggle(speech)) * (this.standing?.prices(m.race).pays ?? 1)));
  }

  /** The hero buys one of the merchant's things into the pack. */
  buy(hero: Character, m: Merchant, item: Item): Refusal {
    if (!m.stock.includes(item)) return 'gone';
    const price = this.asks(m, item, hero.speech);
    if (hero.coins < price) return 'coin';
    return this.hand(hero, m, item, m.stock, hero.pack, -price);
  }

  /** The hero sells a thing from the pack (not something worn). */
  sell(hero: Character, m: Merchant, item: Item): Refusal {
    if (!hero.pack.includes(item)) return Object.values(hero.worn).includes(item) ? 'worn' : 'gone';
    const price = this.pays(m, item, hero.speech);
    if (!price) return 'not-bought';
    if (m.coins < price) return 'their-coin';
    return this.hand(hero, m, item, hero.pack, m.stock, price);
  }

  /** The thing goes across the counter and the coin the other way (`gain`: the hero's). */
  private hand(hero: Character, m: Merchant, item: Item, from: Item[], to: Item[], gain: number): null {
    from.splice(from.indexOf(item), 1);
    to.push(item);
    hero.coins += gain;
    m.coins -= gain;
    return null;
  }

  /**
   * The best thing of the merchant's the hero can afford that makes them stronger once worn, and the
   * power it gives (the bot and the shop's "for you" mark use it); null if nothing does.
   */
  upgradeFor(hero: Character, m: Merchant): { item: Item; power: number } | null {
    const speech = hero.speech;
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

/** Items that are alike (same kind, rarity, name, bonuses and wear) in stacks, in the order first met. */
export function stackAlike(items: readonly Item[]): Item[][] {
  const by = new Map<string, Item[]>();
  for (const it of items) {
    const k = JSON.stringify([it.def, it.rarity, it.name, Object.entries(it.bonuses).sort(), it.wear ?? 0]);
    const s = by.get(k);
    if (s) s.push(it); else by.set(k, [it]);
  }
  return [...by.values()];
}

/** What a townsperson keeps, as the setting names keepers: their trade (the temple's keeper too), 'trader' at a market stall, '' for none. */
export function keeperOf(p: Person): string {
  return p.role === 'trader' ? 'trader' : p.role === 'trade' || p.role === 'keeper' ? p.trade : '';
}

/** The shop a townsperson keeps, if any: their own trade's, or the market's for a trader. */
export function shopOf(setting: SettingModule, p: Person): ShopDef | null {
  return setting.shops.find((s) => s.keeper === keeperOf(p)) ?? null;
}

