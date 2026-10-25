/**
 * An item's card (plan 17.1, D31): its name in the rarity's colour, what it does, its skill bonuses and
 * its lore, behind a ward that shows the rarity. The fight HUD shows finds with it, the pack window what
 * is worn and carried (hud.css styles both).
 */
import type { SettingModule } from '../setting/contract';
import type { Item } from '../game/items';
import { el } from './dom';

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

/** The card; `staggered` lets its lines come in one by one (the HUD's finds). */
export function itemCard(i: Item, setting: SettingModule, staggered = false): HTMLElement {
  const c = el('div', { className: `card plate ${i.rarity}` }, el('div', { className: 'ward' }), el('div', { className: 'name' }, i.name),
    ...itemLines(i, setting).map((l, k) => {
      const d = el('div', { className: 'line' }, l);
      if (staggered) d.style.animationDelay = `${0.3 + k * 0.12}s`;
      return d;
    }),
    ...(i.lore ? [el('div', { className: 'line lore' }, i.lore)] : []));
  if (i.rarity === 'rare' || i.rarity === 'legendary') c.append(el('div', { className: 'spark' }));
  if (i.rarity === 'legendary') c.append(el('div', { className: 'spark b' }));
  return c;
}
