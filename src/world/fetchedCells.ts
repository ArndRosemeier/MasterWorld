/**
 * Square cells of obstacles round a body (tree trunks, rocks), kept a while: fetched ahead from the world
 * workers (`around`), or placed on the spot when a body gets to one first. A change of the land drops the cells
 * it touches (`forgetOver`); an answer asked for before the change is dropped too (it was placed on the old land).
 *
 * Pure: the placing and the fetching are the caller's.
 */
export class FetchedCells {
  private readonly cells = new Map<number, Float32Array>();
  private readonly asked = new Set<number>();
  /** Counts `forgetOver`s. */
  private epoch = 0;

  /**
   * `side`: cell side (m); `keep`: cells kept (the oldest dropped); `place`: a cell's obstacles, worked out here;
   * `fetch`: the same from the workers (raw placements, turned into obstacles by `convert`).
   */
  constructor(
    readonly side: number,
    private readonly keepMost: number,
    private readonly place: (i: number, j: number) => Float32Array,
    private readonly fetch?: (x0: number, z0: number, side: number) => Promise<Float32Array>,
    private readonly convert: (d: Float32Array) => Float32Array = (d) => d,
  ) {}

  /** Ask ahead for the cells within `reach` cells of (x, z)'s (once a frame is fine: those here or asked for cost nothing). */
  around(x: number, z: number, reach: number): void {
    if (!this.fetch) return;
    const ci = Math.floor(x / this.side), cj = Math.floor(z / this.side);
    for (let j = cj - reach; j <= cj + reach; j++) for (let i = ci - reach; i <= ci + reach; i++) this.ask(i, j);
  }

  /** Drop the cells whose square, grown by `pad` cells, `touches` names: asked for again when next needed. */
  forgetOver(touches: (x0: number, z0: number, x1: number, z1: number) => boolean, pad = 0): void {
    this.epoch++;
    const s = this.side;
    for (const key of [...this.cells.keys()]) {
      const i = Math.floor(key / 65536) - 32768, j = (key % 65536) - 32768;
      if (touches((i - pad) * s, (j - pad) * s, (i + 1 + pad) * s, (j + 1 + pad) * s)) this.cells.delete(key);
    }
  }

  /** Cell (i, j): here, or placed on the spot. */
  cellAt(i: number, j: number): Float32Array {
    const key = keyOf(i, j);
    return this.cells.get(key) ?? this.keep(key, this.place(i, j));
  }

  /** Cell (i, j) if here; with workers to ask, null until fetched (it is asked for); without, placed here. */
  peek(i: number, j: number): Float32Array | null {
    if (!this.fetch) return this.cellAt(i, j);
    const c = this.cells.get(keyOf(i, j));
    if (!c) this.ask(i, j);
    return c ?? null;
  }

  private ask(i: number, j: number): void {
    const key = keyOf(i, j);
    if (!this.fetch || this.cells.has(key) || this.asked.has(key)) return;
    this.asked.add(key);
    const e = this.epoch;
    void this.fetch(i * this.side, j * this.side, this.side).then((d) => {
      this.asked.delete(key);
      if (e === this.epoch && !this.cells.has(key)) this.keep(key, this.convert(d));
    });
  }

  private keep(key: number, c: Float32Array): Float32Array {
    if (this.cells.size >= this.keepMost) this.cells.delete(this.cells.keys().next().value as number);
    this.cells.set(key, c);
    return c;
  }
}

/** Cell indices stay well inside ±2^15 (a world of ±1000 km at the smallest cells), so one number is the key. */
const keyOf = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
