/**
 * The player's map (plan 11.7, D35, 17.1): a parchment of the land the hero knows (src/game/knownLand.ts:
 * what they saw on their way, and what tellers sketched in, fainter), drawn from the height field (hill
 * shading and contours) with the towns' streets and houses and the roads, where the hero is, the marks
 * people put on it when they tell of a place and the ways they sketched there. Land not known stays bare
 * parchment; it is inked in tile by tile as the map shows it. The map key (M) unrolls it; the wheel zooms, dragging pans. A new
 * mark is drawn in with a quill stroke the first time the map shows it (or while the teller marks it, the
 * hand-over). The map shows exactly where the hero is and which way they face (D59: no orientation skill).
 */
import type { TownPlan } from '@futuremagic/settlement';
import { CELL, SEEN, type KnownLand } from '../game/knownLand';
import type { Journal } from '../talk/journal';
import { el } from './dom';
import { KeyWindow, type WindowHost } from './window';

export interface MapHost extends WindowHost {
  /** Ground height and water depth (> 0: water) at a point. */
  height(x: number, z: number): number;
  water(x: number, z: number): number;
  /** Where the hero is and faces (yaw as the walker's: 0 north). */
  heroAt(): { readonly x: number; readonly z: number; readonly yaw: number };
  /** Named houses drawn on the sheet from the start (the guild houses, D49; a hidden one once the bard told of it). */
  signs?(): readonly MapSign[];
  /** The land the hero knows: the map shows only that. */
  readonly known: KnownLand;
  /** The roads on the land (points as x, y, z triples). */
  roadLines?(): readonly MapRoad[];
}

/** A road drawn on the map. */
export interface MapRoad {
  readonly pts: readonly number[];
  readonly way: string;
}

/** A named house on the map. */
export interface MapSign {
  readonly x: number;
  readonly z: number;
  readonly label: string;
}

/** Metres across the parchment at zoom 1, and its pixels per side. */
const SPAN = 640;
const SIZE = 640;
/**
 * The land is painted in tiles of TILE metres, FINE samples per side (3.2 m a sample); zoomed out until a
 * tile is smaller than FINE_PIXELS on the sheet, COARSE samples (16 m) do.
 */
const TILE = 128;
const FINE = 40;
const COARSE = 8;
const FINE_PIXELS = 48;
/** Milliseconds of tile painting per drawing of the map; the rest follows in later frames. */
const INK_BUDGET = 6;
/** Zoom limits: about 10 km across the sheet at the widest, 80 m at the closest. */
const ZOOM_MIN = 0.064;
const ZOOM_MAX = 8;

export class MapUi extends KeyWindow {
  private readonly canvas: HTMLCanvasElement;
  /** Painted land, by tile key. */
  private readonly tiles = new Map<number, HTMLCanvasElement>();
  /** The known cells as alpha, one pixel per cell (rebuilt when the knowledge grows). */
  private mask: { canvas: HTMLCanvasElement; i0: number; j0: number; version: number } | null = null;
  /** The land, roads and towns before the mask cuts them to the known land. */
  private layer: HTMLCanvasElement | null = null;
  private inking = 0;
  private zoom = 2;
  private cx = 0;
  private cz = 0;
  /** Marks already drawn in once. */
  private readonly inked = new Set<string>();
  private stroke = 1;
  private frame = 0;

