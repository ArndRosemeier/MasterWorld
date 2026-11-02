/**
 * Items as found (plan 11.5, D31, D59): a catalogue kind with its rarity and bonuses to its qualities, rolled from a seed
 * when a place's treasure or a creature's pack is opened. Uncommon finds add to one quality, rare ones two
 * and carry a name; legendary ones are the catalogue's named uniques, only where the danger is high
 * enough. Pure.
 */
import { Rng } from '@futuremagic/core';
import { QUALITIES, TOP_FIND, type EffectDef, type ItemCatalog, type ItemDef, type Quality, type Rarity, type TreasureFind, type UniqueDef } from '../setting/contract';

export interface Item {
  /** Catalogue id. */
  readonly def: string;
  readonly rarity: Rarity;
  readonly name: string;
  /** Quality → points while worn. */
  readonly bonuses: Partial<Readonly<Record<Quality, number>>>;
  readonly lore?: string;
  /** An item-only ability it gives while worn (D31, C5). */
  readonly grants?: string;
  /** How worn it is (game/upkeep.ts): 0 new .. 1 broken; absent: new. */
  readonly wear?: number;
  /** A household's keepsake (D62): the promise whose household asked for it back. Not for sale; handed back when told. */
  readonly keepsake?: string;
}

export interface Loot {
  readonly items: Item[];
  /** Copper pieces. */
  readonly coins: number;
}

/** Things that can be worn or held get a rarity; potions, food, tools and valuables are plain. */
const wearable = (d: ItemDef) => d.kind === 'weapon' || d.kind === 'shield' || d.kind === 'armour';

/** Chances of uncommon, rare and legendary at a danger (a fresh hero's places are about 5..12). */
export function rarityOdds(danger: number): Record<Exclude<Rarity, 'common'>, number> {
  return { uncommon: Math.min(0.4, 0.14 + danger * 0.012), rare: Math.min(0.18, 0.025 + danger * 0.004), legendary: danger >= 14 ? Math.min(0.03, 0.004 + (danger - 14) * 0.001) : 0 };
}

export function plainItem(cat: ItemCatalog, id: string): Item {
  const d = defOf(cat, id);
  return { def: id, rarity: 'common', name: d.name, bonuses: {}, ...(d.lore ? { lore: d.lore } : {}) };
}

/** The effect a draught puts on its drinker, of the setting's `effects` (undefined: none). */
export function draughtEffect(effects: readonly EffectDef[] | undefined, d: ItemDef): EffectDef | undefined {
  const id = d.effect?.id;
  return id === undefined ? undefined : effects?.find((e) => e.id === id);
}

/** The item of this id in the catalogue (undefined: none). */
export function findDef(cat: ItemCatalog, id: string): ItemDef | undefined {
  return cat.items.find((i) => i.id === id);
}

export function defOf(cat: ItemCatalog, id: string): ItemDef {
  const d = findDef(cat, id);
  if (!d) throw new Error(`no item "${id}"`);
  return d;
}

/** The qualities a found item may add to: what it is for first, then what fits its kind. */
function qualitiesFor(d: ItemDef): Quality[] {
  if (d.weapon) return ['aim', 'guard'];
  if (d.kind === 'shield') return ['block', 'armour'];
  if (d.slot === 'ring' || d.slot === 'amulet') return ['spell', 'stealth', 'speech', 'guard', 'health'];
  if (d.slot === 'feet' || d.slot === 'cloak') return ['stealth', 'guard'];
  return ['armour', 'guard', 'health'];
}

/** What an old save's skill bonus (before D59) adds to now; none: it goes (orientation, perception). */
const OLD_SKILL: Readonly<Record<string, Quality>> = {
  blades: 'aim', axes: 'aim', maces: 'aim', spears: 'aim', unarmed: 'aim', dodge: 'guard', shields: 'block', armour: 'armour', stealth: 'stealth', speech: 'speech',
  pyromancy: 'spell', cryomancy: 'spell', geomancy: 'spell', vitae: 'spell', luminism: 'spell', umbramancy: 'spell',
};

