/**
 * The minimap, always on (plan 17.1, G4, D59; it took the compass's place): a round warded-brass ring at the top
 * of the screen, the land the hero knows round them inside it (the map's own parchment: hill shade, roads,
 * streets and houses, the guild houses, the marks people told of, the townsfolk near as dots) and the hero's
 * arrow in its middle. It turns with the camera: the lubber mark on top shows where the hero looks, the compass
 * letters ride the rim and stay upright, and it always points true. Marks farther than it shows ride the rim as
 * glowing studs. Beside it a tiny orrery: sun and moon turn with the hour, and a cloud, raindrop or snowflake
 * rides along with the weather. Plain DOM and one small canvas (hud.css): the sheet is painted a few times a
 * second at most (F2), and between paintings only transforms change.
 */
import './hud.css';
import { el, svg } from './dom';

export type SkyGlyph = 'clear' | 'cloud' | 'rain' | 'snow';

/** What the minimap shows this frame. */
export interface MinimapReading {
  /** Where the hero is (world metres). */
  readonly x: number;
  readonly z: number;
  /** The camera's yaw and the hero's facing (the walker's convention: 0 north, counter-clockwise, radians). */
  readonly look: number;
  readonly yaw: number;
  /** Hours 0..24. */
  readonly hour: number;
  readonly sky: SkyGlyph;
  /** The places marked on the map. */
  readonly marks: readonly { readonly id: string; readonly x: number; readonly z: number }[];
  /**
   * Below ground: the dungeon's own plan is the sheet (`sheet` names it, so it is painted afresh when it changes:
   * another dungeon or storey, or more of it seen), `range` metres to the round's edge, and the marks ride the
   * rim at their bearing from the way in (`from`) above.
   */
  readonly below?: { readonly sheet: string; readonly range: number; readonly from: { readonly x: number; readonly z: number } };
}

/**
 * Paints the known land round (x, z), `across` metres across the canvas, north up (MapUi.paintAround); false while
 * some of its land is still to be inked (a few tiles a painting), so it is painted again soon.
 */
export type SheetPainter = (canvas: HTMLCanvasElement, x: number, z: number, across: number) => boolean;

const DEG = 180 / Math.PI;
/** The rim's radius for the studs (px, in the dial's 100 px). */
const RIM = 44;
/** The VGM's studs (px from the middle of the 150 px ring, hud.css): RANGE metres is the land's edge, farther ones sit on the leather band. */
const LAND_PX = 58;
const BAND_PX = 66;
/** Metres from the hero to the edge of what the minimap shows. */
export const RANGE = 110;
/** The sheet covers this much more than the round shows, so it can slide under it between paintings. */
const SHEET = 1.6;
/** Canvas pixels of the sheet. */
const SHEET_PX = 320;
/** Paint again when the hero walked this far from where it was painted (m), or after MOST seconds; never within LEAST. */
const MOVED = 8;
const LEAST = 0.25;
const MOST = 1.5;