  /** `centre`: the middle of the sheet (where the game began); `plans`: every town on the land, each drawn alike. */
  constructor(private readonly centre: readonly [number, number], private readonly plans: () => readonly TownPlan[], private readonly journal: Journal, private readonly map: MapHost) {
    const canvas = el('canvas', { width: SIZE, height: SIZE, className: 'parchment' });
    super('Map', 'map', 'map', map, el('div', { className: 'body' }, canvas, el('p', { className: 'hint', textContent: 'Wheel: zoom. Drag: move. Marks show what people told you of.' })));
    this.canvas = canvas;
    [this.cx, this.cz] = this.middle();
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); this.draw(); }, { passive: false });
    let drag: [number, number] | null = null;
    this.canvas.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointerup', () => { drag = null; });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const k = SPAN / SIZE / this.zoom * (SIZE / this.canvas.clientWidth);
      this.cx -= (e.clientX - drag[0]) * k; this.cz -= (e.clientY - drag[1]) * k;
      drag = [e.clientX, e.clientY];
      this.draw();
    });
  }

  protected closed(): void { cancelAnimationFrame(this.frame); }

  protected opened(): void {
    // A new mark: centre on it and draw it in.
    const fresh = this.journal.open.find((l) => !this.inked.has(l.id));
    if (fresh) { this.cx = fresh.mark.x; this.cz = fresh.mark.z; this.stroke = 0; }
    const t0 = performance.now();
    const step = () => {
      this.stroke = fresh ? Math.min(1, (performance.now() - t0) / 1100) : 1;
      this.draw();
      if (this.stroke < 1) this.frame = requestAnimationFrame(step);
      else for (const l of this.journal.open) this.inked.add(l.id);
    };
    step();
  }

  /** Whether any cell of tile (ti, tj) is known. */
  private tileKnown(ti: number, tj: number): boolean {
    const n = TILE / CELL;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (this.map.known.level(ti * n + i, tj * n + j)) return true;
    return false;
  }

  private middle(): [number, number] {
    return [this.centre[0], this.centre[1]];
  }

  /**
   * One tile of land: hill shade, water and contours (the land does not change, so once). It carries one
   * sample more on every side, so the smoothed picture has no light seam where tiles meet.
   */
  private paintTile(ti: number, tj: number, raster: number): HTMLCanvasElement {
    const R = raster + 2, step = TILE / raster, x0 = ti * TILE - step, z0 = tj * TILE - step;
    const c = el('canvas', { width: R, height: R });
    const g = c.getContext('2d')!;
    const img = g.createImageData(R, R);
    const h = new Float32Array((R + 1) * (R + 1));
    for (let j = 0; j <= R; j++) for (let i = 0; i <= R; i++) h[j * (R + 1) + i] = this.map.height(x0 + i * step, z0 + j * step);
    for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
      const k = j * (R + 1) + i, y = h[k];
      const dx = h[k + 1] - y, dz = h[k + R + 1] - y;
      // Light from the north-west; contours every 10 m.
      const shade = Math.max(-0.35, Math.min(0.35, (-dx - dz) / step * 0.6));
      const contour = Math.floor(y / 10) !== Math.floor(h[k + 1] / 10) || Math.floor(y / 10) !== Math.floor(h[k + R + 1] / 10);
      const wet = this.map.water(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step) > 0.05;
      let r = 226, gr = 208, b = 168;
      if (wet) { r = 150; gr = 170; b = 160; }
      const f = 1 + shade;
      const p = (j * R + i) * 4;
      img.data[p] = r * f - (contour ? 40 : 0);
      img.data[p + 1] = gr * f - (contour ? 45 : 0);
      img.data[p + 2] = b * f - (contour ? 50 : 0);
      img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** The known cells as an alpha mask: full for land seen, faint for land told of. */
  private knownMask(): NonNullable<MapUi['mask']> {
    const known = this.map.known;
    if (this.mask?.version === known.version) return this.mask;
    const b = known.bounds() ?? { i0: 0, j0: 0, i1: 0, j1: 0 };
    // One empty cell round the edge, so the mask fades out at its border too.
    const i0 = b.i0 - 1, j0 = b.j0 - 1, w = b.i1 - i0 + 2, hgt = b.j1 - j0 + 2;
    const c = el('canvas', { width: w, height: hgt });
    const g = c.getContext('2d')!;
    const img = g.createImageData(w, hgt);
    known.eachCell((i, j, level) => { img.data[((j - j0) * w + (i - i0)) * 4 + 3] = level === SEEN ? 255 : 120; });
    g.putImageData(img, 0, 0);
    this.mask = { canvas: c, i0, j0, version: known.version };
    return this.mask;
  }

  private draw(): void {
    this.paintMap(this.canvas, this.cx, this.cz, this.zoom, (id) => (this.inked.has(id) ? 1 : this.stroke));
  }

  /**
   * The hand-over: the map around a lead's mark, on a small canvas, with the mark drawn in to `t` (0..1).
   * Drawn in fully, the mark counts as inked: opening the map later does not draw it again.
   */
  markIn(id: string, canvas: HTMLCanvasElement, t: number): void {
    const lead = this.journal.open.find((l) => l.id === id);
    if (!lead) return;
    this.paintMap(canvas, lead.mark.x, lead.mark.z, SPAN / 130, (l) => (l === id ? t : this.inked.has(l) ? 1 : 0));
    if (t >= 1) this.inked.add(id);
  }

  private paintMap(canvas: HTMLCanvasElement, cx: number, cz: number, zoom: number, strokeOf: (id: string) => number): void {
    const g = canvas.getContext('2d')!;
    const size = canvas.width;
    const s = (size / SPAN) * zoom, u = size / SIZE;
    const X = (x: number) => size / 2 + (x - cx) * s, Z = (z: number) => size / 2 + (z - cz) * s;
    g.fillStyle = '#d8c49a';
    g.fillRect(0, 0, size, size);
    // The land, the roads and the towns, on their own layer, cut to the land the hero knows.
    const layer = this.layer?.width === size ? this.layer : (this.layer = el('canvas', { width: size, height: size }));
    const l = layer.getContext('2d')!;
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, size, size);
    const mask = this.knownMask();
    const half = size / 2 / s;
    const ti0 = Math.floor((cx - half) / TILE), ti1 = Math.floor((cx + half) / TILE);
    const tj0 = Math.floor((cz - half) / TILE), tj1 = Math.floor((cz + half) / TILE);
    const t0 = performance.now();
    let missing = false;
    const fine = TILE * s >= FINE_PIXELS ? 1 : 0;
    l.imageSmoothingEnabled = true;
    for (let tj = tj0; tj <= tj1; tj++) for (let ti = ti0; ti <= ti1; ti++) {
      if (!this.tileKnown(ti, tj)) continue;
      const key = ((ti + 32768) * 65536 + (tj + 32768)) * 2;
      let tile = this.tiles.get(key + fine);
      if (!tile && performance.now() - t0 <= INK_BUDGET) this.tiles.set(key + fine, (tile = this.paintTile(ti, tj, fine ? FINE : COARSE)));
      if (!tile) missing = true;
      // While the fine tile waits, the coarse one stands in.
      tile ??= this.tiles.get(key);
      if (!tile) continue;
      const r = tile.width - 2;
      l.drawImage(tile, 1, 1, r, r, X(ti * TILE), Z(tj * TILE), TILE * s, TILE * s);
    }
    if (missing && this.isOpen && !this.inking) this.inking = requestAnimationFrame(() => { this.inking = 0; if (this.isOpen) this.draw(); });
    const ink = '#3a2c1c';
    l.lineCap = 'round'; l.lineJoin = 'round';
    for (const r of this.map.roadLines?.() ?? []) {
      l.strokeStyle = '#8a7350';
      l.lineWidth = Math.max(1, (r.way === 'road' ? 5.5 : 3.6) * s * 0.8);
      l.beginPath();
      for (let i = 0; i < r.pts.length; i += 3) (i ? l.lineTo : l.moveTo).call(l, X(r.pts[i]), Z(r.pts[i + 2]));
      l.stroke();
    }
    for (const plan of this.plans()) {
      for (const st of plan.streets) {
        l.strokeStyle = st.kind === 'track' ? '#8a7350' : '#6a5438';
        l.lineWidth = Math.max(1, st.width * s * 0.8);
        l.beginPath();
        for (let i = 0; i < st.pts.length; i += 2) (i ? l.lineTo : l.moveTo).call(l, X(st.pts[i]), Z(st.pts[i + 1]));
        if (st.closed) l.closePath();
        l.stroke();
      }
      poly(l, plan.market, X, Z);
      l.fillStyle = '#c9b48a'; l.fill();
      for (const b of plan.buildings) {
        poly(l, b.poly, X, Z);
        l.fillStyle = b.kind === 'temple' || b.kind === 'hall' || b.kind === 'inn' ? '#5a3a24' : ink;
        l.fill();
      }
    }
    // The mask, one pixel a cell, smoothed: the known land's edge fades out over a cell.
    l.globalCompositeOperation = 'destination-in';
    l.drawImage(mask.canvas, X(mask.i0 * CELL), Z(mask.j0 * CELL), mask.canvas.width * CELL * s, mask.canvas.height * CELL * s);
    l.globalCompositeOperation = 'source-over';
    g.drawImage(layer, 0, 0);
    g.lineCap = 'round'; g.lineJoin = 'round';
    // The ways tellers sketched to the open leads: a dotted line of brown ink.
    const open = new Set(this.journal.open.map((x) => x.id));
    g.strokeStyle = '#6a4a2c'; g.lineWidth = 2 * Math.max(1, u); g.setLineDash([2 * Math.max(1, u), 7 * Math.max(1, u)]);
    for (const w of this.map.known.waysOf(open)) {
      g.beginPath(); g.moveTo(X(w.from[0]), Z(w.from[1])); g.lineTo(X(w.to[0]), Z(w.to[1])); g.stroke();
    }
    g.setLineDash([]);
    // The guild houses: a small shield of brown ink and the house's name.
    for (const sg of this.map.signs?.() ?? []) {
      const x = X(sg.x), z = Z(sg.z), k = 6 * Math.max(1, u);
      g.fillStyle = '#5a3a24';
      g.beginPath(); g.moveTo(x - k, z - k); g.lineTo(x + k, z - k); g.lineTo(x + k, z); g.quadraticCurveTo(x + k, z + k, x, z + k * 1.5); g.quadraticCurveTo(x - k, z + k, x - k, z); g.closePath(); g.fill();
      g.font = `${Math.round(13 * Math.max(1, u))}px Georgia, serif`; g.textAlign = 'left';
      if (zoom >= 0.5) g.fillText(sg.label, x + k + 4, z + 4);
    }
    // The marks: a ring of red ink and the place's name.
    for (const l of this.journal.open) {
      const t = strokeOf(l.id);
      if (t <= 0) continue;
      const x = X(l.mark.x), z = Z(l.mark.z), r = 12 * Math.max(1, u);
      g.strokeStyle = '#a0281e'; g.lineWidth = 2.5 * Math.max(1, u);
      g.beginPath(); g.arc(x, z, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); g.stroke();
      if (t >= 1) {
        g.font = `italic ${Math.round(15 * Math.max(1, u))}px Georgia, serif`; g.fillStyle = '#7a1e16'; g.textAlign = 'left';
        g.fillText(l.mark.label, x + r + 4, z + 5);
      }
    }
    this.paintHero(g, X, Z);
    // North.
    g.fillStyle = ink; g.font = `600 ${Math.round(16 * u)}px Georgia, serif`; g.textAlign = 'center';
    g.fillText('N', size - 28 * u, 30 * u);
    g.beginPath(); g.moveTo(size - 28 * u, 36 * u); g.lineTo(size - 33 * u, 56 * u); g.lineTo(size - 23 * u, 56 * u); g.closePath(); g.fill();
  }

  /** The hero: a blue arrow where they stand, pointing the way they face. */
  private paintHero(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number): void {
    const hero = this.map.heroAt();
    const hx = X(hero.x), hz = Z(hero.z), fx = -Math.sin(hero.yaw), fz = -Math.cos(hero.yaw);
    g.fillStyle = '#1e4a8a';
    g.beginPath();
    g.moveTo(hx + fx * 10, hz + fz * 10);
    g.lineTo(hx - fx * 6 + fz * 6, hz - fz * 6 - fx * 6);
    g.lineTo(hx - fx * 6 - fz * 6, hz - fz * 6 + fx * 6);
    g.closePath(); g.fill();
  }
}

function poly(g: CanvasRenderingContext2D, p: readonly number[], X: (x: number) => number, Z: (z: number) => number): void {
  g.beginPath();
  for (let i = 0; i < p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(p[i]), Z(p[i + 1]));
  g.closePath();
}
