/**
 * The action bar (plan 17.1): ten brass sockets along the bottom of the screen, there whenever the hero is played
 * (not only in fights). Each socket holds what the hero's bar (game/actionBar.ts) puts there; its key (1 to 0,
 * rebindable) or a click uses it. A cooldown runs round its socket as a ward line. The ability book (K,
 * abilityBook.ts) arranges it: abilities drag onto a socket, sockets drag onto each other to swap, and a socket
 * dragged off the bar is cleared. Along its top runs the experience rule: how far the hero is toward the next
 * level, and how much experience that level still needs (D58; Arnd).
 */
import './actionBar.css';
import { abilityOf, type AbilityDef, type SettingModule } from '../setting/contract';
import { BAR_SLOTS, clearSlot, placeOnBar, POTION, REST, swapOnBar } from '../game/actionBar';
import type { Character } from '../game/character';
import { towardNext, xpToNext } from '../game/growth';
import { BAR_KEYS, barSlotOf, keyLabel, type Bindings } from '../input/controls';
import { onKeyDown } from '../input/keys';
import { el } from './dom';
import { replay } from './ward';

/** How a socket's ability stands this frame. */
export interface SlotState {
  /** Seconds before it can be used again, and its whole cooldown. */
  readonly left: number;
  readonly total: number;
  /** Cannot be used now (out of breath, nothing to drink, not here). */
  readonly dim: boolean;
  /** Going on (attacking, a change under way). */
  readonly on: boolean;
  /** A count to show (potions in the pack). */
  readonly count?: number;
}

export interface BarHost {
  readonly bindings: Bindings;
  /** A dialog has the keys. */
  readonly blocked: boolean;
  /** Use an ability (or the potion's quick slot). */
  trigger(id: string): void;
  /** How it stands now. */
  state(id: string): SlotState;
  /** The bar was arranged anew. */
  arranged(): void;
}

/** The drag's payload: an ability's id, and the socket it came from (book: none). */
export const DRAG_ID = 'text/x-mw-ability', DRAG_SLOT = 'text/x-mw-slot';

/** The potion's quick slot as the bar and the book show it. */
export const POTION_LOOK = { icon: '⚱', name: 'Drink a potion', text: 'Drink the best healing draught in your pack.' } as const;
export const REST_LOOK = { icon: '☾', name: 'Rest', text: 'Sit down on the ground: health, mana and stamina come back faster. Moving, a fight or a wound ends it.' } as const;

/** An ability's (or the potion's) look: glyph, name, words. */
export function lookOf(setting: SettingModule, id: string): { icon: string; name: string; text: string; def?: AbilityDef } {
  if (id === POTION) return { ...POTION_LOOK };
  if (id === REST) return { ...REST_LOOK };
  const def = abilityOf(setting, id);
  return { icon: def?.icon ?? '•', name: def?.name ?? id, text: def?.text ?? '', def };
}

/** A brass socket showing `id` (for the bar and the book). */
export function socketFor(setting: SettingModule, id: string | null): HTMLElement {
  if (!id) return el('div', { className: 'socket empty' }, el('div', { className: 'ring' }), el('span'), el('div', { className: 'hot' }), el('div', { className: 'count' }));
  const look = lookOf(setting, id);
  return el('div', { className: 'socket' }, el('div', { className: 'ring' }), el('span', {}, look.icon), el('div', { className: 'hot' }), el('div', { className: 'count' }), el('div', { className: 'tip' }, look.name));
}

interface Shown { id: string | null; readonly el: HTMLElement; was: number; done: string; key: string; count: string }

export class ActionBarUi {
  private readonly root = el('div', { id: 'bar', className: 'hidden' });
  private shownSlots: Shown[] = [];
  private edit = false;
  /** The experience rule along the strap's top: a brass trough filling with light, the experience still needed engraved on it. */
  private readonly fill = el('i');
  private readonly need = el('span');
  private readonly xp = el('div', { className: 'xp' }, el('div', { className: 'trough' }, this.fill), this.need);
  private shownXp = -1;

  constructor(private readonly hero: Character, private readonly setting: SettingModule, private readonly host: BarHost) {
    document.body.append(this.root);
    this.draw();
    onKeyDown((e) => {
      if (e.repeat || this.host.blocked || this.root.classList.contains('hidden')) return;
      const slot = barSlotOf(this.host.bindings, e.code);
      if (slot >= 0) this.press(slot);
    });
  }

  set inPlay(on: boolean) { this.root.classList.toggle('hidden', !on); }

