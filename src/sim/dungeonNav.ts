/**
 * Where creatures can walk in a dungeon (plan 9.3: navigation over dungeon graphs): the cells of its
 * space (world/dungeon/space.ts) as nodes, joined where the walls let one through now (a locked door
 * stops them too, a found secret door does not). A tall room is walked on its floor; a drop goes down and
 * never up. Paths keep only where each room is entered and left, since a room is open floor. Pure.
 */
import { DIRS } from '@futuremagic/dungeon';
import { stairDrop, type DungeonSpace } from '../world/dungeon/space';

/** A cell to stand in: i, j and the storey of its floor. */
export interface NavCell { readonly i: number; readonly j: number; readonly l: number }

const key = (c: NavCell) => `${c.i},${c.j},${c.l}`;

export class DungeonNav {
  constructor(readonly space: DungeonSpace) {}

  /** The standing cell of (i, j) on storey l: a room's floor, a stair's top, a passage itself. */
  cell(i: number, j: number, l: number): NavCell | null {
    const g = this.space.grid, o = this.space.own(i, j, l);
    if (o === undefined) return null;
    if (o >= 0) return { i, j, l: this.space.layout.rooms[o].level };
    const st = g.stairs.get(`${i},${j},${l}`);
    return { i, j, l: st ? st.level : l };
  }

  /** The cell under a point of the dungeon's frame (feet height `y`). */
  at(x: number, y: number, z: number): NavCell | null {
    const [i, j] = this.space.cellAt(x, z);
    return this.cell(i, j, this.space.levelAt(y)) ?? this.cell(i, j, this.space.levelAt(y) - 1);
  }

  /** Room id of a cell, or −1 in a passage. */
  roomOf(c: NavCell): number {
    const o = this.space.own(c.i, c.j, c.l);
    return o !== undefined && o >= 0 ? o : -1;
  }

  /** `hands`: it lifts a bar from the bar's side (space.passLevel's `unbars`); without, every door not open is shut. */
  neighbours(c: NavCell, hands = true): NavCell[] {
    const out: NavCell[] = [];
    for (let k = 0; k < 4; k++) {
      const lv = this.space.passLevel(c.i, c.j, c.l, k, 0, hands);
      if (lv === null) continue;
      // The neighbour on the storey one passes on (a stair spans two); a tall room is stood in on its floor.
      const n = this.cell(c.i + DIRS[k][0], c.j + DIRS[k][1], lv);
      if (n) out.push(n);
    }
    return out;
  }

  /** Middle of a cell, on its floor (the dungeon's frame). */
  centre(c: NavCell): { x: number; y: number; z: number } {
    const S = this.space.scale, x = (c.i + 0.5) * S.cell, z = (c.j + 0.5) * S.cell;
    // A stair's floor from its own steps (another way may pass over its foot).
    const st = this.space.grid.stairs.get(`${c.i},${c.j},${c.l - 1}`);
    if (st && st.level === c.l && st.x === c.i && st.z === c.j) return { x, y: c.l * S.storey - stairDrop(st, x, z, S), z };
    return { x, y: this.space.floorAt(x, z, c.l * S.storey + 1) ?? c.l * S.storey, z };
  }

