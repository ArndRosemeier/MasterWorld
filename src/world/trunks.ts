/**
 * Tree trunks as obstacles (pure): the near flora (world/flora.ts) around a point, kept in small square
 * cells as trunk circles, so walkers (the hero, horses) and the townsfolk go round trees instead of
 * through them. Shrubs are soft and stay passable. Cells come from the same seeded placement the trees
 * are drawn from, so the trunks stand where the trees do: fetched ahead from the world workers (`around`),
 * or placed on the spot (about 1.5 ms a cell) when a body gets to one first.
 */
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING, floraPlacement } from './flora';
import type { Terrain } from './terrain';
import { FetchedCells } from './fetchedCells';

/** Cell side (m), a multiple of NEAR_SPACING so cells share the drawn trees' candidate grid. */
export const TRUNK_CELL = 32;
const CELL = TRUNK_CELL;
/** Floats per tree in a cell: x, z, trunk radius, the tree's scale. */
export const TREE_STRIDE = 4;
/** A tree's height at scale 1 (m): the vegetation package's species are 11 to 18 m tall. */
export const TREE_TALL = 14;
/** Cells kept (the oldest are dropped): a few hundred metres of land around the player. */
const KEEP = 96;
/** The widest trunk there is (m, at the largest scale): how far beyond a cell a trunk can reach. */
const REACH = Math.max(...FLORA_KINDS.map((k) => k.trunk)) * 1.3;

export class Trunks {
  /** Per cell: x, z, radius and scale of each tree in it (TREE_STRIDE). */
  private readonly cells: FetchedCells;

  /** `fetch`: the flora of a square from the world workers (WorldJobs.flora); without it cells are placed here. */
  constructor(terrain: Terrain, fetch?: (x0: number, z0: number, size: number, spacing: number) => Promise<Float32Array>) {
    const place = (i: number, j: number) => trunksOf(floraPlacement(terrain, { seed: terrain.seed, setting: terrain.setting.id, x0: i * CELL, z0: j * CELL, size: CELL, spacing: NEAR_SPACING }));
    this.cells = new FetchedCells(CELL, KEEP, place, fetch && ((x0, z0, side) => fetch(x0, z0, side, NEAR_SPACING)), trunksOf);
  }

  /** Ask ahead for the cells around (x, z) (once a frame is fine: cells already there or asked for cost nothing). */
  around(x: number, z: number): void {
    this.cells.around(x, z, 2);
  }

  /** Drop the cells of the squares `touches` names (a road was laid through them): they are asked for again. */
  forgetOver(touches: (x0: number, z0: number, x1: number, z1: number) => boolean): void {
    this.cells.forgetOver(touches);
  }

  /** Does a body of radius `r` standing at (x, z) touch a trunk? */
  blocks(x: number, z: number, r: number): boolean {
    const m = r + REACH;
    const i0 = Math.floor((x - m) / CELL), i1 = Math.floor((x + m) / CELL);
    const j0 = Math.floor((z - m) / CELL), j1 = Math.floor((z + m) / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = this.cells.cellAt(i, j);
      for (let k = 0; k < c.length; k += TREE_STRIDE) {
        const dx = c[k] - x, dz = c[k + 1] - z, rr = c[k + 2] + r;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
    }
    return false;
  }

  /**
   * The trees of cell (i, j) (TREE_STRIDE floats each). With workers to ask: null until fetched (the cell
   * is asked for); without: placed here.
   */
  peek(i: number, j: number): Float32Array | null {
    return this.cells.peek(i, j);
  }
}

/** x, z, radius and scale of each tree among flora records (shrubs left out). */
function trunksOf(d: Float32Array): Float32Array {
  const out: number[] = [];
  for (let r = 0; r < d.length; r += FLORA_STRIDE) {
    const trunk = FLORA_KINDS[d[r + 5]].trunk;
    if (trunk > 0) out.push(d[r], d[r + 2], trunk * d[r + 3], d[r + 3]);
  }
  return Float32Array.from(out);
}