  /** The book is open: the sockets can be dragged. */
  set editing(on: boolean) {
    this.edit = on;
    this.root.classList.toggle('editing', on);
    for (const s of this.shownSlots) s.el.draggable = on && !!s.id;
  }

  /** Fallen: the sockets go dark. */
  set dark(on: boolean) { this.root.classList.toggle('fallen', on); }

  /** Use what socket `slot` holds (its key, or a click). */
  press(slot: number): void {
    const s = this.shownSlots[slot];
    if (!s?.id) return;
    replay(s.el, 'pressed');
    this.host.trigger(s.id);
  }

  /** Draw the sockets again from the hero's bar (it was arranged, or an ability was learned). */
  draw(): void {
    const bar = this.hero.bar;
    this.shownSlots = [];
    const kids: HTMLElement[] = [];
    for (let i = 0; i < BAR_SLOTS; i++) {
      const id = bar[i] ?? null, s = socketFor(this.setting, id);
      s.draggable = this.edit && !!id;
      s.addEventListener('click', () => { if (!this.edit) this.press(i); });
      s.addEventListener('dragstart', (e) => {
        if (!id || !e.dataTransfer) return;
        e.dataTransfer.setData(DRAG_ID, id);
        e.dataTransfer.setData(DRAG_SLOT, String(i));
        e.dataTransfer.effectAllowed = 'move';
      });
      // Dragged off the bar (dropped anywhere but a socket): the socket is cleared.
      s.addEventListener('dragend', (e) => { if (this.edit && e.dataTransfer?.dropEffect === 'none') this.arrange(clearSlot(this.hero.bar, i)); });
      s.addEventListener('dragover', (e) => { if (this.edit && e.dataTransfer?.types.includes(DRAG_ID)) { e.preventDefault(); s.classList.add('over'); } });
      s.addEventListener('dragleave', () => s.classList.remove('over'));
      s.addEventListener('drop', (e) => {
        s.classList.remove('over');
        const what = e.dataTransfer?.getData(DRAG_ID);
        if (!this.edit || !what) return;
        e.preventDefault();
        const from = e.dataTransfer?.getData(DRAG_SLOT);
        this.arrange(from ? swapOnBar(this.hero.bar, Number(from), i) : placeOnBar(this.hero.bar, i, what));
        replay(this.shownSlots[i].el, 'ready');
      });
      kids.push(s);
      this.shownSlots.push({ id, el: s, was: 0, done: '', key: '', count: '' });
    }
    this.root.replaceChildren(...kids, this.xp);
    this.readSlots();
  }

  private arrange(bar: readonly (string | null)[]): void {
    this.hero.bar = bar;
    this.draw();
    this.host.arranged();
  }

  /** Every frame: keys, cooldown wards, what can be used, the experience rule. Writes only what changed. */
  readSlots(): void {
    this.readXp();
    const b = this.host.bindings;
    this.shownSlots.forEach((s, i) => {
      const key = keyLabel(b[BAR_KEYS[i]][0]);
      if (s.key !== key) { (s.el.querySelector('.hot') as HTMLElement).textContent = key; s.key = key; }
      if (!s.id) return;
      const st = this.host.state(s.id);
      const frac = st.total > 0 ? 1 - st.left / st.total : 1, done = `${Math.round(frac * 360)}deg`;
      if (s.done !== done) { s.el.style.setProperty('--done', done); s.done = done; }
      s.el.classList.toggle('cooling', st.left > 0 || st.dim);
      s.el.classList.toggle('on', st.on);
      if (s.was > 0 && st.left === 0) replay(s.el, 'ready');
      s.was = st.left;
      const count = st.count !== undefined && st.count > 0 ? String(st.count) : '';
      if (s.count !== count) { (s.el.querySelector('.count') as HTMLElement).textContent = count; s.count = count; }
    });
  }

  /** The experience rule: filled as far as the hero is toward the next level; a glint when experience comes in. */
  private readXp(): void {
    const xp = this.hero.xp;
    if (xp === this.shownXp) return;
    const g = this.setting.growth, left = xpToNext(g, xp), gained = this.shownXp >= 0 && xp > this.shownXp;
    this.shownXp = xp;
    this.fill.style.width = `${(towardNext(g, xp) * 100).toFixed(1)}%`;
    this.need.textContent = left === null ? `Level ${this.hero.level}` : `${left} xp to level ${this.hero.level + 1}`;
    if (gained) replay(this.xp, 'gained');
  }
}