  /** Steps from `from` to every cell reachable within `limit` steps (breadth first). */
  distances(from: NavCell, limit = 200, hands = true): Map<string, { cell: NavCell; d: number; prev: string | null }> {
    const seen = new Map<string, { cell: NavCell; d: number; prev: string | null }>([[key(from), { cell: from, d: 0, prev: null }]]);
    const queue = [from];
    for (let q = 0; q < queue.length; q++) {
      const c = queue[q], d = seen.get(key(c))!.d;
      if (d >= limit) continue;
      for (const n of this.neighbours(c, hands)) {
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
  way(from: NavCell, to: NavCell, limit = 200, hands = true): { x: number; y: number; z: number }[] {
    const seen = this.distances(from, limit, hands);
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

  /**
   * Can a body of radius `r` stand at (x, y, z): inside the dungeon and clear of its walls? A door not yet open
   * keeps it a whole body off (no shoulder or blade through a shut leaf): one stood nearer may only step back.
   * `from`: where it stands now.
   */
  free(x: number, y: number, z: number, r: number, from?: { readonly x: number; readonly z: number }): boolean {
    if (this.at(x, y + 0.5, z) === null || this.space.sdf(x, y + 1, z) <= r * 0.6) return false;
    const door = this.space.shut(x, y + 1, z, false);
    return door > r + DOOR_GAP || (!!from && door >= this.space.shut(from.x, y + 1, from.z, false));
  }

  /**
   * Move a body from (x, z) by (dx, dz), sliding along a wall it would cut into; where it ends up, or
   * null when it cannot move at all.
   */
  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null {
    const from = { x, z };
    if (this.free(x + dx, y, z + dz, r, from)) return { x: x + dx, z: z + dz };
    if (Math.abs(dx) > 1e-4 && this.free(x + dx, y, z, r, from)) return { x: x + dx, z };
    if (Math.abs(dz) > 1e-4 && this.free(x, y, z + dz, r, from)) return { x, z: z + dz };
    return null;
  }

  /**
   * Is there a clear line between two points at the height `eye` above each (walls, doors not yet open)? The
   * walls between cells have no thickness, so besides the distance (floors, ceilings, corners) every cell side the
   * line crosses must let one through.
   */
  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, eye = 1.2): boolean {
    const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(d / 0.4);
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (this.space.sdf(ax + (bx - ax) * t, ay + eye + (by - ay) * t, az + (bz - az) * t) < 0.02) return false;
    }
    const S = this.space, C = S.scale.cell, m = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (C * 0.2)));
    let [i, j] = S.cellAt(ax, az);
    for (let s = 1; s <= m; s++) {
      const t = s / m, x = ax + (bx - ax) * t, z = az + (bz - az) * t, [ni, nj] = S.cellAt(x, z);
      if (ni === i && nj === j) continue;
      // The storey of the feet where it crosses (just under a floor: the cell below, as `at`).
      const y = ay + (by - ay) * t, l0 = S.levelAt(y + 0.3), l = S.own(i, j, l0) === undefined ? l0 - 1 : l0;
      const cross = (ci: number, cj: number, k: number): boolean => {
        // Where the line crosses that side, as metres along it from its middle.
        const side = k === 0 ? (ci + 1) * C : k === 2 ? ci * C : k === 1 ? (cj + 1) * C : cj * C;
        const u = k % 2 === 0 ? (side - ax) / (bx - ax) : (side - az) / (bz - az);
        const lat = k % 2 === 0 ? az + (bz - az) * u - (cj + 0.5) * C : ax + (bx - ax) * u - (ci + 0.5) * C;
        return S.passLevel(ci, cj, l, k, lat, false) !== null;
      };
      const kx = ni > i ? 0 : ni < i ? 2 : -1, kz = nj > j ? 1 : nj < j ? 3 : -1;
      const ok = kx >= 0 && kz >= 0
        ? (cross(i, j, kx) && cross(ni, j, kz)) || (cross(i, j, kz) && cross(i, nj, kx))
        : cross(i, j, kx >= 0 ? kx : kz);
      if (!ok) return false;
      i = ni; j = nj;
    }
    return true;
  }
}

export const navKey = key;

/** A body keeps this much farther off a shut door than its radius, metres (the leaf's thickness and some air). */
const DOOR_GAP = 0.08;

/** A point in a den's frame. */
export interface P3 { readonly x: number; readonly y: number; readonly z: number }

/**
 * Where a den's creatures live and walk (sim/creatures.ts): a dungeon's rooms, or open land outside
 * (sim/wild.ts). Homes are numbered (a room, a territory). Positions are the den's own frame.
 */