/** An item from a save before D59: its skill bonuses become bonuses to qualities. */
export function withQualities(it: Item): Item {
  const keys = Object.keys(it.bonuses);
  if (keys.every((k) => (QUALITIES as readonly string[]).includes(k))) return it;
  const bonuses: Partial<Record<Quality, number>> = {};
  for (const [k, v] of Object.entries(it.bonuses) as [string, number][]) {
    const q = (QUALITIES as readonly string[]).includes(k) ? (k as Quality) : OLD_SKILL[k];
    if (q) bonuses[q] = (bonuses[q] ?? 0) + v;
  }
  return { ...it, bonuses };
}

/** A named legendary item (plan 11.5) as found, with the ability it gives (C5). */
export function uniqueItem(u: UniqueDef): Item {
  return { def: u.base, rarity: 'legendary', name: u.name, bonuses: { ...u.bonuses }, lore: u.lore, ...(u.grants ? { grants: u.grants } : {}) };
}

/** One item of kind `id` found at `danger`. */
export function rollItem(cat: ItemCatalog, id: string, danger: number, rng: Rng): Item {
  const d = defOf(cat, id);
  if (!wearable(d)) return plainItem(cat, id);
  const odds = rarityOdds(danger), x = rng.float();
  const unique = cat.uniques.filter((u: UniqueDef) => u.danger <= danger);
  if (x < odds.legendary && unique.length) {
    return uniqueItem(rng.pick(unique));
  }
  const rarity: Rarity = x < odds.legendary + odds.rare ? 'rare' : x < odds.legendary + odds.rare + odds.uncommon ? 'uncommon' : 'common';
  return itemAs(cat, id, rarity, danger, rng);
}

/**
 * One item of kind `id` of a given rarity (common, uncommon or rare), its bonuses as found at `danger`:
 * uncommon adds to one quality, rare to two and carries its full name. Fine work in a shop is made with it.
 */
export function itemAs(cat: ItemCatalog, id: string, rarity: Exclude<Rarity, 'legendary'>, danger: number, rng: Rng): Item {
  const d = defOf(cat, id);
  if (rarity === 'common' || !wearable(d)) return plainItem(cat, id);
  const pool = qualitiesFor(d), bonuses: Partial<Record<Quality, number>> = {};
  const first = rng.chance(0.65) ? pool[0] : rng.pick(pool);
  const size = (lo: number, hi: number) => Math.round(rng.range(lo, hi) + danger * 0.15);
  bonuses[first] = rarity === 'rare' ? size(5, 8) : size(2, 5);
  if (rarity === 'rare') {
    const other = pool.filter((s) => s !== first);
    if (other.length) bonuses[rng.pick(other)] = size(2, 5);
  }
  const fix = cat.affixes[first];
  const name = !fix ? d.name : rarity === 'rare' ? `${fix.prefix} ${d.name} ${fix.suffix}` : rng.chance(0.5) ? `${fix.prefix} ${d.name.toLowerCase()}` : `${d.name} ${fix.suffix}`;
  return { def: id, rarity, name, bonuses };
}

/** How likely a rare find is at `danger` (D61): likelier in more dangerous places, never above `TOP_FIND`. */
export function findChance(f: TreasureFind, danger: number): number {
  return Math.max(0, Math.min(TOP_FIND, f.chance + f.perDanger * danger));
}

/** What a treasure table gives at `danger`. */
export function rollLoot(cat: ItemCatalog, table: string, danger: number, rng: Rng): Loot {
  const t = cat.treasure.find((x) => x.id === table);
  if (!t) throw new Error(`no treasure table "${table}"`);
  const n = rng.int(t.count[0], t.count[1]);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) items.push(rollItem(cat, rng.weighted(t.items, (e) => e[1])[0], danger, rng));
  const coins = rng.int(t.coins[0], t.coins[1]);
  // Rare finds after the rest, so a table's usual roll stays as it was (D61: the potion of learning).
  for (const f of t.finds ?? []) if (rng.chance(findChance(f, danger))) items.push(plainItem(cat, f.item));
  return { items, coins };
}

/** Coins as people say them: 1 silver is 100 copper, 1 gold 100 silver. */
export function coinText(copper: number): string {
  const g = Math.floor(copper / 10000), s = Math.floor((copper % 10000) / 100), c = copper % 100;
  const parts = [g && `${g} gold`, s && `${s} silver`, (c || (!g && !s)) && `${c} copper`].filter(Boolean);
  return parts.join(', ');
}
