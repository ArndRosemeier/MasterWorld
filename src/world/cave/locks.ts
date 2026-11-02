/**
 * Natural locks in a formed cave (D63, phase K6; pure): the story of a cellar shuts some of its ways (a wedged boulder, a locked grate,
 * stacked stones), and a natural cave has no doors, so each shut way is set where the cave itself narrows. For a link between two rooms
 * the way from one room's home to the other's is read off the network (world/cave/reader.ts) and a place on it is picked that
 *   - no other way goes round (shut it, and the second room cannot be reached from the first),
 *   - is narrow (setting `way.lock.widest`) and high enough (`tall`),
 *   - lies far enough from a way in (`fromEntry`) and from another lock (`apart`).
 * A link with no such place stays open (the cave has loops where the story has none). The lock carries the reading's cells it shuts,
 * for the creatures' ways, and the box that stands in the way, for the walker and the picture.
 */
import type { CavesDef } from '../../setting/contract';
import type { Cellar } from '../dungeon/cellar';
import { fieldAt, type BrickField } from '../dungeon/rockMesh';
import type { Reading } from './reader';

/** The kinds of shut way a lock can be (the graph's others are open, plain doors, drops, bars that are never passed and falls). */
export type LockKind = 'oneway' | 'locked' | 'secret';

/** A shut way in a formed cave (cave frame, metres). */
export interface CaveLock {
  /** The story link it stands for (the id the diff, the keys and the pieces go by). */
  readonly link: number;
  readonly kind: LockKind;
  /** The rooms it lies between: `a` is the side it opens from, `b` the side beyond. */
  readonly a: number;
  readonly b: number;
  /** `locked`: the room whose home holds the key. */
  readonly key?: number;
  /** The middle of the way on its floor. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The way through it, from `a` to `b` (a unit vector over the floor). */
  readonly tx: number;
  readonly tz: number;
  /** How far across the way is, and the air over it. */
  readonly width: number;
  readonly height: number;
  /** The reading's cells it shuts. */
  readonly cells: readonly number[];
}

const KINDS: ReadonlySet<string> = new Set<LockKind>(['oneway', 'locked', 'secret']);
/** The cells a lock shuts: within this across (m) and this high (m) of its middle. */
const ZONE = 1.8, ZONE_Y = 1.8;
/** How far a body is measured across the way (m, either side), and up. */
const REACH = 6, STEP = 0.25;
/** Candidates tried for each link, and the cells either side a way's direction is read over. */
const TRIES = 8, SPAN = 2;

/** Air over a point (positive in air). */
const airAt = (f: BrickField, x: number, y: number, z: number): number => fieldAt(f, x, y, z, -1);

