/**
 * Can the hero always climb out? (Arnd 2026-11-17: "was in a cave, in a hole and could not climb out in any direction".)
 * The game's own Walker is set on the ground of a formed cave the reader read (world/cave/reader.ts) and asked to go where
 * the reader says it can: the cave's floors are cut into patches the hero walks about in (walk, swim and ladder links),
 * and between patches it drops down freely and climbs up only where the Walker, pushing at the face from the lower cell
 * towards the upper one (straight at it, then steering along the face towards it, as a player does), really gets up there.
 * A patch the hero can get into from a way in but not back out of to one is a trap. Pure: no rendering. Used by
 * test/cavePits.test.ts and `npm run loop:pits`.
 */
import { Walker, type WalkWorld } from '../../src/game/walker';
import type { Reading } from '../../src/world/cave/reader';

/** Seconds of play a climb up a face may take. */
const CLIMB_TIME = 20;
/** Faces up to this high (m) need no climb: the walker hops or steps them. */
const NO_CLIMB = 1.3;
/** Links between two patches tried at the most (lowest first, spread over the rest). */
const TRIES = 6;

export interface PitReport {
  /** Cells the hero can get to from a way in. */
  readonly reached: number;
  /** Of those, the cells it cannot get back out to a way in from. */
  readonly trapped: number;
  /** The trapped patches: their size in cells and a cell in each. */
  readonly pits: readonly { readonly cells: number; readonly x: number; readonly y: number; readonly z: number }[];
  /** Climbs tried with the walker, and the ones that failed. */
  readonly tried: number;
  readonly failed: readonly { readonly a: number; readonly b: number; readonly rise: number }[];
}

/** Does the walker, set on cell `a`, get up onto cell `b` above it? `steer`: along the face towards b while climbing. */
export function climbsUp(world: WalkWorld, g: Reading, a: number, b: number, steer: boolean): boolean {
  const w = new Walker(world);
  w.place(g.x[a], g.z[a], g.y[a] + 0.02);
  for (let t = 0; t < 60 * CLIMB_TIME; t++) {
    const dx = g.x[b] - w.pos.x, dz = g.z[b] - w.pos.z;
    if (w.mode !== 'climb' && w.mode !== 'pull' && w.pos.y > g.y[b] - 0.5) return true;
    // (Along the face: right of one facing it is (-nz, nx).)
    const side = steer && w.mode === 'climb' ? Math.max(-1, Math.min(1, (dx * -w.face.nz + dz * w.face.nx) * 3)) : 0;
    w.step({ forward: 1, strafe: side, heading: Math.atan2(-dx, -dz), walk: false, up: false, down: false }, 1 / 60);
  }
  return false;
}

/** The traps of a read cave for the hero, with the walker in `world` (formedWorld of the same field). */
export function pitReport(world: WalkWorld, g: Reading): PitReport {
  // Patches: cells joined by walk, swim and ladder links.
  const patch = new Int32Array(g.count).fill(-1);
  let np = 0;
  for (let s = 0; s < g.count; s++) {
    if (patch[s] >= 0) continue;
    const q = [s];
    patch[s] = np;
    for (let i = 0; i < q.length; i++) {
      const a = q[i];
      for (let e = g.edgeStart[a]; e < g.edgeStart[a + 1]; e++) {
        const k = g.edgeKind[e], b = g.edgeTo[e];
        if (k !== 1 && k !== 2 && patch[b] < 0) { patch[b] = np; q.push(b); }
      }
    }
    np++;
  }
  const size = new Int32Array(np);
  for (let a = 0; a < g.count; a++) size[patch[a]]++;
  // The links between each two patches (from, to), and those out of and into each patch.
  const pairs = new Map<number, [number, number][]>(), out = new Map<number, number[]>(), into = new Map<number, number[]>();
  for (let a = 0; a < g.count; a++) for (let e = g.edgeStart[a]; e < g.edgeStart[a + 1]; e++) {
    const b = g.edgeTo[e], pa = patch[a], pb = patch[b];
    if (pa === pb) continue;
    const k = pa * np + pb;
    let l = pairs.get(k);
    if (!l) { pairs.set(k, l = []); (out.get(pa) ?? out.set(pa, []).get(pa)!).push(k); (into.get(pb) ?? into.set(pb, []).get(pb)!).push(k); }
    l.push([a, b]);
  }
  // Whether the hero gets from one patch to the other: down (or up a step) always, up a face if the walker does it on one of the links.
  const verdict = new Map<number, boolean>(), failed: { a: number; b: number; rise: number }[] = [];
  let tried = 0;
  const goes = (k: number): boolean => {
    const known = verdict.get(k);
    if (known !== undefined) return known;
    const list = pairs.get(k)!;
    let ok = list.some(([a, b]) => g.y[b] <= g.y[a] + NO_CLIMB);
    if (!ok) {
      list.sort((p, q) => (g.y[p[1]] - g.y[p[0]]) - (g.y[q[1]] - g.y[q[0]]));
      const every = Math.max(1, Math.floor(list.length / TRIES));
      for (const [a, b] of list.filter((_, i) => i % every === 0).slice(0, TRIES)) {
        tried++;
        if (climbsUp(world, g, a, b, false) || climbsUp(world, g, a, b, true)) { ok = true; break; }
        failed.push({ a, b, rise: g.y[b] - g.y[a] });
      }
    }
    verdict.set(k, ok);
    return ok;
  };
  // Reached from a way in; then, of those, what gets back to one.
  const reached = new Uint8Array(np), back = new Uint8Array(np);
  const q: number[] = [];
  for (const e of g.entries) if (!reached[patch[e]]) { reached[patch[e]] = 1; q.push(patch[e]); }
  for (let i = 0; i < q.length; i++) for (const k of out.get(q[i]) ?? []) { const t = k % np; if (!reached[t] && goes(k)) { reached[t] = 1; q.push(t); } }
  const r: number[] = [];
  for (const e of g.entries) if (!back[patch[e]]) { back[patch[e]] = 1; r.push(patch[e]); }
  for (let i = 0; i < r.length; i++) for (const k of into.get(r[i]) ?? []) { const f = Math.floor(k / np); if (!back[f] && reached[f] && goes(k)) { back[f] = 1; r.push(f); } }
  let inCells = 0, trapped = 0;
  const pits: { cells: number; x: number; y: number; z: number }[] = [];
  for (let p = 0; p < np; p++) {
    if (!reached[p]) continue;
    inCells += size[p];
    if (back[p]) continue;
    trapped += size[p];
    const a = patch.indexOf(p);
    pits.push({ cells: size[p], x: g.x[a], y: g.y[a], z: g.z[a] });
  }
  pits.sort((p, o) => o.cells - p.cells);
  return { reached: inCells, trapped, pits, tried, failed };
}
