/**
 * The VGM window (a developer's aid, F9 or the debug menu; D53 keeps the VGM out of play otherwise): how its
 * needs stand, its moves on screen on or off, buttons that make it act now (answer a need, stage a situation,
 * start a story event, a good day), and its log, newest first, each move with its tool, its need, why, and a button to go where it is.
 * A move clicked in the log lights up on the minimap, which stands above the window while it is open. In warded
 * brass (windows.css). What a button made is said at the top and arrives in the log.
 */
import { NEEDS, type Need } from '../vgm/director';
import { wayTo, type VgmLine } from '../vgm/vgmLog';
import { button, clock, el } from './dom';
import { BodyWindow, type WindowHost } from './window';

export interface VgmHost extends WindowHost {
  /** The VGM's log, oldest first. */
  lines(): readonly VgmLine[];
  /** How overdue each need is (1: due). */
  readonly needs: Readonly<Record<Need, number>>;
  /** Its moves on screen (the setting). */
  alerts: boolean;
  /** Answer this need here and now: what it made, or why nothing. */
  answerNeed(need: Need): string;
  /** The situations it can stage now, and staging one: what it made, or why not. */
  readonly situations: readonly string[];
  situation(kind: string): string;
  /** The setting's story events, and starting one (or the first that can): what the town hears, or why none came. */
  readonly events: readonly { readonly id: string; readonly kind: string }[];
  storyEvent(id?: string): string;
  /** A good day now: a feast for a deed kept lately, else a market day in the town the hero is in. */
  goodDay(): string;
  /** Put the hero beside this spot (world metres), to see what the VGM placed there. */
  goNear(x: number, z: number): void;
  /** The move lit on the minimap (picked in the log; null: none), and where the hero is (world metres). */
  picked: VgmLine | null;
  hero(): readonly [number, number];
}

/** Moves the log shows at once. */
const SHOWN = 200;

const words = (id: string) => id.replace(/-/g, ' ');
const upper = (s: string) => s[0].toUpperCase() + s.slice(1);
export class VgmUi extends BodyWindow {
  private said = '';

  constructor(private readonly vgm: VgmHost) {
    super('The game master', 'vgm', 'vgm', vgm);
  }

  /** Open, the minimap stands above the shade (hud.css), so a move picked in the log is seen on it. */
  protected opened(): void { document.body.classList.add('vgm-open'); this.showMoves(); }
  protected closed(): void { document.body.classList.remove('vgm-open'); }

  /** A move clicked in the log: lit on the minimap, or unlit when clicked again. */
  private pick(l: VgmLine, row: HTMLElement): void {
    const h = this.vgm, again = h.picked?.id === l.id;
    h.picked = again ? null : l;
    for (const r of row.parentElement?.children ?? []) { r.classList.remove('picked'); const w = r.querySelector('.way'); if (w) w.textContent = ''; }
    row.classList.toggle('picked', !again);
    const way = row.querySelector('.way');
    if (way && l.where) way.textContent = again ? '' : `◆ on the minimap: ${wayTo(h.hero(), l.where)}`;
  }

  private act(run: () => string): void {
    this.said = run();
    this.showMoves();
  }

  private showMoves(): void {
    const h = this.vgm;
    const btn = (label: string, run: () => string) => button(label, () => this.act(run), { className: 'brass-btn quiet' });
    const needs = el('div', { className: 'needs' }, ...NEEDS.map((n) => {
      const v = h.needs[n];
      return el('div', { className: `need${v >= 1 ? ' due' : ''}` },
        el('span', { textContent: upper(n) }),
        el('div', { className: 'bar' }, Object.assign(el('i'), { style: `width: ${Math.min(100, v * 100).toFixed(0)}%` })),
        el('span', { className: 'value', textContent: v.toFixed(2) }));
    }));
    const alerts = el('label', { className: 'row check' },
      el('input', { type: 'checkbox', checked: h.alerts, onchange: (e: Event) => { h.alerts = (e.target as HTMLInputElement).checked; } }),
      el('span', { textContent: 'Show each move on screen' }));
    const group = (title: string, ...btns: HTMLElement[]) => el('div', { className: 'group' }, el('h3', { textContent: title }), el('div', { className: 'btns' }, ...btns));
    const lines = h.lines().slice(-SHOWN).reverse();
    const moveRow = (l: VgmLine) => {
      const on = h.picked?.id === l.id;
      const row = el('div', { className: `move${l.where ? ' placed' : ''}${on ? ' picked' : ''}`, title: l.where ? 'Click to light it on the minimap' : '' },
        el('div', { className: 'head' },
          el('span', { className: 'tool', textContent: l.name }),
          ...(l.need ? [el('span', { className: 'need', textContent: l.need })] : []),
          ...(l.at !== undefined ? [el('span', { className: 'at', textContent: `day ${Math.floor(l.at / 24) + 1}, ${clock(l.at % 24)}` })] : []),
          ...(l.where ? [button('Go there', () => { const [x, z] = l.where!; this.setOpen(false); h.goNear(x, z); }, { className: 'go', title: `${Math.round(l.where[0])}, ${Math.round(l.where[1])}` })] : [])),
        el('div', { className: 'why', textContent: l.reason }),
        ...(l.where ? [el('div', { className: 'way', textContent: on ? `◆ on the minimap: ${wayTo(h.hero(), l.where)}` : '' })] : []));
      if (l.where) row.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) this.pick(l, row); });
      return row;
    };
    const log = el('div', { className: 'log' }, ...(lines.length ? lines.map(moveRow) : [el('p', { className: 'hint', textContent: 'No moves yet.' })]));
    this.fill([
      ...(this.said ? [el('p', { className: 'said', textContent: this.said })] : []),
      el('h3', { textContent: 'Its needs' }), needs, alerts,
      group('Answer a need now', ...NEEDS.map((n) => btn(upper(n), () => h.answerNeed(n)))),
      group('A situation now', ...h.situations.map((k) => btn(upper(words(k)), () => h.situation(k)))),
      group('A story event now', btn('The first that can', () => h.storyEvent()), ...h.events.map((e) => btn(upper(words(e.id)), () => h.storyEvent(e.id))), btn('A good day', () => h.goodDay())),
      el('h3', { textContent: `Its moves (${h.lines().length}), newest first: click one to light it on the minimap` }), log,
    ], [el('span', { className: 'hint', textContent: 'Only for building the game: in play the game master stays out of sight. F9 opens and closes this.' })]);
  }
}
