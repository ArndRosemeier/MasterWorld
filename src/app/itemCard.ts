/**
 * An item's card (plan 17.1, D31, D45): its rarity and name in the rarity's colour, what it does, its skill
 * bonuses and its lore, in a brass plate whose ward shows the rarity: common is plain brass with a glint,
 * uncommon a breathing ward, rare a ward with a running spark and frost, legendary two sparks, a gear and
 * stars. Shown fresh, the rarity sets the entrance and the lines rise one by one. The fight HUD shows finds
 * with it, the pack window what is worn and carried (styles in brass.css).
 */
import { abilityOf, skillOf, type Rarity, type SettingModule } from '../setting/contract';
import type { Item } from '../game/items';
import { condition, wearState } from '../game/upkeep';
import { el } from './dom';
import { twinkles, wardRim } from './ward';

/** The lines under an item's name: damage or armour, then its bonuses. */
export function itemLines(i: Item, setting: SettingModule): string[] {
  const d = setting.items.items.find((x) => x.id === i.def);
  const lines = Object.entries(i.bonuses).map(([k, v]) => `+${v} ${skillOf(setting, k)?.name ?? k}`);
  if (d?.weapon) lines.unshift(`${d.weapon.damage[0]}–${d.weapon.damage[1]} damage`);
  if (d?.armour) lines.unshift(`armour ${d.armour}`);
  if (d?.block) lines.unshift(`blocks ${Math.round(d.block * 100)}%`);
  if (d?.heal) lines.unshift(`restores ${d.heal} health`);
  // An ability only items give (D31, C5): the hero has it while wearing this.
  const a = abilityOf(setting, i.grants);
  if (a) lines.push(`${GRANTS}${a.name}: ${a.text}`);
  // Worn gear says how worn (game/upkeep.ts): it strikes and guards less well until a smith mends it.
  if (i.wear) { const s = wearState(i), pct = `${Math.round(condition(i) * 100)}% sound`; lines.push(s === 'new' ? pct : `${s}: ${pct}`); }
  return lines;
}

/** How a card's line about the ability an item gives begins. */
const GRANTS = 'Worn, it gives ';

/** How each rarity's ward is dressed. */
const DRESS: Record<Rarity, { sparks: number; gear: boolean }> = {
  common: { sparks: 0, gear: false }, uncommon: { sparks: 0, gear: false }, rare: { sparks: 1, gear: false }, legendary: { sparks: 2, gear: true },
};

/** The card; with `enter` (seconds) it makes its entrance after that delay and its lines rise one by one. */
export function itemCard(i: Item, setting: SettingModule, enter: number | null = null): HTMLElement {
  const lines = itemLines(i, setting).map((l) => el('div', { className: `line${l.startsWith('+') ? ' bonus' : l.endsWith('% sound') ? ' wear' : l.startsWith(GRANTS) ? ' grants' : ''}` }, l));
  if (i.lore) lines.push(el('div', { className: 'line lore' }, i.lore));
  const head = el('div', { className: 'rarity' }, i.rarity, ...(i.rarity === 'legendary' ? [' ', twinkles()] : []));
  const c = el('div', { className: `card plate ${i.rarity}` }, head, el('div', { className: 'name' }, i.name), ...lines);
  wardCard(c, i.rarity, enter);
  return c;
}

/** A plain card with one line (coin, "nothing worth taking"). */
export function plainCard(text: string, enter: number | null = null): HTMLElement {
  const c = el('div', { className: 'card plate common' }, el('div', { className: 'name' }, text));
  wardCard(c, 'common', enter);
  return c;
}

function wardCard(c: HTMLElement, rarity: Rarity, enter: number | null): void {
  if (rarity === 'common') c.prepend(el('div', { className: 'glint' }));
  else {
    if (rarity === 'rare') c.prepend(el('div', { className: 'frost' }));
    c.append(wardRim({ ...DRESS[rarity], delay: (enter ?? -2) + 0.35 }));
  }
  if (enter === null) return;
  c.classList.add('enter');
  c.style.animationDelay = `${enter}s`;
  [...c.querySelectorAll<HTMLElement>(':scope > :is(.rarity, .name, .line)')].forEach((e, k) => { e.style.animationDelay = `${(enter + 0.3 + k * 0.1).toFixed(2)}s`; });
}