export interface DenGround {
  /** A free point in home `home` to stand on. */
  spot(home: number, rng: { range(a: number, b: number): number }): P3;
  /** The floor under (x, z) near height y, or null. */
  floorAt(x: number, z: number, y: number): number | null;
  /** Free room around a point (metres; negative inside a wall). */
  clearance(x: number, y: number, z: number): number;
  /** Is there a clear line between two points at the height `eye` above each? */
  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, eye?: number): boolean;
  /** The way from one point to another as points, the start left out (empty: no way). `hands`: it can lift a bar. */
  way(from: P3, to: P3, hands?: boolean): P3[];
  /** Move a body by (dx, dz), sliding along what is in the way; null if it cannot move at all. */
  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null;
  /** A way off from `from`, as far from `q` as it goes (empty: nowhere). */
  away(from: P3, q: P3, hands?: boolean): P3[];
  /** A body with hands at `at` walking on to `to`: the barred doors it unbars on its way (their links; none: grounds without doors). */
  unbar?(at: P3, to: P3): number[];
  /** Where a body stuck at `from` may hop to, nearer `toward` (null: nowhere; grounds without it never hop). */
  hop?(from: P3, toward: P3 | null, r: number): P3 | null;
  /** Its bodies swim (the sea, S9): their height follows the water every step, standing still too. */
  readonly afloat?: boolean;
  /** Where a dead body at (x, z), now at `y`, floats next (null or none: it lies where it fell). */
  floatAt?(x: number, z: number, y: number): number | null;
}

/** A dungeon as a den's ground: its rooms are the homes. */
export class DungeonGround implements DenGround {
  readonly nav: DungeonNav;

  constructor(readonly space: DungeonSpace) {
    this.nav = new DungeonNav(space);
  }

  spot(room: number, rng: { range(a: number, b: number): number }): P3 {
    const r = this.space.layout.rooms[room], S = this.space.scale;
    const x = (r.x + rng.range(0.25, r.w - 0.25)) * S.cell, z = (r.z + rng.range(0.25, r.d - 0.25)) * S.cell;
    return { x, y: this.space.floorAt(x, z, r.level * S.storey + 1) ?? r.level * S.storey, z };
  }

  floorAt(x: number, z: number, y: number): number | null { return this.space.floorAt(x, z, y); }

  clearance(x: number, y: number, z: number): number { return this.space.sdf(x, y + 0.5, z); }

  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, eye = 1.2): boolean { return this.nav.sees(ax, ay, az, bx, by, bz, eye); }

  way(from: P3, to: P3, hands = true): P3[] {
    const a = this.nav.at(from.x, from.y + 0.3, from.z), b = this.nav.at(to.x, to.y + 0.3, to.z);
    if (!a || !b) return [];
    const way = this.nav.way(a, b, 60, hands);
    if (!way.length) return this.nav.roomOf(a) === this.nav.roomOf(b) && this.nav.roomOf(a) >= 0 ? [to] : [];
    // The last step straight to the point itself, through the middle of the way into its cell (a doorway), never
    // cutting past the door's post towards a point that stands beside it.
    const last = way[way.length - 1], before = way.length > 1 ? way[way.length - 2] : this.nav.centre(a);
    const C = this.space.scale.cell, step = Math.abs(last.x - before.x) + Math.abs(last.z - before.z);
    const door = Math.abs(step - C) < 0.01 && this.space.ownerAt(last.x, last.y + 0.3, last.z) !== this.space.ownerAt(before.x, before.y + 0.3, before.z);
    return [...way.slice(0, -1), ...(door ? [{ x: (last.x + before.x) / 2, y: last.y, z: (last.z + before.z) / 2 }] : []), to];
  }

  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null { return this.nav.slide(x, y, z, dx, dz, r); }

  /** The reachable cell that is farthest from `q`, within a few rooms. */
  away(from: P3, q: P3, hands = true): P3[] {
    const a = this.nav.at(from.x, from.y + 0.3, from.z);
    if (!a) return [];
    let best: NavCell | null = null, score = -Infinity;
    for (const { cell, d } of this.nav.distances(a, 24, hands).values()) {
      const p = this.nav.centre(cell), far = Math.hypot(p.x - q.x, p.z - q.z) - d * 0.3;
      if (far > score) { score = far; best = cell; }
    }
    return best ? this.nav.way(a, best, 24, hands) : [];
  }

  unbar(at: P3, to: P3): number[] { return this.space.unbar(at.x, at.y + 0.3, at.z, to); }
}
