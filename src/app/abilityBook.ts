/**
 * The ability book (K): every ability the hero knows, with what it costs and does, to drag onto the action bar
 * (actionBarUi.ts). While it is open the bar wakes for arranging: sockets swap when dragged onto each other and
 * clear when dragged off. In warded brass (D45, windows.css; its own look in actionBar.css): the cards rise one
 * after another, and the ones already on the bar glow.
 */
import type { SettingModule } from '../setting/contract';
import { POTION } from '../game/actionBar';
import type { Character } from '../game/character';
import { el } from './dom';
import { DRAG_ID, lookOf, socketFor, type ActionBarUi } from './actionBarUi';
import { BodyWindow, type WindowHost } from './window';

export class AbilityBook extends BodyWindow {
  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly bar: ActionBarUi, host: WindowHost) {
    super('Abilities', 'book', 'book', host);
  }

  /** Draw the cards again (the bar changed while the book is open). */
  redraw(): void { if (this.isOpen) this.opened(); }

  protected opened(): void {
    this.bar.editing = true;
    const cards = [...this.hero.known, POTION].map((id) => {
      const look = lookOf(this.setting, id), d = look.def;
      const cost = d ? [d.stamina ? `${d.stamina} stamina` : '', d.cooldown ? `ready again after ${d.cooldown} s` : ''].filter(Boolean).join(' · ') : 'potions in your pack';
      const card = el('div', { className: `ability${this.hero.bar.includes(id) ? ' on-bar' : ''}`, draggable: true, title: 'Drag it onto the action bar' },
        socketFor(this.setting, id), el('div', {}, el('b', {}, look.name), el('small', {}, look.text), el('span', { className: 'cost' }, cost)));
      card.addEventListener('dragstart', (e) => {
        if (!e.dataTransfer) return;
        e.dataTransfer.setData(DRAG_ID, id);
        e.dataTransfer.effectAllowed = 'copy';
      });
      return card;
    });
    this.fill([el('div', { className: 'list' }, ...cards)], [el('span', { className: 'hint' }, 'Drag an ability onto the bar. On the bar, drag a socket onto another to swap them, or off the bar to clear it.')]);
  }

  protected closed(): void { this.bar.editing = false; }
}
