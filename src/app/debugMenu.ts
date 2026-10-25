/**
 * The hidden debug menu (Ctrl+Shift+F12, as in Arnd's other games, e.g. Scale's admin console): buttons to
 * go to places worth a look, fly, set the clock, copy a link to the view, and a command line that runs
 * any JavaScript with `game` in scope (Up / Down for history). `game` is also `window.game` for the
 * browser console. While open, the game gets no keyboard input. Styles in index.html.
 */
import { loadLocal, saveLocal } from '../persist/local';
import { onKeyDown } from '../input/keys';

/** What the debug menu reaches in the running game. */
export interface DebugHost {
  /** A panel opened (true) or closed. */
  paused(open: boolean): void;
  /** Flying the free camera. */
  freeCamera: boolean;
  /** Go to `x,z` or `x,y,z`, looking `yaw,pitch` (degrees). */
  goTo(pos: readonly number[], look?: readonly number[]): void;
  /** Clock, hours 0..24, and real minutes per game day (0 stopped). */
  hour: number;
  dayMinutes: number;
  hud: boolean;
  /** The weather kinds, and a kind ordered here and now (a VGM order); null: back to the natural weather. */
  readonly weatherKinds: readonly string[];
  weather(kind: string | null): string;
  /** The view as URL parameters (`pos=…&look=…`). */
  readonly viewParams: string;
  /** Places worth a look in this world. */
  readonly places: readonly Place[];
  /** Everything, for the command line. */
  readonly game: Record<string, unknown>;
}

export interface Place {
  label: string;
  pos: readonly number[];
  look?: readonly number[];
  /** The time of day it looks best at. */
  hour?: number;
  /** Seen from the free camera. */
  fly?: boolean;
}

interface Btn { label: string; run: () => unknown }

const HISTORY = 'debug.history';

export class DebugMenu {
  private readonly el = document.createElement('div');
  private readonly log: HTMLDivElement;
  private readonly input: HTMLInputElement;
  private history: string[];
  private hi = -1;
  open = false;

