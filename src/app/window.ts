/**
 * A game window on a shade (plan 17.1): opens and closes with its key (if it has one), Escape or a click beside it closes
 * it, and the game stops taking keys and the mouse while it is open.
 */
import type { Action, Bindings } from '../input/controls';
import { onKeyDown, swallow } from '../input/keys';
import { button, el } from './dom';

export interface WindowHost {
  paused(open: boolean): void;
  readonly bindings: Bindings;
}

/** A shade around `box` that closes when clicked beside the box. */
export function shadeAround(box: HTMLElement, close: () => void): HTMLDivElement {
  const shade = el('div', { className: 'shade' }, box);
  shade.addEventListener('mousedown', (e) => { if (e.target === shade) close(); });
  return shade;
}

export abstract class KeyWindow {
  private readonly shade: HTMLDivElement;

  constructor(title: string, className: string, action: Action | null, protected readonly host: WindowHost, ...content: Node[]) {
    const box = el('div', { className: `panel ${className}`, role: 'dialog' },
      el('div', { className: 'head' }, el('h2', { textContent: title }), button('×', () => this.setOpen(false), { className: 'close', title: 'Close' })),
      ...content);
    this.shade = shadeAround(box, () => this.setOpen(false));
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
    if (on) this.opened(); else this.closed();
  }

  protected abstract opened(): void;
  protected closed(): void {}
}
