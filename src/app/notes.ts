/**
 * Short notes at the bottom of the screen (a key found, a lead heard), one at a time: a small brass capsule
 * pops out of the frame's edge, rings once and slides back after a while (plan 17.1; windows.css).
 */
import './windows.css';
import { overlay } from './dom';
import { replay } from './ward';

export class Notes {
  private readonly box = overlay('note', '');
  private left = 0;

  say(text: string, secs = 5): void {
    this.box.textContent = text;
    replay(this.box, 'on');
    this.left = secs;
  }

  update(dt: number): void {
    if (this.left > 0 && (this.left -= dt) <= 0) this.box.classList.remove('on');
  }
}
