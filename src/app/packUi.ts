/**
 * The pack window (plan 17.1, D31): what the hero wears and carries, the purse and the level. Its key (I)
 * opens and closes it. A click on something carried puts it on (or drinks or eats it); a click on
 * something worn takes it off. The gauges show what the level gives (aim, defence, stealth, speech; D59:
 * there are no skills) and what the gear adds. In warded brass (D45, windows.css): a field chest whose lid
 * swings up, the cards make their entrances by rarity, and each gauge's needle rises (the ward on its dial
 * is what the gear adds).
 */
import { SLOTS, type SettingModule, type Slot } from '../setting/contract';
import type { Character } from '../game/character';
import { coinText, defOf } from '../game/items';
import { topLevel } from '../game/growth';
import { el } from './dom';
import { itemCard } from './itemCard';
import { BodyWindow, type WindowHost } from './window';

const SLOT_NAME: Record<Slot | 'ring2', string> = {
  main: 'Main hand', off: 'Off hand', head: 'Head', body: 'Body', hands: 'Hands', feet: 'Feet', cloak: 'Cloak', ring: 'Ring', ring2: 'Ring', amulet: 'Amulet',
};
/** The order the worn slots are shown in. */
const WORN: readonly (Slot | 'ring2')[] = ['main', 'off', ...SLOTS.filter((s) => s !== 'main' && s !== 'off' && s !== 'ring'), 'ring', 'ring2'];

export interface PackHost extends WindowHost {
  /** What is worn changed: dress the hero again. */
  changed(): void;
  /** Something was drunk or eaten: the health it gave. */
  drank(amount: number): void;
  /** A writing was read (C3): why nothing was learned, or null; the ability it teaches. */
  readOut(why: string | null, ability: string): void;
  /** A portal stone was taken out (the window closes first: the stone floats before the hero). */
  raised(): void;
}

/** Where a gauge's needle stands for a value (degrees from pointing left; full at 100). */
const angle = (v: number) => Math.min(180, Math.max(0, v * 1.8));

export class PackUi extends BodyWindow {
  /** Each gauge as last shown: a needle that rose since swings up again. */
  private readonly seen = new Map<string, number>();

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly packHost: PackHost) {
    super('Pack', 'pack', 'pack', packHost);
  }

  protected opened(): void {
    const h = this.hero;
    // Opening, the cards make their entrance one after another; re-drawn after a click, they are just there.
    const enter = this.entrances(0.35, 0.05);
    const worn = WORN.map((s) => {
      const it = h.worn[s];
      const cell = el('div', { className: `slot${it ? ' full' : ''}` }, el('div', { className: 'label', textContent: SLOT_NAME[s] }), it ? itemCard(it, this.setting, enter()) : el('div', { className: 'empty', textContent: '—' }));
      if (it) { cell.title = 'Take it off'; cell.addEventListener('click', () => { h.unequip(s); this.packHost.changed(); this.opened(); }); }
      return cell;
    });
    const carried = h.pack.map((it) => {
      const d = defOf(this.setting.items, it.def), use = d.slot ? 'Put it on' : d.heal || d.effect ? (d.kind === 'potion' ? 'Drink it' : 'Eat it') : d.teaches ? 'Read it' : d.portal ? 'Hold it up' : '';
      const c = itemCard(it, this.setting, enter());
      if (use) {
        c.classList.add('use');
        c.title = use;
        c.addEventListener('click', () => {
          if (d.portal) { this.setOpen(false); this.packHost.raised(); return; }
          if (d.slot) { h.equip(it); this.packHost.changed(); } else if (d.teaches) this.packHost.readOut(h.readWriting(it), d.teaches); else this.packHost.drank(h.consume(it));
          this.opened();
        });
      }
      return c;
    });
    // What the level gives (D59: no skills) and what the gear adds, each a gauge on the 0..100 of aim and defence.
    const p = h.prowess, sides: [string, string, number, number][] = [
      ['aim', 'Aim', p, h.aim], ['guard', 'Defence', p * 0.8, h.defence], ['stealth', 'Stealth', p * 0.4, h.stealth], ['speech', 'Speech', p * 0.75, h.speech],
      ...(h.hasMagic ? [['spell', 'Spell power', p, p + h.bonus('spell')] as [string, string, number, number]] : [])];
    const gauges = sides.map(([id, name, b, a], i) => {
      const base = Math.floor(b), all = Math.floor(a), plus = all - base;
      const needle = el('div', { className: 'needle' });
      needle.style.animationDelay = `${(0.6 + i * 0.05).toFixed(2)}s`;
      const dial = el('div', { className: 'dial' }, el('div', { className: 'face' }), el('div', { className: 'arc' }), needle, el('div', { className: 'hub' }));
      dial.style.setProperty('--angle', `${angle(all) - 90}deg`);
      dial.style.setProperty('--b', `${angle(base)}deg`);
      dial.style.setProperty('--t', `${angle(all)}deg`);
      const rose = (this.seen.get(id) ?? all) < all;
      this.seen.set(id, all);
      return el('div', { className: `gauge${rose ? ' up' : ''}`, title: plus ? `${name}: ${base} from your level, +${plus} from what you wear` : `${name}: ${base} from your level` },
        dial, el('div', { className: 'name', textContent: name }), el('div', { className: 'value' }, String(base), ...(plus ? [' ', el('b', { textContent: `+${plus}` })] : [])));
    });
    this.fill([
      el('h3', { textContent: 'Worn' }), el('div', { className: 'worn' }, ...worn),
      el('h3', { textContent: 'Carried' }),
      carried.length ? el('div', { className: 'carried' }, ...carried) : el('p', { className: 'hint', textContent: 'Nothing but lint.' }),
      el('p', { className: 'hint', textContent: 'Click something carried to put it on, drink, eat, read or hold it up; click something worn to take it off.' }),
      el('h3', { textContent: `Level ${h.level}` }), el('div', { className: 'gauges' }, ...gauges)],
    [
      el('span', { textContent: `Level ${h.level}${h.level < topLevel(this.setting.growth) ? ` · ${Math.floor(h.xp)} / ${this.setting.growth.xp[h.level]} experience` : ''}` }),
      el('span', { textContent: `Health ${Math.ceil(h.health)} / ${h.maxHealth} · Stamina ${Math.ceil(h.stamina)} / ${h.maxStamina}` }),
      el('span', { textContent: `${coinText(h.coins)} · ${h.carried.toFixed(1)} kg` })]);
  }
}
