/**
 * The key to press for what the hero stands by (E: climb down a hatch, up a ladder), drawn as the talk prompt is
 * (windows.css). Only the key and the deed: what it does is then seen.
 */
import { el, overlay } from './dom';
import { keyLabel } from '../input/controls';

export class UsePrompt {
  private readonly box = overlay('use-prompt', '');
  private shown = '';

  /** Every frame: `deed` offered on `key` (a key code), or nothing (null). */
  keyFor(key: string | undefined, deed: string | null): void {
    const want = key && deed ? `${key} ${deed}` : '';
    if (want === this.shown) return;
    this.shown = want;
    this.box.classList.toggle('on', !!want);
    if (want) this.box.replaceChildren(el('kbd', { textContent: keyLabel(key!) }), deed!);
  }
}
