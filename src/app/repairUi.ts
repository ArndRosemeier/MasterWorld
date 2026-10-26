/**
 * The smith's bench (plan 11.5, 17.1): what the hero wears that is worn, how worn, and what mending it
 * costs. Opened from talk ("Can you mend my gear?"); a click on a piece mends it, "Mend all" mends what
 * the purse allows, most worn first. In warded brass (windows.css, repair.css): the window drops like a
 * weight onto the anvil, each piece's temper bar shows its wear, and a mended piece flares white-hot with
 * sparks while its bar fills again.
 */
import type { SettingModule } from '../setting/contract';
import type { Character } from '../game/character';
import { coinText, type Item } from '../game/items';
import { condition, mend, mends, wearState, type Mend } from '../game/upkeep';
import { fill } from '../talk/folk';
import './repair.css';
import { button, el } from './dom';
import { itemCard } from './itemCard';
import { BodyWindow, type WindowHost } from './window';

export interface RepairHost extends WindowHost {
  /** What an item is worth as new, copper (the trade's price). */
  worth(it: Item): number;
  /** Something was mended: the hammer rings. */
  rang(): void;
}

export class RepairUi extends BodyWindow {
  /** Who stands at the bench (the smith's name), for the lines. */
  private smith = '';
  /** Slots mended since the window opened (their cards flare once). */
  private readonly flare = new Set<string>();
  private said = '';

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly repairHost: RepairHost) {
    super("The smith's bench", 'repair', null, repairHost);
  }

  /** Open at the bench of `smith`. */
  atBench(smith: string): void {
    this.smith = smith;
    this.flare.clear();
    this.said = '';
    this.setOpen(true);
  }

  protected opened(): void {
    const up = this.setting.upkeep, w = up.words, h = this.hero;
    const list = mends(h, (it) => this.repairHost.worth(it), up);
    const rows = list.map((m) => this.row(m));
    const total = list.reduce((a, m) => a + m.cost, 0);
    const line = this.said || (list.length ? `${this.smith} turns your gear over in scarred hands.` : w.nothingToMend);
    this.body.replaceChildren(
      el('p', { className: 'smith-says', textContent: line }),
      ...(rows.length ? [el('div', { className: 'bench' }, ...rows)] : []),
      el('p', { className: 'hint', textContent: rows.length ? 'Click a piece to mend it. Worn gear strikes and guards less well.' : 'Gear wears as you fight: blades as they strike, armour as it is struck.' }));
    const all = button(`Mend all · ${coinText(total)}`, () => this.clickAll(), { className: 'mend-all' });
    all.disabled = !list.length || !list.some((m) => m.cost <= h.coins);
    this.foot.replaceChildren(el('span', { textContent: `Your purse: ${coinText(h.coins)}` }), all);
  }

  private row(m: Mend): HTMLElement {
    const it = m.item, c = condition(it), state = wearState(it);
    const bar = el('div', { className: `temper ${state}` }, el('i'));
    bar.style.setProperty('--c', c.toFixed(3));
    const dear = m.cost > this.hero.coins;
    const r = el('div', { className: `piece${dear ? ' dear' : ''}${this.flare.has(m.slot) ? ' flare' : ''}`, title: dear ? 'Not enough coin' : 'Mend it' },
      itemCard(it, this.setting),
      bar,
      el('div', { className: 'cost' }, el('span', { textContent: `${Math.round(c * 100)}% sound` }), el('b', { textContent: coinText(m.cost) })));
    r.addEventListener('click', () => this.clickPiece(m));
    return r;
  }

  private clickPiece(m: Mend): void {
    if (!mend(this.hero, m)) { this.said = fill(this.setting.upkeep.words.mendTooDear, { left: m.item.name.toLowerCase() }); this.opened(); return; }
    this.done([m]);
  }

  private clickAll(): void {
    const up = this.setting.upkeep, done: Mend[] = [];
    let left: Mend | null = null;
    for (const m of mends(this.hero, (it) => this.repairHost.worth(it), up)) {
      if (mend(this.hero, m)) done.push(m);
      else left ??= m;
    }
    if (!done.length && left) { this.said = fill(up.words.mendTooDear, { left: left.item.name.toLowerCase() }); this.opened(); return; }
    this.done(done, left);
  }

  private done(list: readonly Mend[], left: Mend | null = null): void {
    const w = this.setting.upkeep.words;
    const spent = list.reduce((a, m) => a + m.cost, 0);
    this.flare.clear();
    for (const m of list) this.flare.add(m.slot);
    this.said = fill(w.mended, { items: names(list.map((m) => m.item.name)), price: coinText(spent) }) + (left ? ` ${fill(w.mendTooDear, { left: left.item.name.toLowerCase() })}` : '');
    this.repairHost.rang();
    this.opened();
    // The mended pieces are sound now: show them flaring on the bench a moment, then the bench as it is.
    this.flaring(list);
  }

  /** The mended pieces, shown once more as new (their bars fill), with the flare. */
  private flaring(list: readonly Mend[]): void {
    const bench = this.body.querySelector('.bench') ?? this.body.insertBefore(el('div', { className: 'bench' }), this.body.lastChild);
    for (const m of list) {
      const it = this.hero.worn[m.slot];
      if (!it) continue;
      const bar = el('div', { className: 'temper new' }, el('i'));
      bar.style.setProperty('--c', '1');
      bench.prepend(el('div', { className: 'piece flare done' }, itemCard(it, this.setting), bar, el('div', { className: 'cost' }, el('span', { textContent: 'good as new' }))));
    }
  }
}

/** "A, B and C". */
function names(list: readonly string[]): string {
  return list.length < 2 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}
