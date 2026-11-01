/**
 * The dungeon as the hero knows it, for the minimap below ground (pure): the cells they have seen. A room is
 * known whole once stood in; the lantern shows a few cells round the hero along the ways that let through
 * (a hidden door stays a wall until found, so its way stays dark). Kept in the save with the cellar.
 */
import { DIRS } from '@futuremagic/dungeon';
import type { DungeonSpace } from '../world/dungeon/space';

/** Cells the lantern reaches along the ways from where the hero stands. */
export const LANTERN_CELLS = 3;

const cellKey = (i: number, j: number, l: number) => `${i},${j},${l}`;

/** The squares of floor the hero has seen, by "i,j,storey" (kept in the save; the minimap paints them). */
export class SeenCells {
  protected readonly cells = new Map<string, readonly [number, number, number]>();
  /** Grows by one each time a cell is added (the minimap paints again then). */
  version = 0;

  /** Has the hero seen cell (i, j) on storey l? */
  has(i: number, j: number, l: number): boolean {
    return this.cells.has(cellKey(i, j, l));
  }

  /** Every seen cell (i, j, storey). */
  seenCells(): IterableIterator<readonly [number, number, number]> {
    return this.cells.values();
  }

  /** For the save. */
  save(): string[] {
    return [...this.cells.keys()];
  }

  /** A saved record laid over a fresh one. */
  restore(keys: readonly string[]): void {
    for (const k of keys) {
      const [i, j, l] = k.split(',').map(Number);
      if (Number.isFinite(i) && Number.isFinite(j) && Number.isFinite(l)) this.note(i, j, l);
    }
  }

  /** Mark a cell seen (a built dungeon only marks cells it owns). */
  protected note(i: number, j: number, l: number): void {
    const k = cellKey(i, j, l);
    if (this.cells.has(k)) return;
    this.cells.set(k, [i, j, l]);
    this.version++;
  }
}

/** What the minimap and the save ask of what the hero has seen (a built dungeon's cells, or a formed cave's squares: game/formedMap.ts). */
export type Seen = Pick<SeenCells, 'has' | 'seenCells' | 'save' | 'restore' | 'version'> & { see(x: number, y: number, z: number): void };

export class DungeonSeen extends SeenCells {
  private readonly rooms = new Set<number>();
  private at = '';
  constructor(private readonly space: DungeonSpace) {
    super();
  }

  /** The hero stands at (x, y, z), in the dungeon's frame (feet). */
  see(x: number, y: number, z: number): void {
    const s = this.space, l = s.levelAt(y), [i, j] = s.cellAt(x, z), here = cellKey(i, j, l);
    if (here === this.at) return;
    this.at = here;
    const owner = s.own(i, j, l);
    if (owner === undefined) return;
    // A room stood in, whole; then the lantern, a few cells out along the ways that let through now.
    if (owner >= 0 && !this.rooms.has(owner)) { this.rooms.add(owner); this.spread(i, j, l, Infinity, owner); }
    this.spread(i, j, l, LANTERN_CELLS);
  }

  /** Marks cells seen outward from (i, j, l) through what lets one pass, `steps` cells at most, within `owner` if given. */
  private spread(i: number, j: number, l: number, steps: number, owner?: number): void {
    const s = this.space, near = new Set([cellKey(i, j, l)]);
    let front: [number, number, number][] = [[i, j, l]];
    this.note(i, j, l);
    for (let step = 0; step < steps && front.length; step++) {
      const next: [number, number, number][] = [];
      for (const [a, b, c] of front) for (let d = 0; d < 4; d++) {
        const lv = s.passLevel(a, b, c, d, 0);
        if (lv === null) continue;
        const na = a + DIRS[d][0], nb = b + DIRS[d][1], k = cellKey(na, nb, lv);
        if (near.has(k) || (owner !== undefined && s.own(na, nb, lv) !== owner)) continue;
        near.add(k);
        this.note(na, nb, lv);
        next.push([na, nb, lv]);
      }
      front = next;
    }
  }

  protected override note(i: number, j: number, l: number): void {
    if (this.space.own(i, j, l) === undefined) return;
    super.note(i, j, l);
  }
}
