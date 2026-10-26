/**
 * A game window on a shade (plan 17.1): opens and closes with its key (if it has one), Escape or a click beside it closes
 * it, and the game stops taking keys and the mouse while it is open. In warded brass (D45, windows.css): it makes
 * its own entrance, the ward traces its rim and its lines arrive one after another.
 */
import './windows.css';
import type { Action, Bindings } from '../input/controls';
import { onKeyDown, swallow } from '../input/keys';
import { button, el } from './dom';
import { stagger, wardRim } from './ward';

export interface WindowHost {
  paused(open: boolean): void;
  readonly bindings: Bindings;
}

/** How long a window's entrance takes (s): its lines arrive within it, then it settles (re-drawn lines no longer arrive). */
const SETTLE = 1.6;

/** A shade around `box` that closes when clicked beside the box; the box gets its ward rim (and `shutters`, if asked). */
export function shadeAround(box: HTMLElement, close: () => void, shutters = false): HTMLDivElement {
  box.append(wardRim({ sparks: 2, gear: true, delay: 0.35 }));
  if (shutters) box.append(el('div', { className: 'shutter l' }), el('div', { className: 'shutter r' }));
  const shade = el('div', { className: 'shade' }, box);
  shade.addEventListener('mousedown', (e) => { if (e.target === shade) close(); });
  return shade;
}

/** A window is shown: its lines arrive one after another, then it settles. */
export function entering(box: Element): void {
  box.classList.remove('settled');
  const body = box.querySelector('.body');
  if (body) stagger([...body.children].slice(0, 14), 0.3, 0.06);
  clearTimeout(settling.get(box));
  settling.set(box, setTimeout(() => box.classList.add('settled'), SETTLE * 1000));
}
const settling = new WeakMap<Element, ReturnType<typeof setTimeout>>();

export abstract class KeyWindow {
  private readonly shade: HTMLDivElement;
  /** True while opened() draws the window as it opens (not a re-draw after a click): things make their entrance. */
  protected fresh = false;

  constructor(title: string, className: string, action: Action | null, protected readonly host: WindowHost, ...content: Node[]) {
    const box = el('div', { className: `panel ${className}`, role: 'dialog' },
      el('div', { className: 'head' }, el('h2', { textContent: title }), button('×', () => this.setOpen(false), { className: 'close', title: 'Close' })),
      ...content);
    this.shade = shadeAround(box, () => this.setOpen(false), className === 'saves');
    document.body.append(this.shade);
    onKeyDown((e) => {
      if (e.repeat) return;
      if (this.isOpen && e.code === 'Escape') { swallow(e); this.setOpen(false); return; }
      if (!action || !this.host.bindings[action].includes(e.code)) return;
      // Not over another window or a talk.
      if (!this.isOpen && document.querySelector('.shade.open, .talk.open')) return;
      e.preventDefault();
      this.setOpen(!this.isOpen);
    }, true);
  }

  get isOpen(): boolean { return this.shade.classList.contains('open'); }

  setOpen(on: boolean): void {
    if (on === this.isOpen) return;
    this.shade.classList.toggle('open', on);
    this.host.paused(on);
    if (on) {
      this.fresh = true;
      this.opened();
      this.fresh = false;
      entering(this.shade.firstElementChild!);
    } else this.closed();
  }

  protected abstract opened(): void;
  protected closed(): void {}
}
