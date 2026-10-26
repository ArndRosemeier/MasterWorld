/**
 * The compass, always on (plan 17.1, D35, D45): a brass ring at the top of the screen that turns with the
 * camera. Its needle breathes, lags behind a turn and settles with an overshoot; how true it points follows
 * the hero's orientation skill (src/game/orientation.ts): a novice's needle wanders and the ring's letters
 * are faint, a master's points true. The places marked on the map ride on the rim as small glowing studs.
 * Beside it a tiny orrery: sun and moon turn with the hour, and a cloud, raindrop or snowflake rides along
 * with the weather. Plain DOM (hud.css); every frame only transforms change, and only when they moved.
 */
import './hud.css';
import { Noise, angleDiff, deriveSeed } from '@futuremagic/core';
import type { Bearing } from '../game/orientation';
import { el, svg } from './dom';

export type SkyGlyph = 'clear' | 'cloud' | 'rain' | 'snow';

/** What the compass shows this frame. */
export interface CompassReading {
  /** Where the hero believes they are and face (orientation.bearing, with the camera's yaw). */
  readonly bearing: Bearing;
  /** The camera's yaw (the walker's convention: 0 north, counter-clockwise, radians). */
  readonly look: number;
  /** The orientation skill's mastery, 0 novice .. 1 master. */
  readonly mastery: number;
  /** Hours 0..24. */
  readonly hour: number;
  readonly sky: SkyGlyph;
  /** The places marked on the map. */
  readonly marks: readonly { readonly id: string; readonly x: number; readonly z: number }[];
}

const DEG = 180 / Math.PI;
/** The needle's spring (1/s²) and damping (1/s): under-damped, so it overshoots and settles. */
const SPRING = 38;
const DAMP = 4.2;
/** How far a lost novice's needle wanders (degrees). */
const WANDER = 80;
/** The rim's radius for the studs (px, in the dial's 100 px). */
const RIM = 43;

const DIAL = `<svg viewBox="0 0 100 100" aria-hidden="true">
<circle cx="50" cy="50" r="47" fill="#1d1510" stroke="#b08532" stroke-width="3"/>
<circle cx="50" cy="50" r="40" fill="none" stroke="#6e4f17" stroke-width="1"/>
<circle class="ward" cx="50" cy="50" r="43.5" fill="none" stroke="#8fe3ff" stroke-width="1" pathLength="100"/>
${Array.from({ length: 36 }, (_, i) => `<line x1="50" y1="${i % 9 === 0 ? 9 : 10.5}" x2="50" y2="14" stroke="${i % 9 === 0 ? '#e2bd68' : '#8a6726'}" stroke-width="${i % 9 === 0 ? 1.6 : 0.8}" transform="rotate(${i * 10} 50 50)"/>`).join('')}
<g class="letters" font-family="'Marcellus SC', Georgia, serif" font-size="10" text-anchor="middle">
<text x="50" y="25" fill="#ff7a50">N</text><text x="78" y="53.5" fill="#e2bd68">E</text><text x="50" y="82" fill="#e2bd68">S</text><text x="22" y="53.5" fill="#e2bd68">W</text>
</g></svg>`;
const NEEDLE = `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 17 L54.5 50 L50 83 L45.5 50 Z" fill="#b08532"/><path d="M50 17 L54.5 50 L45.5 50 Z" fill="#e2593a"/><circle cx="50" cy="50" r="4.5" fill="#f0c96a" stroke="#6e4f17"/></svg>`;
const GLYPH: Record<SkyGlyph, string> = {
  clear: '',
  cloud: '<path d="M6 14h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 6 14z" fill="#cbb898"/>',
  rain: '<path d="M6 11h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 6 11z" fill="#9aa4ad"/><path d="M8 14l-1 3M12 14l-1 3M16 14l-1 3" stroke="#8fe3ff" stroke-width="1.4" stroke-linecap="round"/>',
  snow: '<path d="M12 3v16M5 7l14 8M19 7L5 15" stroke="#e8fbff" stroke-width="1.4" stroke-linecap="round"/>',
};

