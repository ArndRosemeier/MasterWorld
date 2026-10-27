/** Going through a door: a short fade to black and back. */
import { overlay } from './dom';

const FADE_MS = 220;

export class Fade {
  /** While the screen is dark (the swap happens then). */
  busy = false;
  private readonly el = overlay('door-fade', 'position:fixed;inset:0;z-index:8;background:#000;opacity:0;pointer-events:none;transition:opacity 0.2s');

  /** Dark by `level` (0 clear, 1 black) now, as a scene sets it each frame (a climb through a floor). */
  dim(level: number): void {
    this.el.style.transition = 'none';
    this.el.style.opacity = String(level);
    if (level <= 0) this.el.style.transition = 'opacity 0.2s';
  }

  /** Darken, `act`, lighten (`now`: at once, no fade). */
  async swap(now: boolean, act: () => void | Promise<void>): Promise<void> {
    if (now) { await act(); return; }
    this.busy = true;
    this.el.style.opacity = '1';
    await new Promise((r) => setTimeout(r, FADE_MS));
    await act();
    this.el.style.opacity = '0';
    this.busy = false;
  }
}
