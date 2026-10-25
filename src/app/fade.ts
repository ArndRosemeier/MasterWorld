/** Going through a door: a short fade to black and back, and the notes shown while there. */

const FADE_MS = 220;

export class Fade {
  /** While the screen is dark (the swap happens then). */
  busy = false;
  private readonly el = overlay('door-fade', 'position:fixed;inset:0;z-index:8;background:#000;opacity:0;pointer-events:none;transition:opacity 0.2s');

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

/** A short line at the bottom of the screen. */
export class Note {
  private readonly el = overlay('door-note', 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);z-index:6;max-width:min(560px,90vw);padding:10px 16px;background:#0d0b09d9;border:1px solid #6a5a3a;border-radius:6px;color:#efe6d2;font:15px/1.45 Georgia,serif;text-align:center;opacity:0;transition:opacity 0.4s;pointer-events:none');
  private timer = 0;

  say(text: string, secs = 5): void {
    this.el.textContent = text;
    this.el.style.opacity = '1';
    this.timer = secs;
  }

  update(dt: number): void {
    if (this.timer > 0 && (this.timer -= dt) <= 0) this.el.style.opacity = '0';
  }
}

function overlay(id: string, css: string): HTMLElement {
  const el = document.getElementById(id) ?? document.body.appendChild(Object.assign(document.createElement('div'), { id }));
  el.style.cssText = css;
  return el;
}
