/**
 * An item's card (plan 17.1, D31, D45): its rarity and name in the rarity's colour, what it does, its skill
 * bonuses and its lore, in a brass plate whose ward shows the rarity: common is plain brass with a glint,
 * uncommon a breathing ward, rare a ward with a running spark and frost, legendary two sparks, a gear and
 * stars. Shown fresh, the rarity sets the entrance and the lines rise one by one. The fight HUD shows finds
 * with it, the pack window what is worn and carried (styles in brass.css).
 */
import type { Rarity, SettingModule } from '../setting/contract';
import type { Item } from '../game/items';
import { el } from './dom';
import { twinkles, wardRim } from './ward';

/** The lines under an item's name: damage or armour, then its bonuses. */
export function itemLines(i: Item, setting: SettingModule): string[] {
  const d = setting.items.items.find((x) => x.id === i.def);
  const lines = Object.entries(i.bonuses).map(([k, v]) => `+${v} ${setting.skills.find((s) => s.id === k)?.name ?? k}`);
  if (d?.weapon) lines.unshift(`${d.weapon.damage[0]}–${d.weapon.damage[1]} damage`);
  if (d?.armour) lines.unshift(`armour ${d.armour}`);
  if (d?.block) lines.unshift(`blocks ${Math.round(d.block * 100)}%`);
  if (d?.heal) lines.unshift(`restores ${d.heal} health`);
  return lines;
}

/** How each rarity's ward is dressed. */
const DRESS: Record<Rarity, { sparks: number; gear: boolean }> = {
  common: { sparks: 0, gear: false }, uncommon: { sparks: 0, gear: false }, rare: { sparks: 1, gear: false }, legendary: { sparks: 2, gear: true },
};

/** The card; with `enter` (seconds) it makes its entrance after that delay and its lines rise one by one. */
export function itemCard(i: Item, setting: SettingModule, enter: number | null = null): HTMLElement {
  const lines = itemLines(i, setting).map((l) => el('div', { className: `line${l.startsWith('+') ? ' bonus' : ''}` }, l));
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
