/**
 * The player's map (plan 11.7, D35, 17.1): a parchment of the land around the town, drawn from the height
 * field (hill shading and contours), the town's streets and houses, the hero's arrow, and the marks people
 * put on it when they tell of a place. The map key (M) unrolls it; the wheel zooms, dragging pans. A new
 * mark is drawn in with a quill stroke the first time the map shows it.
 */
import { polyCentroid, type TownPlan } from '@futuremagic/settlement';
import type { Journal } from '../talk/journal';
import { el } from './dom';
import { KeyWindow, type WindowHost } from './window';

export interface MapHost extends WindowHost {
  /** Ground height and water depth (> 0: water) at a point. */
  height(x: number, z: number): number;
  water(x: number, z: number): number;
  /** Where the hero is and faces (yaw as the walker's: 0 north). */
  readonly hero: { x: number; z: number; yaw: number };
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

  constructor(private readonly plan: TownPlan, private readonly journal: Journal, private readonly map: MapHost) {
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
    const [x, z] = polyCentroid(this.plan.market);
    return [x, z];
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
    const g = this.canvas.getContext('2d')!;
    const [mx, mz] = this.middle();
    const s = (SIZE / SPAN) * this.zoom;
    const X = (x: number) => SIZE / 2 + (x - this.cx) * s, Z = (z: number) => SIZE / 2 + (z - this.cz) * s;
    g.fillStyle = '#d8c49a';
    g.fillRect(0, 0, SIZE, SIZE);
    if (this.ground) {
      g.imageSmoothingEnabled = true;
      g.drawImage(this.ground, X(mx - SPAN / 2), Z(mz - SPAN / 2), SPAN * s, SPAN * s);
    }
    const ink = '#3a2c1c';
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const st of this.plan.streets) {
      g.strokeStyle = st.kind === 'track' ? '#8a7350' : '#6a5438';
      g.lineWidth = Math.max(1, st.width * s * 0.8);
      g.beginPath();
      for (let i = 0; i < st.pts.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(st.pts[i]), Z(st.pts[i + 1]));
      if (st.closed) g.closePath();
      g.stroke();
    }
    poly(g, this.plan.market, X, Z);
    g.fillStyle = '#c9b48a'; g.fill();
    for (const b of this.plan.buildings) {
      poly(g, b.poly, X, Z);
      g.fillStyle = b.kind === 'temple' || b.kind === 'hall' || b.kind === 'inn' ? '#5a3a24' : ink;
      g.fill();
    }
    // The marks: a ring of red ink and the place's name.
    for (const l of this.journal.open) {
      const t = this.inked.has(l.id) ? 1 : this.stroke;
      const x = X(l.mark.x), z = Z(l.mark.z), r = 12;
      g.strokeStyle = '#a0281e'; g.lineWidth = 2.5;
      g.beginPath(); g.arc(x, z, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t); g.stroke();
      if (t >= 1) {
        g.font = 'italic 15px Georgia, serif'; g.fillStyle = '#7a1e16'; g.textAlign = 'left';
        g.fillText(l.mark.label, x + r + 4, z + 5);
      }
    }
    // The hero.
    const hero = this.map.hero;
    const hx = X(hero.x), hz = Z(hero.z), fx = -Math.sin(hero.yaw), fz = -Math.cos(hero.yaw);
    g.fillStyle = '#1e4a8a';
    g.beginPath();
    g.moveTo(hx + fx * 10, hz + fz * 10);
    g.lineTo(hx - fx * 6 + fz * 6, hz - fz * 6 - fx * 6);
    g.lineTo(hx - fx * 6 - fz * 6, hz - fz * 6 + fx * 6);
    g.closePath(); g.fill();
    // North.
    g.fillStyle = ink; g.font = '600 16px Georgia, serif'; g.textAlign = 'center';
    g.fillText('N', SIZE - 28, 30);
    g.beginPath(); g.moveTo(SIZE - 28, 36); g.lineTo(SIZE - 33, 56); g.lineTo(SIZE - 23, 56); g.closePath(); g.fill();
  }
}

function poly(g: CanvasRenderingContext2D, p: readonly number[], X: (x: number) => number, Z: (z: number) => number): void {
  g.beginPath();
  for (let i = 0; i < p.length; i += 2) (i ? g.lineTo : g.moveTo).call(g, X(p[i]), Z(p[i + 1]));
  g.closePath();
}
