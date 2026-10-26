/**
 * Upkeep (plan 11.5, 11.2): gear wears as it is used and the smith mends it for coin; a room at the inn
 * restores the hero overnight and makes that inn the place they wake after a fall. Durability is light:
 * a worn blade still cuts, only less well, and nothing breaks for good. Pure.
 */
import type { TownPlan } from '@futuremagic/settlement';
import type { Rarity, Slot, UpkeepDef } from '../setting/contract';
import { buildingOf } from '../sim/people';
import type { Character } from './character';
import type { Item } from './items';

/** How much each use wears an item (1 is broken), before its sturdiness. */
export const WEAR = {
  /** The main hand, per blow that lands (a miss wears a third of it). */
  blow: 1 / 240,
  /** Each piece of armour worn, per blow taken. */
  hit: 1 / 260,
  /** The shield, per blow it stops. */
  block: 1 / 150,
} as const;

/** Rarer things are better made and wear more slowly. */
const STURDY: Record<Rarity, number> = { common: 1, uncommon: 0.85, rare: 0.7, legendary: 0.5 };

/** How much of its strength a broken item still has (a worn one lies between this and all of it). */
export const BROKEN_KEEPS = 0.5;

/** How worn an item is: 0 new, 1 broken (items from before wear are new). */
export function wearOf(it: Item): number { return it.wear ?? 0; }

/** What is left of it: 1 new, 0 broken. */
export function condition(it: Item): number { return 1 - wearOf(it); }

/** The share of its strength (damage, armour, block) a worn item still gives. */
export function strengthOf(it: Item | undefined): number {
  return it ? 1 - (1 - BROKEN_KEEPS) * wearOf(it) : 1;
}

/** The item a little more worn (a new object; items are plain data). */
export function wornBy(it: Item, amount: number): Item {
  const wear = Math.min(1, wearOf(it) + amount * STURDY[it.rarity]);
  return { ...it, wear: Math.round(wear * 10000) / 10000 };
}

/** The item as good as new. */
export function mended(it: Item): Item {
  const { wear: _, ...rest } = it;
  return rest;
}

export type WearState = 'new' | 'worn' | 'battered' | 'broken';

/** How it looks, for its card and the notes. */
export function wearState(it: Item): WearState {
  const w = wearOf(it);
  return w >= 1 ? 'broken' : w >= 0.6 ? 'battered' : w >= 0.25 ? 'worn' : 'new';
}

/** What mending it costs at the smith, copper; `worth` is what it is worth as new. */
export function repairCost(it: Item, worth: number, def: UpkeepDef): number {
  const w = wearOf(it);
  return w <= 0 ? 0 : Math.max(1, Math.round(worth * w * def.repair));
}

/** Something worn that the smith can mend, and its price. */
export interface Mend {
  readonly slot: Slot | 'ring2';
  readonly item: Item;
  readonly cost: number;
}

/** Everything the hero wears that needs mending, most worn first. */
export function mends(hero: Character, worth: (it: Item) => number, def: UpkeepDef): Mend[] {
  const out: Mend[] = [];
  for (const [slot, it] of Object.entries(hero.worn) as [Slot | 'ring2', Item | undefined][]) {
    if (it && wearOf(it) > 0) out.push({ slot, item: it, cost: repairCost(it, worth(it), def) });
  }
  return out.sort((a, b) => wearOf(b.item) - wearOf(a.item));
}

/** Mend one piece if the purse allows: whether it was done. */
export function mend(hero: Character, m: Mend): boolean {
  if (m.cost > hero.coins || hero.worn[m.slot] !== m.item) return false;
  hero.coins -= m.cost;
  hero.worn[m.slot] = mended(m.item);
  return true;
}

/**
 * Mend what the purse allows, most worn first: the coins spent, what was mended and what was not. A piece
 * that costs more than is left is skipped, so a cheaper one after it may still be done.
 */
export function mendAll(hero: Character, worth: (it: Item) => number, def: UpkeepDef): { readonly spent: number; readonly mended: readonly Item[]; readonly left: readonly Item[] } {
  let spent = 0;
  const done: Item[] = [], left: Item[] = [];
  for (const m of mends(hero, worth, def)) {
    if (mend(hero, m)) { spent += m.cost; done.push(m.item); } else left.push(m.item);
  }
  return { spent, mended: done, left };
}

/** Where the hero has a room: an inn of a town (the town's decision id, the building's index in its plan). */
export interface Lodging {
  readonly town: string;
  readonly building: number;
}

/** The game hour (hours since the world began) the hero wakes after a night's sleep that starts at `now`. */
export function morningAfter(now: number, rise: number): number {
  const day = Math.floor(now / 24), hour = now - day * 24;
  // Lying down in the small hours: up the same morning (but at least a few hours later).
  const sameDay = hour < rise - 4;
  return (sameDay ? day : day + 1) * 24 + rise;
}

/** What a night at the inn does: the room is paid, the hero sleeps till morning, wakes rested, and that inn is where they wake after a fall. */
export interface Night {
  /** The game hour they wake. */
  readonly wake: number;
  readonly paid: number;
  readonly lodging: Lodging;
}

/** Take a room for the night at an inn (null: the purse is too light). */
export function takeRoom(hero: Character, now: number, at: Lodging, def: UpkeepDef): Night | null {
  if (hero.coins < def.room) return null;
  hero.coins -= def.room;
  hero.health = hero.maxHealth;
  hero.stamina = hero.maxStamina;
  hero.lodging = at;
  return { wake: morningAfter(now, def.rise), paid: def.room, lodging: at };
}

/** Where a fallen hero wakes (plan 11.2): the inn where they last took a room, or else the temple, or else any inn. */
export type WakePlace = { readonly kind: 'room' | 'temple' | 'inn'; readonly building: number };

export function wakePlace(lodging: Lodging | null, town: string, plan: Pick<TownPlan, 'buildings'>): WakePlace | null {
  if (lodging && lodging.town === town && plan.buildings[lodging.building]?.kind === 'inn') return { kind: 'room', building: lodging.building };
  const temple = buildingOf(plan, 'temple');
  if (temple) return { kind: 'temple', building: temple.id };
  const inn = buildingOf(plan, 'inn');
  return inn ? { kind: 'inn', building: inn.id } : null;
}
