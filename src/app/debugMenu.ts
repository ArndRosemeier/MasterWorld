/**
 * The hidden debug menu (Ctrl+Shift+F12, as in Arnd's other games, e.g. Scale's admin console): buttons to
 * go to places worth a look, fly, set the clock, copy a link to the view or the world (its seed), and a command line that runs
 * any JavaScript with `game` in scope (Up / Down for history). `game` is also `window.game` for the
 * browser console. While open, the game gets no keyboard input. Styles in index.html.
 */
import { loadLocal, saveLocal } from '../persist/local';
import { onKeyDown, swallow } from '../input/keys';
import type { VgmLine } from '../vgm/vgmLog';
import { clock } from './dom';

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
  /** A VGM order to the town, here and now: everyone to the market, or everyone indoors. */
  town(kind: 'gather' | 'stayIn'): string;
  /** The view as URL parameters (`pos=…&look=…`). */
  readonly viewParams: string;
  /** Abilities a teacher opens (D49): learn or forget them here, to try them. */
  readonly taught: readonly { readonly id: string; readonly name: string }[];
  known(id: string): boolean;
  learn(id: string, on: boolean): string;
  /** The canon's legendary items (C5), each to put on here and try the ability it gives. */
  readonly legends: readonly { readonly id: string; readonly name: string }[];
  wearLegend(id: string): string;
  /** The setting's story events (C6). */
  readonly events: readonly { readonly id: string; readonly kind: string }[];
  /** A story event now (C6), whatever its wait (one of `events` by id, or the first that can): what the town hears, or why none came. */
  storyEvent(id?: string): string;
  /** The VGM's answer to a need here and now (C9), whatever the Director says: what it made, or why nothing. */
  answerNeed(need: 'discovery' | 'challenge' | 'reward' | 'people' | 'purpose'): string;
  /** A situation of this kind now (C10), whatever the hour: what was made, or why not. */
  situation(kind: 'hurt-traveller' | 'paddock-wolves'): string;
  /** The VGM's log (D53, C8): its moves, oldest first (the tool, the need, why). */
  vgmLog(): readonly VgmLine[];
  /** The world's seed (a fresh one each start unless `?seed=` names it). */
  readonly seed: string;
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
      ['World', [
        { label: `Seed: ${h.seed}`, run: () => h.seed },
        { label: 'Copy link to this world', run: () => this.copy(this.worldLink()) },
      ]],
      ['Player', [
        { label: 'Fly on / off (F)', run: () => { h.freeCamera = !h.freeCamera; return h.freeCamera ? 'flying' : 'walking'; } },
        { label: 'Copy link to this view', run: () => this.copyLink() },
        { label: 'Where am I', run: () => h.viewParams },
      ]],
      ['Abilities', h.taught.map(({ id, name }) => ({ label: `Learn / forget ${name}`, run: () => { const on = !h.known(id); return h.learn(id, on); } }))],
      ['Legendary items', h.legends.map(({ id, name }) => ({ label: `Put on ${name}`, run: () => h.wearLegend(id) }))],
      ['Time', [
        ...([['Dawn', 6], ['Morning', 9], ['Noon', 12], ['Afternoon', 15], ['Evening', 18.5], ['Night', 23]] as const).map(([label, hour]) => ({ label, run: () => { h.hour = hour; } })),
        { label: 'Clock stopped', run: () => { h.dayMinutes = 0; } },
        { label: 'Day in 2 min', run: () => { h.dayMinutes = 2; } },
        { label: 'Day in 24 min', run: () => { h.dayMinutes = 24; } },
        { label: 'Day in 60 min (the game\'s)', run: () => { h.dayMinutes = 60; } },
      ]],
      ['Town', [
        { label: 'Everyone to the market', run: () => h.town('gather') },
        { label: 'A story event now', run: () => h.storyEvent() },
        ...h.events.map((e) => ({ label: `Story event: ${e.kind} (${e.id})`, run: () => h.storyEvent(e.id) })),
        { label: 'Curfew', run: () => h.town('stayIn') },
      ]],
      ['VGM', [
        { label: 'Its last 30 moves', run: () => this.lines(h.vgmLog().slice(-30)) },
        { label: 'Every move', run: () => this.lines(h.vgmLog()) },
        { label: 'Answer Discovery now (a sight)', run: () => h.answerNeed('discovery') },
        { label: 'Answer Reward now (a find)', run: () => h.answerNeed('reward') },
        { label: 'Answer Challenge now (an ambush)', run: () => h.answerNeed('challenge') },
        { label: 'Answer People now (a traveller)', run: () => h.answerNeed('people') },
        { label: 'Situation now: a hurt traveller', run: () => h.situation('hurt-traveller') },
        { label: 'Situation now: wolves at the paddock (in a town)', run: () => h.situation('paddock-wolves') },
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
      if (e.code === 'F12' && e.ctrlKey && e.shiftKey) { swallow(e); this.toggle(); return; }
      if (!this.open) return;
      if (e.code === 'Escape') { swallow(e); this.toggle(false); return; }
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

  /** The VGM's moves into the log, one line each: when, the tool, its need, why (what was printed: how many). */
  private lines(lines: readonly VgmLine[]): string {
    for (const l of lines) this.print(`${l.at === undefined ? 'start' : `day ${Math.floor(l.at / 24) + 1} ${clock(l.at % 24)}`} · ${l.name}${l.need ? ` (${l.need})` : ''}: ${l.reason}`);
    return `${lines.length} line${lines.length === 1 ? '' : 's'}`;
  }

  /** This page's URL with this world's seed (any other parameters kept). */
  private worldLink(drop: readonly string[] = []): string {
    const q = new URLSearchParams(location.search);
    for (const k of drop) q.delete(k);
    q.set('seed', this.host.seed);
    return `${location.origin}${location.pathname}?${q.toString()}`;
  }

  private copyLink(): string {
    return this.copy([this.worldLink(['pos', 'look', 'fly', 'hour']), this.host.viewParams, `hour=${this.host.hour.toFixed(1)}`].filter(Boolean).join('&'));
  }

  private copy(link: string): string {
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
    while (this.log.children.length > 400) this.log.firstElementChild!.remove();
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
