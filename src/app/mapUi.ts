/**
 * The player's map (plan 11.7, D35, 17.1): a parchment of the land around the town, drawn from the height
 * field (hill shading and contours), the town's streets and houses, where the hero is, and the marks people
 * put on it when they tell of a place. The map key (M) unrolls it; the wheel zooms, dragging pans. A new
 * mark is drawn in with a quill stroke the first time the map shows it (or while the teller marks it, the
 * hand-over). Where the hero is follows their orientation skill: a vague area for a novice, an exact arrow
 * at mastery (src/game/orientation.ts).
 */
import type { TownPlan } from '@futuremagic/settlement';
import type { Bearing } from '../game/orientation';
import type { Journal } from '../talk/journal';
import { el } from './dom';
import { KeyWindow, type WindowHost } from './window';

export interface MapHost extends WindowHost {
  /** Ground height and water depth (> 0: water) at a point. */
  height(x: number, z: number): number;
  water(x: number, z: number): number;
  /** Where the hero believes they are and face (yaw as the walker's: 0 north), by their orientation. */
  heroBearing(): Bearing;
}

/** Metres across the whole parchment, and its raster (samples per side). */
const SPAN = 640;
const RASTER = 200;
const SIZE = 640;

export class MapUi extends KeyWindow {
  private readonly canvas: HTMLCanvasElement;
  private ground: HTMLCanvasElement | null = null;
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
    this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom = Math.min(8, Math.max(0.5, this.zoom * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); this.draw(); }, { passive: false });
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
    this.ground ??= this.paintGround();
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

  private middle(): [number, number] {
    return [this.centre[0], this.centre[1]];
  }

  /** The land under the parchment: hill shade, water and contours, once (it does not change). */
  private paintGround(): HTMLCanvasElement {
    const [mx, mz] = this.middle();
    const c = el('canvas', { width: RASTER, height: RASTER });
    const g = c.getContext('2d')!;
    const img = g.createImageData(RASTER, RASTER);
    const step = SPAN / RASTER;
    const h = new Float32Array((RASTER + 1) * (RASTER + 1));
    for (let j = 0; j <= RASTER; j++) for (let i = 0; i <= RASTER; i++) h[j * (RASTER + 1) + i] = this.map.height(mx - SPAN / 2 + i * step, mz - SPAN / 2 + j * step);
    for (let j = 0; j < RASTER; j++) for (let i = 0; i < RASTER; i++) {
      const k = j * (RASTER + 1) + i, y = h[k];
      const dx = h[k + 1] - y, dz = h[k + RASTER + 1] - y;
      // Light from the north-west; contours every 10 m.
      const shade = Math.max(-0.35, Math.min(0.35, (-dx - dz) / step * 0.6));
      const contour = Math.floor(y / 10) !== Math.floor(h[k + 1] / 10) || Math.floor(y / 10) !== Math.floor(h[k + RASTER + 1] / 10);
      const wet = this.map.water(mx - SPAN / 2 + (i + 0.5) * step, mz - SPAN / 2 + (j + 0.5) * step) > 0.05;
      let r = 226, gr = 208, b = 168;
      if (wet) { r = 150; gr = 170; b = 160; }
      const f = 1 + shade;
      const p = (j * RASTER + i) * 4;
      img.data[p] = r * f - (contour ? 40 : 0);
      img.data[p + 1] = gr * f - (contour ? 45 : 0);
      img.data[p + 2] = b * f - (contour ? 50 : 0);
      img.data[p + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
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
    this.ground ??= this.paintGround();
    this.paintMap(canvas, lead.mark.x, lead.mark.z, SPAN / 130, (l) => (l === id ? t : this.inked.has(l) ? 1 : 0));
    if (t >= 1) this.inked.add(id);
  }

  private paintMap(canvas: HTMLCanvasElement, cx: number, cz: number, zoom: number, strokeOf: (id: string) => number): void {
    const g = canvas.getContext('2d')!;
    const size = canvas.width;
    const [mx, mz] = this.middle();
    const s = (size / SPAN) * zoom, u = size / SIZE;
    const X = (x: number) => size / 2 + (x - cx) * s, Z = (z: number) => size / 2 + (z - cz) * s;
    g.fillStyle = '#d8c49a';
    g.fillRect(0, 0, size, size);
    if (this.ground) {
      g.imageSmoothingEnabled = true;
      g.drawImage(this.ground, X(mx - SPAN / 2), Z(mz - SPAN / 2), SPAN * s, SPAN * s);
    }
    const ink = '#3a2c1c';
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const plan of this.plans()) {
      for (const st of plan.streets) {
        g.strokeStyle = st.kind === 'track' ? '#8a7350' : '#6a5438';
        g.lineWidth = Math.max(1, st.width * s * 0.8);
        g.beginPath();
        for (let i = 0; i < st.pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(st.pts[i]), Z(st.pts[i + 1]));
        if (st.closed) g.closePath();
        g.stroke();
      }
      poly(g, plan.market, X, Z);
      g.fillStyle = '#c9b48a'; g.fill();
      for (const b of plan.buildings) {
        poly(g, b.poly, X, Z);
        g.fillStyle = b.kind === 'temple' || b.kind === 'hall' || b.kind === 'inn' ? '#5a3a24' : ink;
        g.fill();
      }
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
    this.paintHero(g, X, Z, s);
    // North.
    g.fillStyle = ink; g.font = `600 ${Math.round(16 * u)}px Georgia, serif`; g.textAlign = 'center';
    g.fillText('N', size - 28 * u, 30 * u);
    g.beginPath(); g.moveTo(size - 28 * u, 36 * u); g.lineTo(size - 33 * u, 56 * u); g.lineTo(size - 23 * u, 56 * u); g.closePath(); g.fill();
  }

  /** The hero as their orientation knows it: a wash of blue ink where they may be, and the arrow once they can tell their facing. */
  private paintHero(g: CanvasRenderingContext2D, X: (x: number) => number, Z: (z: number) => number, s: number): void {
    const hero = this.map.heroBearing();
    const hx = X(hero.x), hz = Z(hero.z);
    const blue = '#1e4a8a';
    if (hero.radius > 0) {
      const r = Math.max(8, hero.radius * s);
      const wash = g.createRadialGradient(hx, hz, 0, hx, hz, r);
      wash.addColorStop(0, '#1e4a8a55'); wash.addColorStop(0.7, '#1e4a8a2a'); wash.addColorStop(1, '#1e4a8a00');
      g.fillStyle = wash;
      g.beginPath(); g.arc(hx, hz, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1e4a8a99'; g.lineWidth = 1.5; g.setLineDash([5, 6]);
      g.beginPath(); g.arc(hx, hz, r, 0, Math.PI * 2); g.stroke();
      g.setLineDash([]);
      if (hero.yaw === null) {
        g.font = 'italic 15px Georgia, serif'; g.fillStyle = blue; g.textAlign = 'center';
        g.fillText('you?', hx, hz + 5);
        return;
      }
    }
    if (hero.yaw === null) return;
    const fx = -Math.sin(hero.yaw), fz = -Math.cos(hero.yaw);
    g.fillStyle = hero.radius > 0 ? '#1e4a8acc' : blue;
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
