/**
 * The ground as it is drawn near the camera, for everything that stands on it (the hero, birds, the wild's creatures,
 * a hold's wardens, trees and rocks): the finest terrain chunk's grid (a vertex every 2 m, every metre where a brook runs through the
 * chunk: chunkMesh.ts `finerFor`) with its quads cut as the mesh cuts them (`cutsAD`), heights at the vertices exact.
 * The land's own height has relief finer than that grid (a gully's slot, a brook's lip); stood on that, the hero sank
 * into the drawn ground where the mesh stepped over it. Standing on what is drawn, nothing can, whatever the land's
 * shape. Corners and each chunk's spacing are kept as asked for until the land changes (`version`). Pure.
 */
import type { Terrain } from './terrain';
import { CHUNK0, SEGS, drawnIn, finerFor } from './chunkMesh';

/** Corners kept (a power of two): some thousands, enough for everything near the hero. */
const SIZE = 1 << 14;

/** What the drawn ground is read off: the land's exact height, its version, and the segments of a finest chunk at (x0, z0). */
export interface DrawnSource {
  height(x: number, z: number): number;
  readonly version: number;
  segs(x0: number, z0: number): number;
}

/** A terrain as the source of its drawn ground. */
export const drawnSource = (t: Terrain): DrawnSource => ({
  height: t.height.bind(t),
  get version() { return t.version; },
  segs: (x0, z0) => finerFor(t, { x0, z0, size: CHUNK0, segs: SEGS }),
});

const kept = new WeakMap<Terrain, DrawnGround>();

/** The drawn ground of a terrain, one per terrain (what trees and rocks are set on, in the workers too). */
export function drawnOf(t: Terrain): DrawnGround {
  let g = kept.get(t);
  if (!g) kept.set(t, (g = new DrawnGround(drawnSource(t))));
  return g;
}

export class DrawnGround {
  private readonly ix = new Int32Array(SIZE);
  private readonly iz = new Int32Array(SIZE);
  private readonly h = new Float64Array(SIZE);
  /** The generation each slot was filled in (0: never); a new generation empties them all at once. */
  private readonly gen = new Uint32Array(SIZE);
  private now = 1;
  private seen: number;
  /** Each finest chunk's vertex spacing (m), by its key. */
  private readonly steps = new Map<number, number>();

  constructor(private readonly src: DrawnSource) {
    this.seen = src.version;
  }

  /** The drawn ground's height at (x, z), metres. */
  footing(x: number, z: number): number {
    const v = this.src.version;
    if (v !== this.seen) { this.seen = v; this.clear(); }
    const step = this.stepAt(x, z);
    const fx = x / step, fz = z / step, i = Math.floor(fx), j = Math.floor(fz);
    // Corners in whole metres (steps are 1 or 2 m), so a corner two chunks share is one.
    const a = this.kept(i * step, j * step), b = this.kept((i + 1) * step, j * step);
    const c = this.kept(i * step, (j + 1) * step), d = this.kept((i + 1) * step, (j + 1) * step);
    return drawnIn(a, b, c, d, fx - i, fz - j, step);
  }

  /** Forget every height kept. */
  clear(): void {
    if (++this.now === 0xffffffff) { this.gen.fill(0); this.now = 1; }
    this.steps.clear();
  }

  private stepAt(x: number, z: number): number {
    const ci = Math.floor(x / CHUNK0), cj = Math.floor(z / CHUNK0), key = (ci + 0x100000) * 0x200000 + (cj + 0x100000);
    let s = this.steps.get(key);
    if (s === undefined) {
      if (this.steps.size > 256) this.steps.clear();
      s = CHUNK0 / this.src.segs(ci * CHUNK0, cj * CHUNK0);
      this.steps.set(key, s);
    }
    return s;
  }

  private kept(x: number, z: number): number {
    const k = (Math.imul(x, 73856093) ^ Math.imul(z, 19349663)) & (SIZE - 1);
    if (this.gen[k] === this.now && this.ix[k] === x && this.iz[k] === z) return this.h[k];
    const h = this.src.height(x, z);
    this.gen[k] = this.now; this.ix[k] = x; this.iz[k] = z; this.h[k] = h;
    return h;
  }
}
