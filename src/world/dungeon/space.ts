/**
 * A dungeon as space to walk in (pure): which cells are open, where floors and ceilings are, which walls
 * have openings, and the state of its doors (a locked door opens with its key, a barred one from its far
 * side, a hidden one once found). The walker reads it as a signed distance (positive in air), the same
 * way it reads rock volumes, so walls, floors, ceilings, stairs and ledges all just work.
 *
 * Coordinates: metres in the dungeon's own frame (cell (i, j) spans x = i·CELL .. (i+1)·CELL).
 */
import { DIRS, LayoutGrid, type Door, type PathCell, type PlacedLink } from '@futuremagic/dungeon';
import { smin } from '@futuremagic/core';
import type { DungeonScale } from '../../setting/contract';
import { BUILT, DOOR_W, type ScaledLayout } from './cellar';

/** Clear height of a built dungeon's passages (rooms reach their storey's full height). */
export const PASSAGE_H = BUILT.passage;
export { DOOR_W };

export interface SpaceEvent {
  readonly kind: 'key' | 'unlocked' | 'unbarred' | 'found';
  readonly link: number;
}

/** A key is picked up within this of where it lies (m, across the floor). */
export const KEY_REACH = 1.3;

/** Where room `room`'s key lies: on the floor in its middle (x, y, z; dungeon frame). */
export function keySpot(layout: ScaledLayout, room: number): [number, number, number] {
  const r = layout.rooms[room], { cell, storey } = layout.scale;
  return [(r.x + r.w / 2) * cell, r.level * storey, (r.z + r.d / 2) * cell];
}

/** No owner, in the flat array of owners. */
const NONE = 0x7fffffff;

interface Opening { readonly pl: PlacedLink; readonly door: Door; readonly end: 0 | 1 }

const ekey = (x: number, z: number, l: number, dir: number) => {
  // One key per edge, whichever side it is named from.
  if (dir >= 2) { x += DIRS[dir][0]; z += DIRS[dir][1]; dir -= 2; }
  return `${x},${z},${l},${dir}`;
};

export class DungeonSpace {
  readonly grid: LayoutGrid;
  /** Its grid in metres (the layout's). */
  readonly scale: DungeonScale;
  private readonly openings = new Map<string, Opening>();
  /** Links whose door is open (unlocked, unbarred, found). */
  readonly open = new Set<number>();
  /** Rooms whose key has been picked up. */
  readonly keys = new Set<number>();
  private readonly search = new Map<number, number>();

  /**
   * `carve`: the space as rock is carved from it (world/dungeon/caveRock.ts): every way stands open (doors
   * are drawn as pieces of their own) but a fall of rubble, and the whole side of a cell opens, not just a doorway.
   */
  /** The grid's owners in a flat array over its bounds (a string-keyed map is slow for a big cave's every sample). */
  private readonly owners: Int32Array;
  private readonly box: readonly [i0: number, j0: number, l0: number, ni: number, nj: number, nl: number];

