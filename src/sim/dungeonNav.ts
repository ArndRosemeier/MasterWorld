/**
 * Where creatures can walk in a dungeon (plan 9.3: navigation over dungeon graphs): the cells of its
 * space (world/dungeon/space.ts) as nodes, joined where the walls let one through now (a locked door
 * stops them too, a found secret door does not). A tall room is walked on its floor; a drop goes down and
 * never up. Paths keep only where each room is entered and left, since a room is open floor. Pure.
 */
import { DIRS } from '@futuremagic/dungeon';
import { CELL, STOREY } from '../world/dungeon/cellar';
import { stairDrop, type DungeonSpace } from '../world/dungeon/space';

/** A cell to stand in: i, j and the storey of its floor. */
export interface NavCell { readonly i: number; readonly j: number; readonly l: number }

const key = (c: NavCell) => `${c.i},${c.j},${c.l}`;

export class DungeonNav {
  constructor(readonly space: DungeonSpace) {}

  /** The standing cell of (i, j) on storey l: a room's floor, a stair's top, a passage itself. */
  cell(i: number, j: number, l: number): NavCell | null {
    const g = this.space.grid, o = g.owner(i, j, l);
    if (o === undefined) return null;
    if (o >= 0) return { i, j, l: this.space.layout.rooms[o].level };
    const st = g.stairs.get(`${i},${j},${l}`);
    return { i, j, l: st ? st.level : l };
  }

  /** The cell under a point of the dungeon's frame (feet height `y`). */
  at(x: number, y: number, z: number): NavCell | null {
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    return this.cell(i, j, this.space.levelAt(y)) ?? this.cell(i, j, this.space.levelAt(y) - 1);
  }

  /** Room id of a cell, or −1 in a passage. */
  roomOf(c: NavCell): number {
    const o = this.space.grid.owner(c.i, c.j, c.l);
    return o !== undefined && o >= 0 ? o : -1;
  }

  neighbours(c: NavCell): NavCell[] {
    const out: NavCell[] = [];
    for (let k = 0; k < 4; k++) {
      const lv = this.space.passLevel(c.i, c.j, c.l, k, 0);
      if (lv === null) continue;
      // The neighbour on the storey one passes on (a stair spans two); a tall room is stood in on its floor.
      const n = this.cell(c.i + DIRS[k][0], c.j + DIRS[k][1], lv);
      if (n) out.push(n);
    }
    return out;
  }

  /** Middle of a cell, on its floor (the dungeon's frame). */
  centre(c: NavCell): { x: number; y: number; z: number } {
    const x = (c.i + 0.5) * CELL, z = (c.j + 0.5) * CELL;
    // A stair's floor from its own steps (another way may pass over its foot).
    const st = this.space.grid.stairs.get(`${c.i},${c.j},${c.l - 1}`);
    if (st && st.level === c.l && st.x === c.i && st.z === c.j) return { x, y: c.l * STOREY - stairDrop(st, x, z), z };
    return { x, y: this.space.floorAt(x, z, c.l * STOREY + 1) ?? c.l * STOREY, z };
  }

  /** Steps from `from` to every cell reachable within `limit` steps (breadth first). */
  distances(from: NavCell, limit = 200): Map<string, { cell: NavCell; d: number; prev: string | null }> {
    const seen = new Map<string, { cell: NavCell; d: number; prev: string | null }>([[key(from), { cell: from, d: 0, prev: null }]]);
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q], d = seen.get(key(c))!.d;
      if (d >= limit) continue;
      for (const n of this.neighbours(c)) {
        const k = key(n);
        if (seen.has(k)) continue;
        seen.set(k, { cell: n, d: d + 1, prev: key(c) });
        queue.push(n);
      }
    }
    return seen;
  }

  /**
   * A walk from `from` to `to` as points (x, y, z; the dungeon's frame), the start left out; empty if
   * there is no way. Inside a room only the cells where it is entered and left are kept: the floor between is open.
   */
  way(from: NavCell, to: NavCell, limit = 200): { x: number; y: number; z: number }[] {
    const seen = this.distances(from, limit);
    let at = seen.get(key(to));
    if (!at) return [];
    const cells: NavCell[] = [];
    while (at && at.prev !== null) { cells.push(at.cell); at = seen.get(at.prev); }
    cells.reverse();
    const out: NavCell[] = [];
    for (let k = 0; k < cells.length; k++) {
      const r = this.roomOf(cells[k]);
      // Keep where a room is entered (straight in through its door) and where it is left.
      const before = k > 0 ? this.roomOf(cells[k - 1]) : this.roomOf(from);
      if (r >= 0 && k + 1 < cells.length && this.roomOf(cells[k + 1]) === r && before === r) continue;
      out.push(cells[k]);
    }
    return out.map((c) => this.centre(c));
  }

  /** Can a body of radius `r` stand at (x, y, z): inside the dungeon and clear of its walls? */
  free(x: number, y: number, z: number, r: number): boolean {
    return this.at(x, y + 0.5, z) !== null && this.space.sdf(x, y + 1, z) > r * 0.6;
  }

  /**
   * Move a body from (x, z) by (dx, dz), sliding along a wall it would cut into; where it ends up, or
   * null when it cannot move at all.
   */
  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null {
    if (this.free(x + dx, y, z + dz, r)) return { x: x + dx, z: z + dz };
    if (Math.abs(dx) > 1e-4 && this.free(x + dx, y, z, r)) return { x: x + dx, z };
    if (Math.abs(dz) > 1e-4 && this.free(x, y, z + dz, r)) return { x, z: z + dz };
    return null;
  }

  /** Is there a clear line between two points at the height `eye` above each (walls, closed doors)? */
  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, eye = 1.2): boolean {
    const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(d / 0.4);
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (this.space.sdf(ax + (bx - ax) * t, ay + eye + (by - ay) * t, az + (bz - az) * t) < 0.02) return false;
    }
    return true;
  }
}

export const navKey = key;
