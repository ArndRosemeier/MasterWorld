/**
 * The in-game menu: the version and two buttons in the corner, the settings dialog (Escape, or the
 * button) and "What's new". Plain DOM over the canvas in warded brass (windows.css): the settings unroll
 * like a cartographer's tool roll, What's new opens behind two brass shutters.
 */
import { ACTIONS, bind, keyLabel, RESERVED_KEYS, type Action } from '../input/controls';
import { release, versionLabel } from './release';
import { RANGES, type Settings, type SettingsStore } from './settings';
import { onKeyDown, swallow } from '../input/keys';
import { clock, el } from './dom';
import { entering, shadeAround } from './window';

/** What the menu needs of the running game. */
export interface MenuHost {
  /** A dialog opened (true) or closed: the game stops taking keys and the mouse meanwhile. */
  paused(open: boolean): void;
  /** The clock, hours 0..24 (not a setting: it only moves the sun now). */
  hour: number;
  /** The world's seed, shown beside the version (so a picture of a problem names its world). */
  readonly seed?: string;
}

type Layout = ReadonlyMap<string, string> | undefined;

export class Menu {
  private readonly settings: HTMLDivElement;
  private readonly news: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private tab: 'controls' | 'graphics' | 'game' = 'controls';
  /** The key slot waiting for a key press. */
  private rebinding: { action: Action; slot: 0 | 1 } | null = null;
  private layout: Layout;