  constructor(readonly layout: ScaledLayout, private readonly carve = false) {
    this.grid = new LayoutGrid(layout);
    this.scale = layout.scale;
    let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity, l0 = Infinity, l1 = -Infinity;
    const cells = [...this.grid.cells].map(([k, o]) => [...k.split(',').map(Number), o]);
    for (const [i, j, l] of cells) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); l0 = Math.min(l0, l); l1 = Math.max(l1, l); }
    if (!cells.length) i0 = j0 = l0 = i1 = j1 = l1 = 0;
    this.box = [i0, j0, l0, i1 - i0 + 1, j1 - j0 + 1, l1 - l0 + 1];
    this.owners = new Int32Array(this.box[3] * this.box[4] * this.box[5]).fill(NONE);
    for (const [i, j, l, o] of cells) this.owners[(i - i0) + this.box[3] * ((j - j0) + this.box[4] * (l - l0))] = o;
    for (const pl of layout.links) pl.doors.forEach((door, end) => {
      const k = ekey(door.x, door.z, door.level, door.dir);
      // An empty path has one door: keep it once.
      if (!this.openings.has(k)) this.openings.set(k, { pl, door, end: end as 0 | 1 });
    });
  }

  /** Who owns cell (i, j) on storey l: a room id, −1 − a passage's link index, or none. */
  own(i: number, j: number, l: number): number | undefined {
    const [i0, j0, l0, ni, nj, nl] = this.box, a = i - i0, b = j - j0, c = l - l0;
    if (a < 0 || b < 0 || c < 0 || a >= ni || b >= nj || c >= nl) return undefined;
    const o = this.owners[a + ni * (b + nj * c)];
    return o === NONE ? undefined : o;
  }

  /** The grid cell (i, j) a point of the floor plan lies in. */
  cellAt(x: number, z: number): [number, number] {
    return [Math.floor(x / this.scale.cell), Math.floor(z / this.scale.cell)];
  }

  /** Who owns the cell a point lies in (a room id, −1 − a passage's link index), if any. */
  ownerAt(x: number, y: number, z: number): number | undefined {
    const [i, j] = this.cellAt(x, z);
    return this.own(i, j, this.levelAt(y));
  }

  /** Storey a point is on (feet height). */
  levelAt(y: number): number {
    return Math.floor((y + 0.4) / this.scale.storey);
  }

  private cellInfo(i: number, j: number, l: number): { floor: (x: number, z: number) => number; ceil: number; owner: number } | null {
    const owner = this.own(i, j, l);
    if (owner === undefined) return null;
    const S = this.scale;
    if (owner >= 0) {
      const r = this.layout.rooms[owner];
      return { owner, floor: () => r.level * S.storey, ceil: (r.level + r.height) * S.storey };
    }
    const st = this.grid.stairs.get(`${i},${j},${l}`);
    if (st) {
      const top = st.level * S.storey;
      return { owner, ceil: top + S.passage, floor: (x, z) => top - stairDrop(st, x, z, S) };
    }
    return { owner, floor: () => l * S.storey, ceil: l * S.storey + S.passage };
  }

  /** The opening in the wall on side `dir` of cell (i, j, l), if any (the door, and whether it lets through now). */
  opening(i: number, j: number, l: number, dir: number): Opening | undefined {
    return this.openings.get(ekey(i, j, l, dir));
  }

  /** Can one pass from cell (i, j, l) to its neighbour on side `dir`, at `lateral` metres from the edge's middle? */
  passable(i: number, j: number, l: number, dir: number, lateral: number): boolean {
    return this.passLevel(i, j, l, dir, lateral) !== null;
  }

  /** The storey on which one passes from cell (i, j, l) to its neighbour on side `dir` (a stair spans two), or null. */
  passLevel(i: number, j: number, l: number, dir: number, lateral: number): number | null {
    const a = this.own(i, j, l);
    if (a === undefined) return null;
    const ni = i + DIRS[dir][0], nj = j + DIRS[dir][1];
    // A stair cell spans two storeys: its walls open on either.
    const st = this.grid.stairs.get(`${i},${j},${l}`);
    const levels = st ? [st.level, st.level - 1] : [l];
    for (const lv of levels) {
      const b = this.own(ni, nj, lv), here = this.own(i, j, lv);
      if (b === undefined || here === undefined) continue;
      // Within a passage: only where its floors meet (not off the side of its own stair onto its way above or below).
      if (b === here) { if (b >= 0 || this.floorsMeet(i, j, ni, nj, lv, dir)) return lv; continue; }
      const o = this.opening(i, j, lv, dir);
      if (o && (this.carve || Math.abs(lateral) < DOOR_W / 2) && this.lets(o, here)) return lv;
    }
    return null;
  }

  /** Do the floors of two neighbouring cells of a passage meet at their shared edge (a step's height at most)? */
  floorsMeet(i: number, j: number, ni: number, nj: number, lv: number, dir: number): boolean {
    const a = this.cellInfo(i, j, lv), b = this.cellInfo(ni, nj, lv);
    if (!a || !b) return false;
    const C = this.scale.cell, x = (i + 0.5 + DIRS[dir][0] * 0.5) * C, z = (j + 0.5 + DIRS[dir][1] * 0.5) * C;
    return Math.abs(a.floor(x, z) - b.floor(x, z)) < 0.5;
  }

  /** Does the door let one through from the side owned by `from`? A passage's kind sits at its `b` end; its `a` end is an open arch. */
  private lets(o: Opening, from: number): boolean {
    const l = o.pl.link;
    if (!isFeature(o)) return true;
    if (this.carve) return l.kind !== 'blocked';
    switch (l.kind) {
      case 'open': case 'door': case 'drop': return true;
      case 'grate': case 'blocked': return false;
      default: return this.open.has(l.id) || (l.kind === 'oneway' && this.onSide(o, from, 'a'));
    }
  }

  /** Is `owner` (a room id, or −1 − link index) on the `side` end of the opening's link? */
  private onSide(o: Opening, owner: number, side: 'a' | 'b'): boolean {
    const l = o.pl.link, idx = -1 - this.layout.links.indexOf(o.pl);
    if (owner === idx) return side === 'a' ? o.end === 1 : o.end === 0;
    return owner === (side === 'a' ? l.a : l.b);
  }

  /**
   * Signed distance to solid at a point (positive in air): floor, ceiling and the closed walls of its
   * cell. Not exact, but never larger than the true distance, which is all the walker and camera need.
   */
  sdf(x: number, y: number, z: number): number {
    const p = this.parts(x, y, z);
    return Math.min(p.floor, p.ceil, p.walls);
  }

  /**
   * The distance's parts: to the floor below, to the ceiling above and to the closed walls of the cell (up
   * to `reach` metres; walls farther than that are not looked for). With `round`, walls meeting in a corner
   * blend over that many metres (carved rock), else the nearest wins. Outside the space all are −0.1.
   */
  parts(x: number, y: number, z: number, reach = Infinity, round = 0): { floor: number; ceil: number; walls: number } {
    const l = this.levelAt(y), CELL = this.scale.cell;
    const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    let c = this.cellInfo(i, j, l);
    // Just under a floor: the cell below may be air (a ledge, a tall room).
    if (!c) c = this.cellInfo(i, j, l - 1);
    if (!c) return { floor: -0.1, ceil: -0.1, walls: -0.1 };
    const floor = y - c.floor(x, z), ceil = c.ceil - y;
    const near = Math.min(reach, floor, ceil) + round;
    let walls = Infinity;
    const fx = x - i * CELL, fz = z - j * CELL;
    for (let k = 0; k < 4; k++) {
      const e = k === 0 ? CELL - fx : k === 1 ? CELL - fz : k === 2 ? fx : fz;
      if (e >= near) continue;
      const lateral = k % 2 === 0 ? fz - CELL / 2 : fx - CELL / 2;
      if (!this.passable(i, j, l, k, lateral)) walls = round > 0 && walls < Infinity ? smin(walls, e, round) : Math.min(walls, e);
    }
    // Corners: where neither wall is closed, the cell across the corner still may be solid.
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4, cx = k === 0 || k2 === 0 ? CELL : 0, cz = k === 1 || k2 === 1 ? CELL : 0;
      const dc = Math.hypot(fx - cx, fz - cz);
      if (dc >= near) continue;
      const di = DIRS[k][0] + DIRS[k2][0], dj = DIRS[k][1] + DIRS[k2][1];
      if (this.own(i + di, j + dj, l) !== this.own(i, j, l)) walls = Math.min(walls, dc);
    }
    return { floor, ceil, walls: Math.min(walls, reach) };
  }

  /** Distance to the sides of the point's cell that are doors shut now (a carved cave's only walls besides its rock). */
  shut(x: number, y: number, z: number): number {
    const C = this.scale.cell, l = this.levelAt(y), i = Math.floor(x / C), j = Math.floor(z / C);
    const here = this.own(i, j, l);
    if (here === undefined) return Infinity;
    const fx = x - i * C, fz = z - j * C, edge = [C - fx, C - fz, fx, fz];
    let d = Infinity;
    for (let k = 0; k < 4; k++) {
      const o = this.opening(i, j, l, k);
      if (o && !this.lets(o, here)) d = Math.min(d, edge[k]);
    }
    return d;
  }

  /** Floor height under a point (the top of whatever is below `y`), or null outside. */
  floorAt(x: number, z: number, y: number): number | null {
    const i = Math.floor(x / this.scale.cell), j = Math.floor(z / this.scale.cell);
    for (let l = this.levelAt(y); l >= this.layout.levels[0]; l--) {
      const c = this.cellInfo(i, j, l);
      if (c) return c.floor(x, z);
    }
    return null;
  }

  /**
   * The body at (x, y, z) this frame: keys are picked up where they lie (keySpot), barred doors open from their far
   * side when touched, a hidden door is found by lingering by it (looking closely), locked doors open
   * with their key. Returns what happened.
   */
  touch(x: number, y: number, z: number, dt: number): SpaceEvent[] {
    const out: SpaceEvent[] = [];
    const CELL = this.scale.cell, l = this.levelAt(y), i = Math.floor(x / CELL), j = Math.floor(z / CELL);
    const here = this.own(i, j, l);
    if (here === undefined) return out;
    const lock = here >= 0 && !this.keys.has(here) ? this.layout.links.find((pl) => pl.link.kind === 'locked' && pl.link.key === here) : undefined;
    if (lock) {
      const [kx, , kz] = keySpot(this.layout, here);
      if (Math.hypot(kx - x, kz - z) < KEY_REACH) { this.keys.add(here); out.push({ kind: 'key', link: lock.link.id }); }
    }
    for (let k = 0; k < 4; k++) {
      const o = this.opening(i, j, l, k);
      if (!o) continue;
      const fx = x - i * CELL, fz = z - j * CELL;
      const dist = [CELL - fx, CELL - fz, fx, fz][k];
      const link = o.pl.link;
      if (this.open.has(link.id) || dist > 1.1 || !isFeature(o)) continue;
      if (link.kind === 'oneway' && this.onSide(o, here, 'a')) { this.open.add(link.id); out.push({ kind: 'unbarred', link: link.id }); }
      else if (link.kind === 'locked' && link.key !== undefined && this.keys.has(link.key)) { this.open.add(link.id); out.push({ kind: 'unlocked', link: link.id }); }
      else if (link.kind === 'secret') {
        const t = (this.search.get(link.id) ?? 0) + dt;
        this.search.set(link.id, t);
        if (t > 1.5) { this.open.add(link.id); out.push({ kind: 'found', link: link.id }); }
      }
    }
    return out;
  }
}

/** Is this the door that carries its link's kind (the `b` end, or the only door)? */
export function isFeature(o: { pl: PlacedLink; end: 0 | 1 }): boolean {
  return o.pl.path.length === 0 || o.end === 1;
}

/** How far a stair cell's floor has fallen below its top at (x, z), metres. */
export function stairDrop(st: PathCell, x: number, z: number, scale: DungeonScale): number {
  const s = st.stair!;
  const fx = x / scale.cell - st.x, fz = z / scale.cell - st.z;
  const t = [fx, fz, 1 - fx, 1 - fz][s.dir];
  return ((s.step + Math.min(1, Math.max(0, t))) / s.run) * scale.storey;
}
