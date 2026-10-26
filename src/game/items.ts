/**
 * Items as found (plan 11.5, D31): a catalogue kind with its rarity and skill bonuses, rolled from a seed
 * when a place's treasure or a creature's pack is opened. Uncommon finds raise one skill, rare ones two
 * and carry a name; legendary ones are the catalogue's named uniques, only where the danger is high
 * enough. Pure.
 */
import { Rng } from '@futuremagic/core';
import type { ItemCatalog, ItemDef, Rarity, UniqueDef } from '../setting/contract';

export interface Item {
  /** Catalogue id. */
  readonly def: string;
  readonly rarity: Rarity;
  readonly name: string;
  /** Skill id → points while worn. */
  readonly bonuses: Readonly<Record<string, number>>;
  readonly lore?: string;
  /** How worn it is (game/upkeep.ts): 0 new .. 1 broken; absent: new. */
  readonly wear?: number;
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

export function defOf(cat: ItemCatalog, id: string): ItemDef {
  const d = cat.items.find((i) => i.id === id);
  if (!d) throw new Error(`no item "${id}"`);
  return d;
}

/** The skills a found item may raise: its own weapon skill first, then what fits its kind. */
function bonusSkills(d: ItemDef): string[] {
  if (d.weapon) return [d.weapon.skill, 'dodge', 'perception'];
  if (d.kind === 'shield') return ['shields', 'armour'];
  if (d.slot === 'ring' || d.slot === 'amulet') return ['perception', 'stealth', 'speech', 'orientation', 'dodge'];
  if (d.slot === 'feet' || d.slot === 'cloak') return ['stealth', 'dodge', 'orientation'];
  return ['armour', 'dodge', 'perception'];
}

/** One item of kind `id` found at `danger`. */
export function rollItem(cat: ItemCatalog, id: string, danger: number, rng: Rng): Item {
  const d = defOf(cat, id);
  if (!wearable(d)) return plainItem(cat, id);
  const odds = rarityOdds(danger), x = rng.float();
  const unique = cat.uniques.filter((u: UniqueDef) => u.danger <= danger);
  if (x < odds.legendary && unique.length) {
    const u = rng.pick(unique);
    return { def: u.base, rarity: 'legendary', name: u.name, bonuses: { ...u.bonuses }, lore: u.lore };
  }
  const rarity: Rarity = x < odds.legendary + odds.rare ? 'rare' : x < odds.legendary + odds.rare + odds.uncommon ? 'uncommon' : 'common';
  if (rarity === 'common') return plainItem(cat, id);
  const pool = bonusSkills(d), bonuses: Record<string, number> = {};
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

/** What a treasure table gives at `danger`. */
export function rollLoot(cat: ItemCatalog, table: string, danger: number, rng: Rng): Loot {
  const t = cat.treasure.find((x) => x.id === table);
  if (!t) throw new Error(`no treasure table "${table}"`);
  const n = rng.int(t.count[0], t.count[1]);
  const items: Item[] = [];
  for (let i = 0; i < n; i++) items.push(rollItem(cat, rng.weighted(t.items, (e) => e[1])[0], danger, rng));
  return { items, coins: rng.int(t.coins[0], t.coins[1]) };
}

/** Coins as people say them: 1 silver is 100 copper, 1 gold 100 silver. */
export function coinText(copper: number): string {
  const g = Math.floor(copper / 10000), s = Math.floor((copper % 10000) / 100), c = copper % 100;
  const parts = [g && `${g} gold`, s && `${s} silver`, (c || (!g && !s)) && `${c} copper`].filter(Boolean);
  return parts.join(', ');
}