// The rim: a leather band between brass edges, its ticks and the four letters on it; the middle is open for the sheet.
const DIAL = `<svg viewBox="0 0 100 100" aria-hidden="true">
<circle cx="50" cy="50" r="44" fill="none" stroke="#1d1510" stroke-width="8"/>
<circle cx="50" cy="50" r="48" fill="none" stroke="#b08532" stroke-width="2.4"/>
<circle cx="50" cy="50" r="40" fill="none" stroke="#b08532" stroke-width="1.6"/>
<circle class="ward" cx="50" cy="50" r="41.3" fill="none" stroke="#8fe3ff" stroke-width="0.7" pathLength="100"/>
${Array.from({ length: 36 }, (_, i) => (i % 9 === 0 ? '' : `<line x1="50" y1="${i % 3 === 0 ? 3.4 : 4.4}" x2="50" y2="7" stroke="${i % 3 === 0 ? '#e2bd68' : '#8a6726'}" stroke-width="${i % 3 === 0 ? 1.1 : 0.7}" transform="rotate(${i * 10} 50 50)"/>`)).join('')}
<g class="letters" font-family="'Marcellus SC', Georgia, serif" font-size="8" font-weight="700" text-anchor="middle" dominant-baseline="central" stroke="#120c08" stroke-width="1.2" paint-order="stroke" stroke-linejoin="round">
<text x="50" y="6" fill="#ff8a5c">N</text><text x="94" y="50" fill="#ffe6a6">E</text><text x="50" y="94" fill="#ffe6a6">S</text><text x="6" y="50" fill="#ffe6a6">W</text>
</g></svg>`;
const GLYPH: Record<SkyGlyph, string> = {
  clear: '',
  cloud: '<path d="M6 14h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 6 14z" fill="#cbb898"/>',
  rain: '<path d="M6 11h11a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.6 1.3A3 3 0 0 0 6 11z" fill="#9aa4ad"/><path d="M8 14l-1 3M12 14l-1 3M16 14l-1 3" stroke="#8fe3ff" stroke-width="1.4" stroke-linecap="round"/>',
  snow: '<path d="M12 3v16M5 7l14 8M19 7L5 15" stroke="#e8fbff" stroke-width="1.4" stroke-linecap="round"/>',
};

export class Minimap {
  private readonly root: HTMLElement;
  private readonly dial: HTMLElement;
  private readonly studs: HTMLElement;
  private readonly arm: HTMLElement;
  private readonly glyph: HTMLElement;
  private studIds = '';
  /** Marks seen once already: a later one slides in. */
  private primed = false;
  private readonly studAt = new Map<string, { el: HTMLElement; deg: number }>();
  /** The VGM's studs (show mode), by decision id, with their last transform. */
  private readonly vgmStuds = el('div', { className: 'studs' });
  private readonly vgmAt = new Map<string, { el: HTMLElement; at: string }>();
  private dialDeg = NaN;
  private armDeg = NaN;
  private sky: SkyGlyph | null = null;
  private shown = false;
  private readonly sheet = el('canvas', { width: SHEET_PX, height: SHEET_PX, className: 'sheet' });
  private readonly arrow = el('div', { className: 'hero' });
  /** Where and when (s) the sheet was last painted. */
  private painted: { x: number; z: number; t: number; whole: boolean; sheet: string } | null = null;
  private slid = '';
  private arrowDeg = NaN;

  /** `paint`: the map's painter (none: an empty round, before the game has a map). */
  constructor(private readonly paint: SheetPainter | null = null) {
    this.studs = el('div', { className: 'studs' });
    this.dial = el('div', { className: 'dial' }, el('div', { className: 'land' }, this.sheet), svg(DIAL), this.vgmStuds, this.studs);
    this.arm = el('div', { className: 'arm' }, el('i', { className: 'sun' }), el('i', { className: 'moon' }));
    this.glyph = el('div', { className: 'glyph' });
    this.root = el('div', { id: 'compass', ariaHidden: 'true' },
      el('div', { className: 'ring' }, this.dial, this.arrow, el('div', { className: 'lubber' })),
      el('div', { className: 'orrery' }, el('div', { className: 'face' }), this.arm, this.glyph));
    document.body.append(this.root);
  }

  /** Shown while the hero plays (not over the title or character creation). */
  showWhile(on: boolean): boolean {
    if (on !== this.shown) { this.shown = on; this.root.classList.toggle('shown', on); }
    return on;
  }

