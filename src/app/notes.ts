/** Short notes at the bottom of the screen (a key found, a lead heard): one at a time, fading after a while. */
import { overlay } from './dom';

export class Notes {
  private readonly box = overlay('note', 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:6;max-width:min(560px,90vw);padding:10px 16px;background:#0d0b09d9;border:1px solid #6a5a3a;border-radius:6px;color:#efe6d2;font:15px/1.45 Georgia,serif;text-align:center;opacity:0;transition:opacity 0.4s;pointer-events:none');
  private left = 0;

  say(text: string, secs = 5): void {
    this.box.textContent = text;
    this.box.style.opacity = '1';
    this.left = secs;
  }

  update(dt: number): void {
    if (this.left > 0 && (this.left -= dt) <= 0) this.box.style.opacity = '0';
  }
}