export class Compass {
  private readonly root: HTMLElement;
  private readonly dial: HTMLElement;
  private readonly needle: HTMLElement;
  private readonly studs: HTMLElement;
  private readonly arm: HTMLElement;
  private readonly glyph: HTMLElement;
  private readonly noise: Noise;
  private studIds = '';
  /** Marks seen once already: a later one slides in. */
  private primed = false;
  private readonly studAt = new Map<string, { el: HTMLElement; deg: number }>();
  private dialDeg = NaN;
  private armDeg = NaN;
  private needleDeg = 0;
  private needleShown = NaN;
  private spin = 0;
  private time = 0;
  private sky: SkyGlyph | null = null;
  private lost: boolean | null = null;

  constructor(seed: number) {
    this.noise = new Noise(deriveSeed(seed, 'compass'));
    this.studs = el('div', { className: 'studs' });
    this.dial = el('div', { className: 'dial' }, svg(DIAL), this.studs);
    this.needle = el('div', { className: 'needle' }, svg(NEEDLE));
    this.arm = el('div', { className: 'arm' }, el('i', { className: 'sun' }), el('i', { className: 'moon' }));
    this.glyph = el('div', { className: 'glyph' });
    this.root = el('div', { id: 'compass', ariaHidden: 'true' },
      el('div', { className: 'ring' }, this.dial, this.needle, el('div', { className: 'lubber' })),
      el('div', { className: 'orrery' }, el('div', { className: 'face' }), this.arm, this.glyph));
    document.body.append(this.root);
  }

  /** Shown while the hero plays (not over the title or character creation). */
  set visible(on: boolean) { if (on !== this.visible) this.root.classList.toggle('shown', on); }
  get visible(): boolean { return this.root.classList.contains('shown'); }

  /** Each frame while shown. */
  read(dt: number, r: CompassReading): void {
    this.time += dt;
    const b = r.bearing, known = b.yaw !== null;
    // The ring turns with the camera (as the hero believes it faces, once they can tell).
    const dial = (known ? b.yaw! : r.look) * DEG;
    if (!(Math.abs(dial - this.dialDeg) < 0.15)) { this.dialDeg = dial; this.dial.style.transform = `rotate(${dial.toFixed(2)}deg)`; }
    if (this.lost !== !known) { this.lost = !known; this.root.classList.toggle('lost', !known); }
    // The needle seeks the ring's north, off by what the hero does not know, on a spring; it breathes at rest.
    const wander = (1 - r.mastery) * (known ? 0.15 : 1) * WANDER * this.noise.n2(this.time * 0.08, 3.7);
    const target = dial + wander;
    const pull = angleDiff(this.needleDeg / DEG, target / DEG) * DEG;
    this.spin += (SPRING * pull - DAMP * this.spin) * Math.min(dt, 0.05);
    this.needleDeg += this.spin * Math.min(dt, 0.05);
    const shown = this.needleDeg + Math.sin(this.time * 1.3) * 1.1;
    if (!(Math.abs(shown - this.needleShown) < 0.1)) { this.needleShown = shown; this.needle.style.transform = `rotate(${shown.toFixed(2)}deg)`; }
    this.marks(r);
    // The orrery: the sun on top at noon, the moon at midnight.
    const arm = (r.hour - 12) * 15;
    if (!(Math.abs(arm - this.armDeg) < 0.2)) { this.armDeg = arm; this.arm.style.transform = `rotate(${arm.toFixed(1)}deg)`; }
    if (r.sky !== this.sky) { this.sky = r.sky; this.glyph.replaceChildren(svg(`<svg viewBox="0 0 24 20">${GLYPH[r.sky]}</svg>`)); this.glyph.className = `glyph ${r.sky}`; }
  }

  /** The marks as studs on the rim, at their bearing from where the hero believes they are. */
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
      const s = this.studAt.get(m.id)!, deg = Math.atan2(m.x - r.bearing.x, -(m.z - r.bearing.z)) * DEG;
      if (Math.abs(deg - s.deg) < 0.3) continue;
      s.deg = deg;
      s.el.style.transform = `rotate(${deg.toFixed(1)}deg) translateY(-${RIM}px)`;
    }
  }
}
