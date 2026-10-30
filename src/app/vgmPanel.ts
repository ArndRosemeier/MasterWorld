/**
 * The VGM panel (a developer's aid, on while the game is built; D53 keeps the VGM out of play otherwise, so the
 * settings, the debug menu and F9 turn it off). Docked at the right, it stays open while the hero plays and never
 * pauses the game: the VGM's moves, newest first, live as the log grows (vgm/vgmLog.ts), each with its tool, its
 * need, why and when. Chips filter by kind of move (the toolbox's tools); a move with a place, clicked, lights up
 * on the minimap and says how far and which way it lies; Go there puts the hero beside it. The places of the
 * last moves that put something somewhere get ward-blue studs on the minimap (`marks`). A fold holds the
 * VGM's needs and buttons that make it act now. The panel never takes focus, so the game keeps its keys.
 */
import './windows.css';
import { NEEDS, type Need } from '../vgm/director';
import { TOOLS, toolOf } from '../vgm/toolbox';
import { VgmWatch, wayTo, type VgmLine, type VgmWhy } from '../vgm/vgmLog';
import type { DecisionLog } from '../world/decisions';
import type { Bindings } from '../input/controls';
import { onKeyDown } from '../input/keys';
import { button, clock, el } from './dom';

export interface VgmHost {
  readonly bindings: Bindings;
  /** Shown at all (the setting), and the kinds of move shown (tool ids; none: all). */
  panelOn: boolean;
  kinds: readonly string[];
  /** How overdue each need is (1: due). */
  readonly needs: Readonly<Record<Need, number>>;
  answerNeed(need: Need): string;
  readonly situations: readonly string[];
  situation(kind: string): string;
  readonly events: readonly { readonly id: string; readonly kind: string }[];
  storyEvent(id?: string): string;
  goodDay(): string;
  /** Put the hero beside this spot (world metres). */
  goNear(x: number, z: number): void;
  /** Where the hero is (world metres). */
  hero(): readonly [number, number];
}

/** Rows the list keeps, and places marked on the minimap (the newest). */
const ROWS = 300;
const MARKS = 16;

const words = (id: string) => id.replace(/-/g, ' ');
const upper = (s: string) => s[0].toUpperCase() + s.slice(1);
/** A move worth a mark: one that put something somewhere (not a road; open land has no place). */
const marked = (l: VgmLine): boolean => !!l.where && l.kind !== 'road';

export class VgmPanel {
  private readonly root = el('div', { id: 'vgm-panel', ariaLabel: 'The game master' });
  private readonly list = el('div', { className: 'list' });
  private readonly chips = el('div', { className: 'chips' });
  private readonly fold = el('div', { className: 'fold' });
  private readonly said = el('p', { className: 'said' });
  private readonly count = el('span', { className: 'count' });
  private readonly watch: VgmWatch;
  private lines: VgmLine[];
  private placed: { id: string; x: number; z: number }[] = [];
  /** The move lit on the minimap. */
  picked: VgmLine | null = null;
  private playing = false;
  private needsAt = 0;

  /** `lines`: the log's moves so far. */
  constructor(lines: readonly VgmLine[], private readonly host: VgmHost) {
    this.lines = [...lines];
    this.watch = new VgmWatch(lines.length);
    this.mark(lines);
    const actBtn = button('Make it act', () => { this.fold.classList.toggle('open'); this.drawFold(); }, { className: 'tab' });
    this.root.append(
      el('div', { className: 'head' }, el('h2', { textContent: 'The game master' }), this.count, actBtn, button('×', () => { host.panelOn = false; }, { className: 'close', title: 'Hide (F9)' })),
      this.fold, this.chips, this.list);
    // Clicks never take focus: the game keeps its keys (Space would press a focused button again).
    this.root.onmousedown = (e) => e.preventDefault();
    document.body.append(this.root);
    onKeyDown((e) => { if (!e.repeat && host.bindings.vgm.includes(e.code) && !document.querySelector('.shade.open, .talk.open')) host.panelOn = !host.panelOn; });
    this.drawChips();
    this.drawList();
  }

  /** Where the VGM placed its last moves, for the minimap (none while hidden), and the picked one. */
  get marks(): readonly { id: string; x: number; z: number }[] { return this.onScreen ? this.placed : []; }
  get pickedMark(): { id: string; x: number; z: number } | null { return this.onScreen && this.picked?.where ? { id: this.picked.id, x: this.picked.where[0], z: this.picked.where[1] } : null; }
  private get onScreen(): boolean { return this.host.panelOn && this.playing; }

  /** Each frame: the log now and whether the game is in play (the panel stays off over the title). */
  seeLog(log: DecisionLog, made: readonly VgmWhy[], playing: boolean): void {
    this.playing = playing;
    this.root.classList.toggle('shown', this.onScreen);
    const fresh = this.watch.see(log, made);
    if (fresh.length) {
      this.lines.push(...fresh);
      this.mark(fresh);
      const known = new Set([...this.chips.querySelectorAll<HTMLElement>('button[data-tool]')].map((b) => b.dataset.tool));
      if (fresh.some((l) => !known.has(l.tool))) this.drawChips(); else this.counts();
      for (const l of fresh) if (this.passes(l)) this.list.prepend(this.moveRow(l));
      while (this.list.children.length > ROWS) this.list.lastElementChild!.remove();
      this.count.textContent = `${this.lines.length} moves`;
    }
    const t = performance.now();
    if (this.onScreen && t - this.needsAt > 1000) {
      this.needsAt = t;
      if (this.fold.classList.contains('open')) this.drawNeeds();
      // The picked move's way follows the hero.
      const w = this.picked && this.list.querySelector('.move.picked .way');
      if (w && this.picked) w.textContent = this.way(this.picked);
    }
  }

