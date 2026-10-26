/**
 * The pack window (plan 17.1, D31): what the hero wears and carries, the purse and the skills. Its key (I)
 * opens and closes it. A click on something carried puts it on (or drinks or eats it); a click on
 * something worn takes it off. The skills show what use has made of them and what the gear adds. In warded
 * brass (D45, windows.css): a field chest whose lid swings up, the cards make their entrances by rarity,
 * and each skill is a brass gauge whose needle rises (the ward on its dial is what the gear adds).
 */
import { SLOTS, type SettingModule, type Slot } from '../setting/contract';
import type { Character } from '../game/character';
import { coinText, defOf } from '../game/items';
import { el } from './dom';
import { itemCard } from './itemCard';
import { KeyWindow, type WindowHost } from './window';

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
}

/** Where a gauge's needle stands for a skill (degrees from pointing left; full at 100). */
const angle = (v: number) => Math.min(180, Math.max(0, v * 1.8));

export class PackUi extends KeyWindow {
  private readonly body: HTMLDivElement;
  private readonly foot: HTMLDivElement;
  /** Each skill as last shown: a needle that rose since swings up again. */
  private readonly seen = new Map<string, number>();

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly packHost: PackHost) {
    const body = el('div', { className: 'body' }), foot = el('div', { className: 'foot' });
    super('Pack', 'pack', 'pack', packHost, body, foot);
    this.body = body;
    this.foot = foot;
  }

  protected opened(): void {
    const h = this.hero;
    // Opening, the cards make their entrance one after another; re-drawn after a click, they are just there.
    let k = 0;
    const enter = () => (this.fresh ? 0.35 + 0.05 * k++ : null);
    const worn = WORN.map((s) => {
      const it = h.worn[s];
      const cell = el('div', { className: `slot${it ? ' full' : ''}` }, el('div', { className: 'label', textContent: SLOT_NAME[s] }), it ? itemCard(it, this.setting, enter()) : el('div', { className: 'empty', textContent: '—' }));
      if (it) { cell.title = 'Take it off'; cell.addEventListener('click', () => { h.unequip(s); this.packHost.changed(); this.opened(); }); }
      return cell;
    });
    const carried = h.pack.map((it) => {
      const d = defOf(this.setting.items, it.def), use = d.slot ? 'Put it on' : d.heal ? (d.kind === 'potion' ? 'Drink it' : 'Eat it') : '';
      const c = itemCard(it, this.setting, enter());
      if (use) {
        c.classList.add('use');
        c.title = use;
        c.addEventListener('click', () => {
          if (d.slot) { h.equip(it); this.packHost.changed(); } else this.packHost.drank(h.consume(it));
          this.opened();
        });
      }
      return c;
    });
    const skills = [...this.setting.skills].sort((a, b) => h.skill(b.id) - h.skill(a.id)).map((s, i) => {
      const base = Math.floor(h.skills.get(s.id) ?? 0), all = Math.floor(h.skill(s.id)), plus = all - base;
      const needle = el('div', { className: 'needle' });
      needle.style.animationDelay = `${(0.6 + i * 0.05).toFixed(2)}s`;
      const dial = el('div', { className: 'dial' }, el('div', { className: 'face' }), el('div', { className: 'arc' }), needle, el('div', { className: 'hub' }));
      dial.style.setProperty('--angle', `${angle(all) - 90}deg`);
      dial.style.setProperty('--b', `${angle(base)}deg`);
      dial.style.setProperty('--t', `${angle(all)}deg`);
      const rose = (this.seen.get(s.id) ?? all) < all;
      this.seen.set(s.id, all);
      return el('div', { className: `gauge${rose ? ' up' : ''}`, title: plus ? `${s.name}: ${base}, +${plus} from what you wear` : `${s.name}: ${base}` },
        dial, el('div', { className: 'name', textContent: s.name }), el('div', { className: 'value' }, String(base), ...(plus ? [' ', el('b', { textContent: `+${plus}` })] : [])));
    });
    this.body.replaceChildren(
      el('h3', { textContent: 'Worn' }), el('div', { className: 'worn' }, ...worn),
      el('h3', { textContent: 'Carried' }),
      carried.length ? el('div', { className: 'carried' }, ...carried) : el('p', { className: 'hint', textContent: 'Nothing but lint.' }),
      el('p', { className: 'hint', textContent: 'Click something carried to put it on, drink or eat it; click something worn to take it off.' }),
      el('h3', { textContent: 'Skills' }), el('div', { className: 'skills' }, ...skills));
    this.foot.replaceChildren(
      el('span', { textContent: `Health ${Math.ceil(h.health)} / ${h.maxHealth} · Stamina ${Math.ceil(h.stamina)} / ${h.maxStamina}` }),
      el('span', { textContent: `${coinText(h.coins)} · ${h.carried.toFixed(1)} kg` }));
  }
}
