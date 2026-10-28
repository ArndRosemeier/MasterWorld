/**
 * The compass, always on (plan 17.1, D35, D45): a brass ring at the top of the screen that turns with the
 * camera, with no needle: the lubber mark on top shows where the hero looks, and the big letters read at a
 * glance. A compass needs no skill, so it always points true; the orientation skill only sharpens where the
 * map puts the hero (src/game/orientation.ts). The places marked on the map ride on the rim as glowing studs.
 * Beside it a tiny orrery: sun and moon turn with the hour, and a cloud, raindrop or snowflake rides along
 * with the weather. Plain DOM (hud.css); every frame only transforms change, and only when they moved.
 */
import './hud.css';
import { el, svg } from './dom';

export type SkyGlyph = 'clear' | 'cloud' | 'rain' | 'snow';

/** What the compass shows this frame. */
export interface CompassReading {
  /** Where the hero is (world metres). */
  readonly x: number;
  readonly z: number;
  /** The camera's yaw (the walker's convention: 0 north, counter-clockwise, radians). */
  readonly look: number;
  /** Hours 0..24. */
  readonly hour: number;
  readonly sky: SkyGlyph;
  /** The places marked on the map. */
  readonly marks: readonly { readonly id: string; readonly x: number; readonly z: number }[];
}

const DEG = 180 / Math.PI;
/** The rim's radius for the studs (px, in the dial's 100 px). */
const RIM = 43;

const DIAL = `<svg viewBox="0 0 100 100" aria-hidden="true">
<circle cx="50" cy="50" r="47" fill="#1d1510" stroke="#b08532" stroke-width="3"/>
<circle cx="50" cy="50" r="40" fill="none" stroke="#6e4f17" stroke-width="1"/>
<circle class="ward" cx="50" cy="50" r="43.5" fill="none" stroke="#8fe3ff" stroke-width="1" pathLength="100"/>
${Array.from({ length: 36 }, (_, i) => `<line x1="50" y1="${i % 9 === 0 ? 9 : 10.5}" x2="50" y2="14" stroke="${i % 9 === 0 ? '#e2bd68' : '#8a6726'}" stroke-width="${i % 9 === 0 ? 1.6 : 0.8}" transform="rotate(${i * 10} 50 50)"/>`).join('')}
<g class="letters" font-family="'Marcellus SC', Georgia, serif" font-size="20" font-weight="700" text-anchor="middle" stroke="#120c08" stroke-width="2.2" paint-order="stroke" stroke-linejoin="round">
<text x="50" y="32" fill="#ff8a5c">N</text><text x="75" y="57" fill="#ffe6a6">E</text><text x="50" y="82" fill="#ffe6a6">S</text><text x="25" y="57" fill="#ffe6a6">W</text>
</g></svg>`;
const GLYPH: Record<SkyGlyph, string> = {
  clear: '',
  cloud: '<path d="M6 14h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 6 14z" fill="#cbb898"/>',
  rain: '<path d="M6 11h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 6 11z" fill="#9aa4ad"/><path d="M8 14l-1 3M12 14l-1 3M16 14l-1 3" stroke="#8fe3ff" stroke-width="1.4" stroke-linecap="round"/>',
  snow: '<path d="M12 3v16M5 7l14 8M19 7L5 15" stroke="#e8fbff" stroke-width="1.4" stroke-linecap="round"/>',
};

export class Compass {
  private readonly root: HTMLElement;
  private readonly dial: HTMLElement;
  private readonly studs: HTMLElement;
  private readonly arm: HTMLElement;
  private readonly glyph: HTMLElement;
  private studIds = '';
  /** Marks seen once already: a later one slides in. */
  private primed = false;
  private readonly studAt = new Map<string, { el: HTMLElement; deg: number }>();
  private dialDeg = NaN;
  private armDeg = NaN;
  private sky: SkyGlyph | null = null;
  private shown = false;

  constructor() {
    this.studs = el('div', { className: 'studs' });
    this.dial = el('div', { className: 'dial' }, svg(DIAL), this.studs);
    this.arm = el('div', { className: 'arm' }, el('i', { className: 'sun' }), el('i', { className: 'moon' }));
    this.glyph = el('div', { className: 'glyph' });
    this.root = el('div', { id: 'compass', ariaHidden: 'true' },
      el('div', { className: 'ring' }, this.dial, el('div', { className: 'lubber' })),
      el('div', { className: 'orrery' }, el('div', { className: 'face' }), this.arm, this.glyph));
    document.body.append(this.root);
  }

  /** Shown while the hero plays (not over the title or character creation). */
  showWhile(on: boolean): boolean {
    if (on !== this.shown) { this.shown = on; this.root.classList.toggle('shown', on); }
    return on;
  }

  /** Each frame while shown. */
  read(r: CompassReading): void {
    // The ring turns with the camera, always true.
    const dial = r.look * DEG;
    if (!(Math.abs(dial - this.dialDeg) < 0.15)) { this.dialDeg = dial; this.dial.style.transform = `rotate(${dial.toFixed(2)}deg)`; }
    this.marks(r);
    // The orrery: the sun on top at noon, the moon at midnight.
    const arm = (r.hour - 12) * 15;
    if (!(Math.abs(arm - this.armDeg) < 0.2)) { this.armDeg = arm; this.arm.style.transform = `rotate(${arm.toFixed(1)}deg)`; }
    if (r.sky !== this.sky) { this.sky = r.sky; this.glyph.replaceChildren(svg(`<svg viewBox="0 0 24 20">${GLYPH[r.sky]}</svg>`)); this.glyph.className = `glyph ${r.sky}`; }
  }

  /** The marks as studs on the rim, at their bearing from the hero. */
  private marks(r: CompassReading): void {
    const ids = r.marks.map((m) => m.id).join(',');
    if (ids !== this.studIds) {
      this.studIds = ids;
      const was = new Map(this.studAt);
      this.studAt.clear();
      this.studs.replaceChildren(...r.marks.map((m) => {
        const s = was.get(m.id) ?? { el: el('i', { className: this.primed ? 'stud new' : 'stud' }), deg: NaN };
        this.studAt.set(m.id, s);
        return s.el;
      }));
    }
    this.primed = true;
    for (const m of r.marks) {
      const s = this.studAt.get(m.id)!, deg = Math.atan2(m.x - r.x, -(m.z - r.z)) * DEG;
      if (Math.abs(deg - s.deg) < 0.3) continue;
      s.deg = deg;
      s.el.style.transform = `rotate(${deg.toFixed(1)}deg) translateY(-${RIM}px)`;
    }
  }
}