/** The shut ways of a cellar's story, set in a formed cave whose rooms have the homes `homes` (a reading cell for each room id). */
export function lockSites(cellar: Cellar, field: BrickField, r: Reading, homes: readonly number[], way: CavesDef['way']): CaveLock[] {
  const lk = way.lock, out: CaveLock[] = [], parent = new Int32Array(r.count), seen = new Uint8Array(r.count);
  /** A shortest way from `src` to `dst` over the network, avoiding `banned` (null: none). */
  const bfs = (src: number, dst: number, banned?: Set<number>): number[] | null => {
    seen.fill(0);
    const q = [src];
    seen[src] = 1; parent[src] = -1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i];
      if (c === dst) { const p: number[] = []; for (let k = c; k >= 0; k = parent[k]) p.push(k); return p.reverse(); }
      for (let e = r.edgeStart[c]; e < r.edgeStart[c + 1]; e++) {
        const d = r.edgeTo[e];
        if (seen[d] || banned?.has(d)) continue;
        seen[d] = 1; parent[d] = c; q.push(d);
      }
    }
    return null;
  };
  const zoneOf = (x: number, y: number, z: number): Set<number> => {
    const s = new Set<number>();
    for (let c = 0; c < r.count; c++) if (Math.abs(r.y[c] - y) < ZONE_Y && Math.hypot(r.x[c] - x, r.z[c] - z) < ZONE) s.add(c);
    return s;
  };
  for (const link of cellar.graph.links) {
    if (!KINDS.has(link.kind)) continue;
    const src = homes[link.a], dst = homes[link.b];
    if (src === undefined || dst === undefined || src < 0 || dst < 0 || src === dst || r.depth[src] === Infinity || r.depth[dst] === Infinity) continue;
    const path = bfs(src, dst);
    if (!path || path.length < 2 * SPAN + 3) continue;
    // From the middle of the way outwards: the first few places that are narrow and clear of others, then the narrowest that no way goes round.
    const mid = path.length / 2, order = path.map((_, i) => i).filter((i) => i >= SPAN && i < path.length - SPAN).sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
    let best: CaveLock | null = null;
    let tried = 0;
    for (const i of order) {
      if (tried >= TRIES) break;
      const c = path[i];
      if (r.depth[c] < lk.fromEntry) continue;
      const x = r.x[c], y = r.y[c], z = r.z[c];
      if (out.some((o) => Math.hypot(o.x - x, o.z - z) + Math.abs(o.y - y) < lk.apart)) continue;
      // Which way the cave runs here, and how wide and high it is across that.
      const p0 = path[i - SPAN], p1 = path[i + SPAN];
      let tx = r.x[p1] - r.x[p0], tz = r.z[p1] - r.z[p0];
      const run = Math.hypot(tx, tz);
      if (run < 1) continue;
      tx /= run; tz /= run;
      if (airAt(field, x, y + 1.1, z) <= 0) continue;
      let left = 0, right = 0, up = 0;
      while (left < REACH && airAt(field, x - tz * left, y + 1.1, z + tx * left) > 0) left += STEP;
      while (right < REACH && airAt(field, x + tz * right, y + 1.1, z - tx * right) > 0) right += STEP;
      while (up < REACH && airAt(field, x, y + 0.1 + up, z) > 0) up += STEP;
      const width = left + right, height = up + 0.1;
      if (width > lk.widest || height < lk.tall) continue;
      if (best && width >= best.width) { tried++; continue; }
      // No way goes round it: with the place shut, the far room cannot be reached.
      if (bfs(src, dst, zoneOf(x, y, z))) { tried++; continue; }
      tried++;
      best = { link: link.id, kind: link.kind as LockKind, a: link.a, b: link.b, ...(link.key !== undefined ? { key: link.key } : {}), x, y, z, tx, tz, width, height, cells: [...zoneOf(x, y, z)] };
    }
    if (best) out.push(best);
  }
  return out;
}

/** How far the box that shuts a lock reaches past the way's sides (m), along it (half, m), and below and over the floor and the air. */
const BOX = { side: 0.45, deep: 0.4, under: 0.3, over: 0.3 };

/**
 * A shut lock as solid: the signed distance (positive outside) to the box that stands in its way, from the floor a little way down to the
 * air over it, across the way and a little into the rock either side, so a body has no gap to slip by.
 */
export function lockBox(l: CaveLock, x: number, y: number, z: number): number {
  const dx = x - l.x, dz = z - l.z, along = dx * l.tx + dz * l.tz, across = -dx * l.tz + dz * l.tx;
  const hx = BOX.deep, hz = l.width / 2 + BOX.side, hy = (l.height + BOX.under + BOX.over) / 2;
  const qx = Math.abs(along) - hx, qz = Math.abs(across) - hz, qy = Math.abs(y - (l.y + (l.height + BOX.over - BOX.under) / 2)) - hy;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
}

/** `air` (positive in air) with the boxes of the locks still shut in it. */
export function shutAir(air: number, closed: readonly CaveLock[], x: number, y: number, z: number): number {
  let d = air;
  for (const l of closed) d = Math.min(d, lockBox(l, x, y, z));
  return d;
}
