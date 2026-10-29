/**
 * Square cells of placements round the camera, asked from the world worker as the camera moves (trees and
 * shrubs, rocks): the missing ones are asked for, those far behind forgotten, and those a change of the land
 * touches asked for again (the old placements stay until the new ones are back).
 */

export interface PlacedCell {
  readonly i: number;
  readonly j: number;
  pending: boolean;
  data: Float32Array | null;
  /** The land changed while it was being placed: asked for once more when it is back. */
  again?: boolean;
  /** Being placed anew after the land changed (for views that rebuild once all such cells are back). */
  anew?: boolean;
}

export interface CameraCellsHooks {
  /** A cell's placements arrived. */
  placed(cell: PlacedCell): void;
  /** A cell is to be placed anew (`placeAnew`), before it is asked for. */
  touched?(cell: PlacedCell): void;
}

export class CameraCells {
  readonly cells = new Map<string, PlacedCell>();

  /** `side`: cell side (m); `reach`: cells kept either way of the camera's; `fetch`: a cell's placements. */
  constructor(readonly side: number, readonly reach: number, private readonly fetch: (x0: number, z0: number, side: number) => Promise<Float32Array>, private readonly hooks: CameraCellsHooks) {}

  /** The camera's cell. */
  cellOf(x: number, z: number): [number, number] {
    return [Math.floor(x / this.side), Math.floor(z / this.side)];
  }

  /** Ask for the missing cells round (x, z); forget those well out of reach (kept a little, so walking back and forth costs nothing). */
  askAround(x: number, z: number, R = this.reach): void {
    const [ci, cj] = this.cellOf(x, z);
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const i = ci + di, j = cj + dj, key = `${i},${j}`;
      if (this.cells.has(key)) continue;
      const cell: PlacedCell = { i, j, pending: true, data: null };
      this.cells.set(key, cell);
      this.request(cell);
    }
    for (const [key, c] of this.cells) if (!c.pending && Math.max(Math.abs(c.i - ci), Math.abs(c.j - cj)) > R + 2) this.cells.delete(key);
  }

  /** Whether every cell asked for is here. */
  get allHere(): boolean {
    for (const c of this.cells.values()) if (!c.data) return false;
    return true;
  }

  /** Every cell whose square, grown by `pad` cells, `touches` names is placed anew. */
  placeAnew(touches: (x0: number, z0: number, x1: number, z1: number) => boolean, pad = 0): void {
    const s = this.side;
    for (const c of this.cells.values()) {
      if (!touches((c.i - pad) * s, (c.j - pad) * s, (c.i + 1 + pad) * s, (c.j + 1 + pad) * s)) continue;
      this.hooks.touched?.(c);
      if (c.pending) c.again = true;
      else this.request(c);
    }
  }

  private request(cell: PlacedCell): void {
    cell.pending = true;
    void this.fetch(cell.i * this.side, cell.j * this.side, this.side).then((d) => {
      if (cell.again) { cell.again = false; this.request(cell); return; }
      cell.data = d;
      cell.pending = false;
      this.hooks.placed(cell);
    });
  }
}
