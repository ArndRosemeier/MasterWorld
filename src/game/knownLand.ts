/**
 * The land the hero knows (plan 11.7, D35): what the map may show. It fills in two ways. **Walked in**:
 * the land round the hero as they travel is seen, and the map inks it. **Told in**: when someone marks a
 * place, they sketch the way there and a patch of land round the mark, drawn fainter than land seen with
 * one's own eyes. Nothing else adds to it: a hamlet never passed and a road never taken stay blank. Plain
 * data, saved with the game. Pure.
 */

/** Metres per side of one cell of knowledge. */
export const CELL = 32;
/** How far round the hero the land is seen, metres. */
export const SIGHT = 180;
/** What a new hero knows: the land round the town where the game begins, metres. */
export const HOME_SIGHT = 320;
/** A teller's sketch: half the width of the way, the patch round the mark, metres. */
export const WAY_HALF = 48;
export const PATCH = 128;
/** A place closer than this to where the hero stood when told needs no sketched way. */
export const NEAR_WAY = 200;

/** How a cell is known: told of (sketched in), or seen. */
export const TOLD = 1;
export const SEEN = 2;

/** A way someone sketched on the map: from where the hero stood to the mark. */
export interface SketchedWay {
  /** The lead it belongs to (the map draws it while the lead is open). */
  readonly id: string;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
}

export interface KnownLandSave {
  /** Cells as flat pairs (i, j, i, j, …). */
  readonly seen: readonly number[];
  readonly told: readonly number[];
  readonly ways: readonly SketchedWay[];
  /** Leads already sketched in. */
  readonly sketched: readonly string[];
}

const OFF = 1048576;
const cellKeyOf = (i: number, j: number): number => (i + OFF) * 2097152 + (j + OFF);
const iOf = (k: number): number => Math.floor(k / 2097152) - OFF;
const jOf = (k: number): number => (k % 2097152) - OFF;

export class KnownLand {
  private readonly cells = new Map<number, number>();
  private readonly ways: SketchedWay[] = [];
  private readonly sketched = new Set<string>();
  /** Grows by one whenever a cell becomes known or better known (the map repaints its mask then). */
  version = 0;

  constructor(saved?: KnownLandSave) {
    if (!saved) return;
    for (let k = 0; k + 1 < saved.told.length; k += 2) this.cells.set(cellKeyOf(saved.told[k], saved.told[k + 1]), TOLD);
    for (let k = 0; k + 1 < saved.seen.length; k += 2) this.cells.set(cellKeyOf(saved.seen[k], saved.seen[k + 1]), SEEN);
    this.ways.push(...saved.ways);
    for (const id of saved.sketched) this.sketched.add(id);
  }

  /** How the cell (i, j) is known: 0 not at all, TOLD, SEEN. */
  level(i: number, j: number): number { return this.cells.get(cellKeyOf(i, j)) ?? 0; }

  /** How the point (x, z) is known. */
  at(x: number, z: number): number { return this.level(Math.floor(x / CELL), Math.floor(z / CELL)); }

  /** The hero sees the land within `r` of (x, z). Whether anything new became known. */
  see(x: number, z: number, r = SIGHT): boolean {
    return this.disc(x, z, r, SEEN);
  }

  /**
   * Someone marks `id` at `to` while the hero stands at `from`: the patch round the mark and, for a place
   * farther than NEAR_WAY, the way there are sketched in. Once per lead: false when it was already sketched.
   */
  tell(id: string, from: readonly [number, number], to: readonly [number, number]): boolean {
    if (this.sketched.has(id)) return false;
    this.sketched.add(id);
    this.disc(to[0], to[1], PATCH, TOLD);
    const dx = to[0] - from[0], dz = to[1] - from[1], len = Math.hypot(dx, dz);
    if (len <= NEAR_WAY) return true;
    this.ways.push({ id, from: [from[0], from[1]], to: [to[0], to[1]] });
    // The way: discs along it, one cell apart, as wide as WAY_HALF.
    const n = Math.ceil(len / CELL);
    for (let k = 0; k <= n; k++) this.disc(from[0] + (dx * k) / n, from[1] + (dz * k) / n, WAY_HALF, TOLD);
    return true;
  }

  /** Whether lead `id` was sketched in already. */
  told(id: string): boolean { return this.sketched.has(id); }

  /** The ways sketched for the leads in `open`. */
  waysOf(open: ReadonlySet<string>): SketchedWay[] { return this.ways.filter((w) => open.has(w.id)); }

  /** Every known cell, with how it is known. */
  eachCell(fn: (i: number, j: number, level: number) => void): void {
    for (const [k, v] of this.cells) fn(iOf(k), jOf(k), v);
  }

  /** The cells' bounds (inclusive), or null when nothing is known. */
  bounds(): { i0: number; j0: number; i1: number; j1: number } | null {
    if (!this.cells.size) return null;
    let i0 = Infinity, j0 = Infinity, i1 = -Infinity, j1 = -Infinity;
    for (const k of this.cells.keys()) {
      const i = iOf(k), j = jOf(k);
      if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j;
    }
    return { i0, j0, i1, j1 };
  }

  get cellCount(): number { return this.cells.size; }

  landSave(): KnownLandSave {
    const seen: number[] = [], told: number[] = [];
    for (const [k, v] of this.cells) (v === SEEN ? seen : told).push(iOf(k), jOf(k));
    return { seen, told, ways: this.ways.map((w) => ({ ...w })), sketched: [...this.sketched] };
  }

  /** Every cell whose centre lies within `r` of (x, z) becomes known at least as `level`. */
  private disc(x: number, z: number, r: number, level: number): boolean {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    let grew = false;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const cx = (i + 0.5) * CELL - x, cz = (j + 0.5) * CELL - z;
      if (cx * cx + cz * cz > r * r) continue;
      const k = cellKeyOf(i, j);
      if ((this.cells.get(k) ?? 0) >= level) continue;
      this.cells.set(k, level);
      grew = true;
    }
    if (grew) this.version++;
    return grew;
  }
}