  private mark(lines: readonly VgmLine[]): void {
    this.placed = [...this.placed, ...lines.filter(marked).map((l) => ({ id: l.id, x: l.where![0], z: l.where![1] }))].slice(-MARKS);
  }

  private passes(l: VgmLine): boolean { return !this.host.kinds.length || this.host.kinds.includes(l.tool); }

  /** One chip per kind of move the log has, in the toolbox's order, with its count; none lit: all shown. */
  private drawChips(): void {
    const had = new Set(this.lines.map((l) => l.tool)), tools = TOOLS.map((t) => t.id).filter((id) => had.has(id));
    const all = button('All', () => { this.host.kinds = []; this.drawChips(); this.drawList(); }, { className: `chip${this.host.kinds.length ? '' : ' on'}` });
    this.chips.replaceChildren(all, ...tools.map((id) => {
      const b = button(toolOf(id).name, () => {
        const k = this.host.kinds;
        this.host.kinds = k.includes(id) ? k.filter((x) => x !== id) : [...k, id];
        this.drawChips();
        this.drawList();
      }, { className: `chip${this.host.kinds.includes(id) ? ' on' : ''}` }, el('small'));
      b.dataset.tool = id;
      return b;
    }));
    this.counts();
  }

  private counts(): void {
    const n = new Map<string, number>();
    for (const l of this.lines) n.set(l.tool, (n.get(l.tool) ?? 0) + 1);
    for (const b of this.chips.querySelectorAll<HTMLElement>('button[data-tool]')) b.querySelector('small')!.textContent = ` ${n.get(b.dataset.tool!) ?? 0}`;
    this.count.textContent = `${this.lines.length} moves`;
  }

  private drawList(): void {
    const shown = this.lines.filter((l) => this.passes(l)).slice(-ROWS).reverse();
    this.list.replaceChildren(...(shown.length ? shown.map((l) => this.moveRow(l)) : [el('p', { className: 'hint', textContent: 'No moves of these kinds yet.' })]));
  }

  private moveRow(l: VgmLine): HTMLElement {
    const on = this.picked?.id === l.id;
    const row = el('div', { className: `move${l.where ? ' placed' : ''}${on ? ' picked' : ''}`, title: l.where ? 'Click to light it on the minimap' : '' },
      el('div', { className: 'top' },
        el('span', { className: 'tool', textContent: l.name }),
        ...(l.need ? [el('span', { className: 'need', textContent: l.need })] : []),
        ...(l.at !== undefined ? [el('span', { className: 'at', textContent: `day ${Math.floor(l.at / 24) + 1}, ${clock(l.at % 24)}` })] : []),
        ...(l.where ? [button('Go there', () => { const [x, z] = l.where!; this.host.goNear(x, z); }, { className: 'go' })] : [])),
      el('div', { className: 'why', textContent: l.reason }),
      ...(l.where ? [el('div', { className: 'way', textContent: on ? this.way(l) : '' })] : []));
    row.dataset.id = l.id;
    if (l.where) row.addEventListener('click', (e) => { if (!(e.target as HTMLElement).closest('button')) this.pick(l); });
    return row;
  }

  private way(l: VgmLine): string { return l.where ? `◆ on the minimap: ${wayTo(this.host.hero(), l.where)}` : ''; }

  /** A move clicked: lit on the minimap, or unlit when clicked again. */
  private pick(l: VgmLine): void {
    this.picked = this.picked?.id === l.id ? null : l;
    for (const r of this.list.querySelectorAll<HTMLElement>('.move')) {
      const on = r.dataset.id === this.picked?.id;
      r.classList.toggle('picked', on);
      const w = r.querySelector('.way');
      if (w) w.textContent = on ? this.way(l) : '';
    }
  }

  /** The fold: the needs, and buttons that make the VGM act now (what it made is said at the top). */
  private drawFold(): void {
    if (!this.fold.classList.contains('open')) return;
    const h = this.host;
    const act = (run: () => string) => () => { this.said.textContent = run(); };
    const btn = (label: string, run: () => string) => button(label, act(run), { className: 'brass-btn quiet' });
    const group = (title: string, ...btns: HTMLElement[]) => el('div', { className: 'group' }, el('h3', { textContent: title }), el('div', { className: 'btns' }, ...btns));
    this.fold.replaceChildren(el('div', { className: 'needs' }), this.said,
      group('Answer a need', ...NEEDS.map((n) => btn(upper(n), () => h.answerNeed(n)))),
      group('A situation', ...h.situations.map((k) => btn(upper(words(k)), () => h.situation(k)))),
      group('A story event', btn('The first that can', () => h.storyEvent()), ...h.events.map((e) => btn(upper(words(e.id)), () => h.storyEvent(e.id))), btn('A good day', () => h.goodDay())));
    this.drawNeeds();
  }

  private drawNeeds(): void {
    const box = this.fold.querySelector('.needs');
    if (!box) return;
    box.replaceChildren(...NEEDS.map((n) => {
      const v = this.host.needs[n];
      return el('div', { className: `need${v >= 1 ? ' due' : ''}` },
        el('span', { textContent: upper(n) }),
        el('div', { className: 'bar' }, Object.assign(el('i'), { style: `width: ${Math.min(100, v * 100).toFixed(0)}%` })),
        el('span', { className: 'value', textContent: v.toFixed(2) }));
    }));
  }
}
