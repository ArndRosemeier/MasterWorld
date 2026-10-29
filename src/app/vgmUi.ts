/**
 * The VGM window (a developer's aid, F9 or the debug menu; D53 keeps the VGM out of play otherwise): how its
 * needs stand, its moves on screen on or off, buttons that make it act now (answer a need, stage a situation,
 * start a story event, a good day), and its log, newest first, each move with its tool, its need, why, and a button to go where it is.
 * In warded brass (windows.css). What a button made is said at the top and arrives in the log.
 */
import { NEEDS, type Need } from '../vgm/director';
import type { VgmLine } from '../vgm/vgmLog';
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
}

/** Moves the log shows at once. */
const SHOWN = 60;

const words = (id: string) => id.replace(/-/g, ' ');
const upper = (s: string) => s[0].toUpperCase() + s.slice(1);

export class VgmUi extends BodyWindow {
  private said = '';

  constructor(private readonly vgm: VgmHost) {
    super('The game master', 'vgm', 'vgm', vgm);
  }

  protected opened(): void { this.showMoves(); }

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
    const log = el('div', { className: 'log' }, ...(lines.length ? lines.map((l) => el('div', { className: 'move' },
      el('div', { className: 'head' },
        el('span', { className: 'tool', textContent: l.name }),
        ...(l.need ? [el('span', { className: 'need', textContent: l.need })] : []),
        ...(l.at !== undefined ? [el('span', { className: 'at', textContent: `day ${Math.floor(l.at / 24) + 1}, ${clock(l.at % 24)}` })] : []),
        ...(l.where ? [button('Go there', () => { const [x, z] = l.where!; this.setOpen(false); h.goNear(x, z); }, { className: 'go', title: `${Math.round(l.where[0])}, ${Math.round(l.where[1])}` })] : [])),
      el('div', { className: 'why', textContent: l.reason }))) : [el('p', { className: 'hint', textContent: 'No moves yet.' })]));
    this.fill([
      ...(this.said ? [el('p', { className: 'said', textContent: this.said })] : []),
      el('h3', { textContent: 'Its needs' }), needs, alerts,
      group('Answer a need now', ...NEEDS.map((n) => btn(upper(n), () => h.answerNeed(n)))),
      group('A situation now', ...h.situations.map((k) => btn(upper(words(k)), () => h.situation(k)))),
      group('A story event now', btn('The first that can', () => h.storyEvent()), ...h.events.map((e) => btn(upper(words(e.id)), () => h.storyEvent(e.id))), btn('A good day', () => h.goodDay())),
      el('h3', { textContent: `Its moves (${h.lines().length}), newest first` }), log,
    ], [el('span', { className: 'hint', textContent: 'Only for building the game: in play the game master stays out of sight. F9 opens and closes this.' })]);
  }
}
