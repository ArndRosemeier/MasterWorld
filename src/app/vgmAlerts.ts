/**
 * The VGM's moves on screen (a developer's aid, on while the game is built; settings and the debug menu turn
 * it off). D53 keeps the VGM out of sight in play, so this reads only its log (vgm/vgmLog.ts): each new move
 * slides in at the top right as a small brass slip with its tool, its need and why, and fades after a while.
 * It never takes the mouse or a key, so play goes on under it. While it is on, the minimap shows where the VGM
 * placed its last moves as ward-blue studs (`marks`), so a cave it asked for can be found and checked.
 */
import './windows.css';
import { el, overlay } from './dom';
import type { DecisionLog } from '../world/decisions';
import type { Made } from '../vgm/toolbox';
import { VgmWatch, type VgmLine } from '../vgm/vgmLog';

/** Slips on screen at once, and how long each stays (s). */
const MOST = 4;
const STAY = 8;
/** Places marked on the minimap at once (the newest). */
const MARKS = 16;

/** A move worth a mark: one that put something somewhere (not the land growing: roads, open land). */
const marked = (l: VgmLine): boolean => !!l.where && l.kind !== 'road' && l.kind !== 'volume' && !(l.kind === 'region' && l.reason.endsWith('(open land)'));

export class VgmAlerts {
  /** Shown at all (the setting). */
  on = true;
  private readonly box = overlay('vgm-alerts', '');
  private readonly watch: VgmWatch;
  private readonly slips: { e: HTMLElement; left: number }[] = [];
  private placed: { id: string; x: number; z: number }[] = [];

  /** `lines`: the log's moves so far (their places are marked, but not shown as news). */
  constructor(lines: readonly VgmLine[]) {
    this.watch = new VgmWatch(lines.length);
    this.mark(lines);
    this.box.setAttribute('aria-hidden', 'true');
  }

  /** Where the VGM placed its last moves, for the minimap (none while off). */
  get marks(): readonly { id: string; x: number; z: number }[] { return this.on ? this.placed : []; }

  /** Each frame: the log now, and whether the game is in play (moves made over the title are not shown). */
  seeLog(log: DecisionLog, made: readonly Made[], playing: boolean, dt: number): void {
    const fresh = this.watch.see(log, made);
    if (fresh.length) this.mark(fresh);
    if (this.on && playing) for (const l of fresh.slice(-MOST)) this.slip(l);
    for (let i = this.slips.length - 1; i >= 0; i--) {
      const s = this.slips[i];
      if ((s.left -= dt) <= 0) this.drop(i);
    }
    if (!this.on) while (this.slips.length) this.drop(0);
  }

  private mark(lines: readonly VgmLine[]): void {
    const more = lines.filter(marked).map((l) => ({ id: l.id, x: l.where![0], z: l.where![1] }));
    this.placed = [...this.placed, ...more].slice(-MARKS);
  }

  private slip(l: VgmLine): void {
    while (this.slips.length >= MOST) this.drop(0);
    const e = el('div', { className: 'vgm-slip' },
      el('div', { className: 'head' },
        el('span', { className: 'seal', textContent: 'VGM' }),
        el('span', { className: 'tool', textContent: l.name }),
        ...(l.need ? [el('span', { className: 'need', textContent: l.need })] : [])),
      el('div', { className: 'why', textContent: l.reason }),
      ...(marked(l) ? [el('div', { className: 'where', textContent: '◆ marked on the minimap' })] : []));
    this.box.append(e);
    this.slips.push({ e, left: STAY });
  }

  private drop(i: number): void {
    const [s] = this.slips.splice(i, 1);
    s.e.classList.add('off');
    setTimeout(() => s.e.remove(), 400);
  }
}