  /** Each frame while shown. */
  read(r: MinimapReading): void {
    // The ring turns with the camera, always true; the sheet turns with it.
    const dial = r.look * DEG;
    if (!(Math.abs(dial - this.dialDeg) < 0.15)) { this.dialDeg = dial; this.dial.style.transform = `rotate(${dial.toFixed(2)}deg)`; this.dial.style.setProperty('--up', `${(-dial).toFixed(2)}deg`); }
    // The hero's arrow in the middle, pointing the way they face as the camera sees it.
    const arrow = (r.look - r.yaw) * DEG;
    if (!(Math.abs(arrow - this.arrowDeg) < 0.3)) { this.arrowDeg = arrow; this.arrow.style.transform = `rotate(${arrow.toFixed(1)}deg)`; }
    this.slideSheet(r);
    this.marks(r);
    // The orrery: the sun on top at noon, the moon at midnight.
    const arm = (r.hour - 12) * 15;
    if (!(Math.abs(arm - this.armDeg) < 0.2)) { this.armDeg = arm; this.arm.style.transform = `rotate(${arm.toFixed(1)}deg)`; }
    if (r.sky !== this.sky) { this.sky = r.sky; this.glyph.replaceChildren(svg(`<svg viewBox="0 0 24 20">${GLYPH[r.sky]}</svg>`)); this.glyph.className = `glyph ${r.sky}`; }
  }

  /** The sheet: painted again now and then round the hero, slid under the round between paintings. */
  private slideSheet(r: MinimapReading): void {
    if (!this.paint) return;
    const t = performance.now() / 1000, p = this.painted, range = r.below?.range ?? RANGE, across = 2 * range * SHEET, sheet = r.below?.sheet ?? '';
    const due = !p || p.sheet !== sheet || (t - p.t >= LEAST && (!p.whole || Math.hypot(r.x - p.x, r.z - p.z) > MOVED * range / RANGE || t - p.t >= MOST));
    if (due) this.painted = { x: r.x, z: r.z, t, sheet, whole: this.paint(this.sheet, r.x, r.z, across) };
    const q = this.painted!, slide = `translate(${((q.x - r.x) / across * 100).toFixed(2)}%, ${((q.z - r.z) / across * 100).toFixed(2)}%)`;
    if (slide !== this.slid) { this.slid = slide; this.sheet.style.transform = slide; }
  }

  /** The marks beyond the round as studs on the rim, at their bearing from the hero (nearer ones are on the sheet). */
  private marks(r: MinimapReading): void {
    // Below ground every mark is up on the land: on the rim, at its bearing from the way in.
    const at = r.below?.from ?? r;
    const far = r.marks.filter((m) => r.below || Math.hypot(m.x - r.x, m.z - r.z) > RANGE * 0.92);
    r = { ...r, x: at.x, z: at.z, marks: far };
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

  /**
   * Each frame while shown: where the VGM placed something lately (its show mode, a developer's aid), as
   * ward-blue studs at their spot inside the round when near, on the band when farther; none: no studs. The move
   * picked in the VGM window's log (`picked`) is lit brighter and larger, whether or not it is among them.
   * `inside`: metres the round shows of the land (0 below ground: every stud on the band, from the way in).
   */
  vgmMarks(placed: readonly { readonly id: string; readonly x: number; readonly z: number }[], x: number, z: number, picked: { readonly id: string; readonly x: number; readonly z: number } | null = null, inside = RANGE): void {
    const marks = picked && !placed.some((m) => m.id === picked.id) ? [...placed, picked] : placed;
    const now = new Set(marks.map((m) => m.id));
    for (const [id, s] of this.vgmAt) if (!now.has(id)) { s.el.remove(); this.vgmAt.delete(id); }
    for (const m of marks) {
      let s = this.vgmAt.get(m.id);
      if (!s) { s = { el: el('i', { className: 'stud vgm new' }), at: '' }; this.vgmAt.set(m.id, s); this.vgmStuds.append(s.el); }
      const d = Math.hypot(m.x - x, m.z - z), deg = Math.atan2(m.x - x, -(m.z - z)) * DEG;
      const out = d > inside ? BAND_PX : (d / inside) * LAND_PX;
      const at = `rotate(${deg.toFixed(1)}deg) translateY(-${out.toFixed(1)}px)`;
      if (at !== s.at) { s.at = at; s.el.style.transform = at; }
      s.el.classList.toggle('picked', m.id === picked?.id);
    }
  }
}