  constructor(private readonly store: SettingsStore, private readonly host: MenuHost) {
    const corner = el('div', { id: 'corner' },
      el('span', { className: 'version', textContent: `v${versionLabel}${host.seed ? ` · seed ${host.seed}` : ''}` }),
      el('button', { textContent: "What's new", onclick: () => this.showDialog('news') }),
      el('button', { textContent: 'Settings', title: 'Escape', onclick: () => this.showDialog('settings') }),
    );
    this.body = el('div', { className: 'body' });
    const tabs = el('div', { className: 'tabs' }, ...(['controls', 'graphics', 'game'] as const).map((t) =>
      el('button', { className: 'tab', textContent: t[0].toUpperCase() + t.slice(1), onclick: () => { this.tab = t; this.render(); } })));
    this.settings = this.dialog('Settings', 'settings', tabs, this.body, el('div', { className: 'foot' },
      el('button', { textContent: 'Defaults', onclick: () => { this.store.reset(); this.render(); } }),
      el('button', { textContent: 'Done', onclick: () => this.showDialog(null) }),
    ));
    this.news = this.dialog("What's new", 'news', this.changes());
    document.body.append(corner, this.settings, this.news);
    onKeyDown((e) => this.key(e), true);
    // The keyboard's own letters, where the browser tells them.
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap?: () => Promise<ReadonlyMap<string, string>> } }).keyboard;
    void kb?.getLayoutMap?.().then((m) => { this.layout = m; this.render(); }).catch(() => undefined);
  }

  private dialog(title: string, kind: 'settings' | 'news', ...content: Node[]): HTMLDivElement {
    const box = el('div', { className: `panel ${kind}`, role: 'dialog' },
      el('div', { className: 'head' }, el('h2', { textContent: title }), el('button', { className: 'close', textContent: '×', title: 'Close (Escape)', onclick: () => this.showDialog(null) })),
      ...content);
    return shadeAround(box, () => this.showDialog(null), kind === 'news');
  }

  private get open(): boolean {
    return this.settings.classList.contains('open') || this.news.classList.contains('open');
  }

  /** Opens a dialog (or closes them with null). */
  showDialog(which: 'settings' | 'news' | null): void {
    this.rebinding = null;
    const was = { settings: this.settings.classList.contains('open'), news: this.news.classList.contains('open') };
    this.settings.classList.toggle('open', which === 'settings');
    this.news.classList.toggle('open', which === 'news');
    if (which === 'settings') this.render();
    if (which && !was[which]) entering((which === 'settings' ? this.settings : this.news).firstElementChild!);
    this.host.paused(which !== null);
  }

  private key(e: KeyboardEvent): void {
    if (this.rebinding) {
      // The next key goes on the slot: Escape keeps the old one, Backspace and Delete clear it.
      swallow(e);
      const { action, slot } = this.rebinding;
      this.rebinding = null;
      if (e.code === 'Backspace' || e.code === 'Delete') this.store.set({ bindings: bind(this.store.current.bindings, action, slot, '') });
      else if (!RESERVED_KEYS.has(e.code)) this.store.set({ bindings: bind(this.store.current.bindings, action, slot, e.code) });
      this.render();
      return;
    }
    if (e.code === 'Escape' && !e.repeat) {
      e.preventDefault();
      this.showDialog(this.open ? null : 'settings');
    }
  }

  /** Draw the open tab again from the current settings. */
  private render(): void {
    const s = this.store.current;
    this.settings.querySelectorAll('.tabs button').forEach((b, i) => b.classList.toggle('on', ['controls', 'graphics', 'game'][i] === this.tab));
    const rows: Node[] = [];
    if (this.tab === 'controls') {
      rows.push(
        this.slider('Mouse speed', 'mouseSpeed', 0.05, (v) => `${v.toFixed(2)}×`),
        this.check('Invert mouse up and down', 'invertMouse'),
        el('h3', { textContent: 'Keys' }),
        el('p', { className: 'hint', textContent: 'Click a key, then press the new one. Backspace clears it, Escape keeps it.' }),
        ...ACTIONS.map(({ id, label }) => el('div', { className: 'row keys' }, el('span', { textContent: label }),
          ...([0, 1] as const).map((slot) => {
            const waiting = this.rebinding?.action === id && this.rebinding.slot === slot;
            const code = s.bindings[id][slot];
            return el('button', {
              className: `key${waiting ? ' waiting' : ''}${code ? '' : ' free'}`,
              textContent: waiting ? 'Press a key' : keyLabel(code, this.layout) || '–',
              onclick: () => { this.rebinding = { action: id, slot }; this.render(); },
            });
          }))),
        el('p', { className: 'hint', textContent: 'Mouse: right button held looks and turns, left button held looks around, both run, the wheel zooms. Autorun stops with its key again or with forward or back.' }),
      );
    } else if (this.tab === 'graphics') {
      rows.push(
        this.slider('Field of view', 'fov', 1, (v) => `${v.toFixed(0)}°`),
        this.slider('Resolution', 'renderScale', 0.05, (v) => `${Math.round(v * 100)}%`),
        el('h3', { textContent: 'At the next start' }),
        this.check('Trees', 'trees'),
        this.check('Grass', 'grass'),
        this.check('WebGL 2 instead of WebGPU', 'webgl'),
        el('button', { className: 'wide', textContent: 'Restart now', onclick: () => location.reload() }),
      );
    } else {
      const hour = el('input', { type: 'range', min: '0', max: '24', step: '0.25', value: String(this.host.hour) });
      const shown = el('span', { className: 'value', textContent: clock(this.host.hour) });
      hour.oninput = () => { this.host.hour = Number(hour.value); shown.textContent = clock(this.host.hour); };
      rows.push(
        el('label', { className: 'row' }, el('span', { textContent: 'Time of day' }), hour, shown),
        this.slider('Length of a day', 'dayLength', 1, (v) => (v === 0 ? 'clock stopped' : `${v.toFixed(0)} min`)),
        this.slider('Volume', 'volume', 0.05, (v) => `${Math.round(v * 100)}%`),
        this.check('Calm motion (a still title, no window shows)', 'calm'),
        this.check('Frame time line (HUD)', 'hud'),
        el('h3', { textContent: 'The game master' }),
        el('p', { className: 'hint', textContent: 'Out of sight, a game master decides what the land holds and what happens in it: places to find, bands on the roads, trouble in the towns. Calm leaves more time between happenings, eventful less.' }),
        this.pacing(),
      );
    }
    this.body.replaceChildren(...rows);
  }

  private slider(label: string, key: keyof typeof RANGES, step: number, show: (v: number) => string): HTMLElement {
    const [min, max] = RANGES[key];
    const input = el('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(this.store.current[key]) });
    const value = el('span', { className: 'value', textContent: show(this.store.current[key]) });
    input.oninput = () => { this.store.set({ [key]: Number(input.value) }); value.textContent = show(this.store.current[key]); };
    return el('label', { className: 'row' }, el('span', { textContent: label }), input, value);
  }

  /** The game master's pacing: three buttons, the chosen one lit. */
  private pacing(): HTMLElement {
    const now = this.store.current.pacing;
    return el('div', { className: 'row keys' }, el('span', { textContent: 'Pacing' }),
      ...(['calm', 'normal', 'eventful'] as const).map((p) => el('button', {
        className: `key${p === now ? ' waiting' : ''}`,
        textContent: p[0].toUpperCase() + p.slice(1),
        onclick: () => { this.store.set({ pacing: p }); this.render(); },
      })));
  }

  private check(label: string, key: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]): HTMLElement {
    const input = el('input', { type: 'checkbox', checked: this.store.current[key] });
    input.onchange = () => this.store.set({ [key]: input.checked });
    return el('label', { className: 'row check' }, input, el('span', { textContent: label }));
  }

  private changes(): HTMLElement {
    const list = el('div', { className: 'body news' });
    const entry = (c: { version: string; date: string; text: string }) => el('li', {},
      el('span', { className: 'when', textContent: c.version ? `${c.version} · ${c.date}` : c.date }), el('span', { textContent: c.text }));
    if (release.changes.length) list.append(el('ul', {}, ...release.changes.map(entry)));
    else list.append(el('p', { className: 'hint', textContent: 'No versions yet in this build.' }));
    if (release.earlier.length) list.append(el('h3', { textContent: 'Before 0.001' }), el('ul', {}, ...release.earlier.map(entry)));
    return list;
  }
}

