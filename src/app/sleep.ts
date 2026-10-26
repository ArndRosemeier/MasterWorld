/**
 * A night at the inn (plan 11.5): the screen goes dark, a brass moon crosses it and sets as the sun comes
 * up, and while it is dark the game moves the clock and the hero. Its own moment in warded brass
 * (plan 17.1): slower than a door's fade, so the night is felt.
 */
import { el, overlay } from './dom';

const DARK_MS = 700;
const NIGHT_MS = 1700;

export class Sleep {
  busy = false;
  private readonly el = overlay('sleep-fade', 'position:fixed;inset:0;z-index:9;background:#050307;opacity:0;pointer-events:none;transition:opacity .7s ease;display:flex;align-items:center;justify-content:center;font:italic 20px "EB Garamond",Georgia,serif;color:#cbb898;letter-spacing:.06em');

  /** Darken, `act` (the clock and the hero move), show the night passing, lighten. */
  async through(act: () => void | Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const sky = div('position:relative;width:min(420px,80vw);height:120px',
      div('position:absolute;left:0;right:0;bottom:22px;height:1px;background:linear-gradient(90deg,transparent,#6e4f17,transparent)'),
      moon(),
      div('position:absolute;left:0;right:0;bottom:0;text-align:center', 'The night passes…'));
    this.el.replaceChildren(sky);
    this.el.style.opacity = '1';
    await wait(DARK_MS);
    await act();
    await wait(NIGHT_MS);
    this.el.style.opacity = '0';
    await wait(DARK_MS);
    this.el.replaceChildren();
    this.busy = false;
  }
}

/** A brass crescent that rises on the left and sets on the right while the night passes. */
function moon(): HTMLElement {
  const m = div('position:absolute;left:0;bottom:22px;width:26px;height:26px;border-radius:50%;box-shadow:inset -7px -3px 0 0 #e2bd68;filter:drop-shadow(0 0 6px #e2bd6866)');
  m.animate([
    { transform: 'translate(0, 10px)', opacity: 0 },
    { transform: 'translate(calc(min(420px, 80vw) * .25), -70px)', opacity: 1, offset: 0.3 },
    { transform: 'translate(calc(min(420px, 80vw) * .5 - 13px), -88px)', opacity: 1, offset: 0.5 },
    { transform: 'translate(calc(min(420px, 80vw) * .75 - 26px), -70px)', opacity: 1, offset: 0.7 },
    { transform: 'translate(calc(min(420px, 80vw) - 26px), 10px)', opacity: 0 },
  ], { duration: DARK_MS + NIGHT_MS, easing: 'linear', fill: 'both' });
  return m;
}

function div(css: string, ...kids: (Node | string)[]): HTMLDivElement {
  const d = el('div', {}, ...kids);
  d.style.cssText = css;
  return d;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
