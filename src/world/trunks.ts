/**
 * Tree trunks as obstacles (pure): the near flora (world/flora.ts) around a point, kept in small square
 * cells as trunk circles, so walkers (the hero, horses) and the townsfolk go round trees instead of
 * through them. Shrubs are soft and stay passable. Cells come from the same seeded placement the trees
 * are drawn from, so the trunks stand where the trees do: fetched ahead from the world workers (`around`),
 * or placed on the spot (about 1.5 ms a cell) when a body gets to one first.
 */
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement } from './flora';
import type { Terrain } from './terrain';

/** Cell side (m), a multiple of NEAR_SPACING so cells share the drawn trees' candidate grid. */
const CELL = 32;
/** Cells kept (the oldest are dropped): a few hundred metres of land around the player. */
const KEEP = 96;
/** The widest trunk there is (m, at the largest scale): how far beyond a cell a trunk can reach. */
const REACH = Math.max(...FLORA_KINDS.map((k) => k.trunk)) * 1.3;

export class Trunks {
  /** Per cell: x, z, radius of each trunk in it. */
  private readonly cells = new Map<number, Float32Array>();

  private readonly asked = new Set<number>();

  /** `fetch`: the flora of a square from the world workers (WorldJobs.flora); without it cells are placed here. */
  constructor(private readonly terrain: Terrain, private readonly fetch?: (x0: number, z0: number, size: number, spacing: number) => Promise<Float32Array>) {}

  /** Ask ahead for the cells around (x, z) (once a frame is fine: cells already there or asked for cost nothing). */
  around(x: number, z: number): void {
    if (!this.fetch) return;
    const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
    for (let j = cj - 2; j <= cj + 2; j++) for (let i = ci - 2; i <= ci + 2; i++) {
      const key = keyOf(i, j);
      if (this.cells.has(key) || this.asked.has(key)) continue;
      this.asked.add(key);
      void this.fetch(i * CELL, j * CELL, CELL, NEAR_SPACING).then((d) => {
        this.asked.delete(key);
        if (!this.cells.has(key)) this.keep(key, trunksOf(d));
      });
    }
  }

  /** Does a body of radius `r` standing at (x, z) touch a trunk? */
  blocks(x: number, z: number, r: number): boolean {
    const m = r + REACH;
    const i0 = Math.floor((x - m) / CELL), i1 = Math.floor((x + m) / CELL);
    const j0 = Math.floor((z - m) / CELL), j1 = Math.floor((z + m) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = this.trunksIn(i, j);
      for (let k = 0; k < c.length; k += 3) {
        const dx = c[k] - x, dz = c[k + 1] - z, rr = c[k + 2] + r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
    return false;
  }

  private trunksIn(i: number, j: number): Float32Array {
    const key = keyOf(i, j);
    const c = this.cells.get(key);
    if (c) return c;
    const d = floraPlacement(this.terrain, { seed: this.terrain.seed, setting: this.terrain.setting.id, x0: i * CELL, z0: j * CELL, size: CELL, spacing: NEAR_SPACING });
    return this.keep(key, trunksOf(d));
  }

  private keep(key: number, c: Float32Array): Float32Array {
    if (this.cells.size >= KEEP) this.cells.delete(this.cells.keys().next().value as number);
    this.cells.set(key, c);
    return c;
  }
}

/** Cell indices stay well inside ±2^15 (a world of ±1000 km), so one number is the key. */
const keyOf = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);

/** x, z, radius of each tree's trunk among flora records. */
function trunksOf(d: Float32Array): Float32Array {
  const out: number[] = [];
  for (let r = 0; r < d.length; r += FLORA_STRIDE) {
    const trunk = FLORA_KINDS[d[r + 5]].trunk;
    if (trunk > 0) out.push(d[r], d[r + 2], trunk * d[r + 3]);
  }
  return Float32Array.from(out);
}