  constructor(private readonly host: DebugHost) {
    const h = host;
    const hist = loadLocal(HISTORY);
    this.history = Array.isArray(hist) ? hist.filter((s): s is string => typeof s === 'string') : [];
    (window as unknown as { game: unknown }).game = h.game;
    this.el.id = 'debug';
    this.el.innerHTML = `<div class="dbg-head"><b>Debug</b><span>Ctrl+Shift+F12 / Esc to close</span></div><div class="dbg-body"></div>
      <div class="dbg-log"></div><input class="dbg-cmd" type="text" spellcheck="false" placeholder="JavaScript, game in scope (e.g. game.player.walker.pos)">`;
    document.body.append(this.el);
    this.log = this.el.querySelector('.dbg-log')!;
    this.input = this.el.querySelector('.dbg-cmd')!;
    const sections: [string, Btn[]][] = [
      ['Go to', h.places.map((p) => ({
        label: p.label,
        run: () => {
          if (p.fly !== undefined) h.freeCamera = p.fly;
          h.goTo(p.pos, p.look);
          if (p.hour !== undefined) h.hour = p.hour;
          return `${p.pos.join(', ')}`;
        },
      }))],
      ['Player', [
        { label: 'Fly on / off (F)', run: () => { h.freeCamera = !h.freeCamera; return h.freeCamera ? 'flying' : 'walking'; } },
        { label: 'Copy link to this view', run: () => this.copyLink() },
        { label: 'Where am I', run: () => h.viewParams },
      ]],
      ['Time', [
        ...([['Dawn', 6], ['Morning', 9], ['Noon', 12], ['Afternoon', 15], ['Evening', 18.5], ['Night', 23]] as const).map(([label, hour]) => ({ label, run: () => { h.hour = hour; } })),
        { label: 'Clock stopped', run: () => { h.dayMinutes = 0; } },
        { label: 'Day in 2 min', run: () => { h.dayMinutes = 2; } },
        { label: 'Day in 24 min', run: () => { h.dayMinutes = 24; } },
      ]],
      ['Weather', [
        { label: 'Natural', run: () => h.weather(null) },
        ...h.weatherKinds.map((k) => ({ label: k[0].toUpperCase() + k.slice(1), run: () => h.weather(k) })),
      ]],
      ['Show', [
        { label: 'HUD on / off', run: () => { h.hud = !h.hud; } },
        { label: 'Shader report', run: () => (window as unknown as { shaders?: { report?: () => string } }).shaders?.report?.() ?? 'no shader monitor' },
      ]],
    ];
    const body = this.el.querySelector('.dbg-body')!;
    for (const [title, btns] of sections) {
      const sec = document.createElement('div');
      sec.className = 'dbg-sec';
      sec.innerHTML = `<h4>${title}</h4>`;
      for (const b of btns) {
        const e = document.createElement('button');
        e.textContent = b.label;
        e.onclick = () => this.exec(b.label, b.run);
        sec.append(e);
      }
      body.append(sec);
    }
    // Capture phase, registered before the settings menu: the game never sees these keys.
    onKeyDown((e) => {
      if (e.code === 'F12' && e.ctrlKey && e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); this.toggle(); return; }
      if (!this.open) return;
      if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); this.toggle(false); return; }
      if (e.target !== this.input) return;
      e.stopImmediatePropagation();
      if (e.code === 'Enter') { e.preventDefault(); this.command(this.input.value); }
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        if (!this.history.length) return;
        this.hi = Math.max(-1, Math.min(this.history.length - 1, this.hi + (e.code === 'ArrowUp' ? 1 : -1)));
        this.input.value = this.hi < 0 ? '' : this.history[this.history.length - 1 - this.hi];
      }
    }, true);
  }

  toggle(on = !this.open): void {
    this.open = on;
    this.el.classList.toggle('open', on);
    this.host.paused(on);
    if (on) setTimeout(() => this.input.focus(), 0);
    else this.input.blur();
  }

  private copyLink(): string {
    const q = new URLSearchParams(location.search);
    for (const k of ['pos', 'look', 'fly', 'hour']) q.delete(k);
    const link = `${location.origin}${location.pathname}?${[q.toString(), this.host.viewParams, `hour=${this.host.hour.toFixed(1)}`].filter(Boolean).join('&')}`;
    navigator.clipboard?.writeText(link).catch(() => undefined);
    return link;
  }

  private command(src: string): void {
    const s = src.trim();
    if (!s) return;
    this.history = this.history.filter((x) => x !== s).concat(s).slice(-50);
    saveLocal(HISTORY, this.history);
    this.hi = -1;
    this.input.value = '';
    const fn = new Function('game', `return (${s});`) as (g: unknown) => unknown;
    this.exec(s, () => fn(this.host.game));
  }

  private exec(label: string, f: () => unknown): void {
    try {
      const r = f();
      if (r instanceof Promise) { r.then((v) => this.print(`${label} → ${brief(v)}`), (e) => this.print(`${label} → ${e}`, true)); return; }
      this.print(`${label} → ${brief(r)}`);
    } catch (e) {
      this.print(`${label} → ${e}`, true);
    }
  }

  private print(text: string, bad = false): void {
    const line = document.createElement('div');
    line.textContent = text;
    if (bad) line.className = 'bad';
    this.log.append(line);
    while (this.log.children.length > 60) this.log.firstElementChild!.remove();
    this.log.scrollTop = this.log.scrollHeight;
  }
}

/** A result for the log: short JSON, numbers to two places. */
function brief(v: unknown): string {
  if (v === undefined) return 'ok';
  if (typeof v === 'string') return v;
  try {
    const s = JSON.stringify(v, (_k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x));
    if (s === undefined) return String(v);
    return s.length <= 400 ? s : `${s.slice(0, 400)}…`;
  } catch {
    return String(v);
  }
}
