/**
 * A formed cave as a den's ground (D63, phase K5): its creatures live in the cave's places and walk the reader's network
 * (world/cave/reader.ts) over the carved rock (a signed distance, positive in air). Homes are numbered like a dungeon's
 * rooms: home n is `homes[n]`, a cell of the reading. Creatures walk, as the walker does (links of kind walk); a face is
 * a ledge they do not climb, and a body stuck anywhere hops to the nearest free ground. Pure.
 */
import { MinHeap } from '@futuremagic/core';
import type { Reading } from '../world/cave/reader';
import { fieldAt, type BrickField } from '../world/dungeon/rockMesh';
import type { DenGround, P3 } from './dungeonNav';

/** Ways round something in the way: turned off the heading by these (radians), nearest first. */
const AROUND = [0.4, -0.4, 0.8, -0.8, 1.3, -1.3, 1.8, -1.8];
/** A body keeps to ground this near the height it stands at (m) on a stride: a step, not a face. */
const STEP = 0.55;
/** A scramble up and a drop down that a body takes on its way (m): short faces, not the hero's climbs. */
const UP = 1.2, DOWN = 3;
/** Room a stride keeps at the knee and the waist (m): the reader's body (setting way.radius). */
const ROOM = 0.4;
/** A hop (Den.unstick): how far it goes (m) and how high up or down it lands. */
const LEAP = { near: 1.2, far: 4.5, up: 1.4, down: 2.5 } as const;
/** How far a home's creatures spread over the walkable ground round it (m). */
const SPREAD = 5;
/** Cells a search expands at the most (a way is looked for within a few tens of metres). */
const SEARCH = 6000;

export class FormedGround implements DenGround {
  /** Cells by their column (grid position). */
  private readonly columns = new Map<number, number[]>();
  /** For each home, the cells within `SPREAD` metres of it by walk links (filled when first asked). */
  private readonly around = new Map<number, number[]>();

  constructor(private readonly field: BrickField, private readonly r: Reading, private readonly homes: readonly number[]) {
    for (let c = 0; c < r.count; c++) {
      if (r.depth[c] === Infinity) continue;
      const k = this.columnKey(Math.round((r.x[c] - field.ox) / field.step), Math.round((r.z[c] - field.oz) / field.step));
      const l = this.columns.get(k);
      if (l) l.push(c); else this.columns.set(k, [c]);
    }
  }

  private columnKey(i: number, k: number): number { return i + 8192 * k; }

  /** The reached cell nearest (x, y, z) within `reach` metres across and `up` metres of height (−1: none). */
  private cellAt(x: number, y: number, z: number, reach = 0.8, up = 1.2): number {
    const f = this.field, ci = Math.round((x - f.ox) / f.step), ck = Math.round((z - f.oz) / f.step), n = Math.ceil(reach / f.step);
    let best = -1, bd = Infinity;
    for (let dk = -n; dk <= n; dk++) for (let di = -n; di <= n; di++) {
      for (const c of this.columns.get(this.columnKey(ci + di, ck + dk)) ?? []) {
        const dy = Math.abs(this.r.y[c] - y);
        if (dy > up) continue;
        const d = (this.r.x[c] - x) ** 2 + (this.r.z[c] - z) ** 2 + dy * dy * 0.5;
        if (d < bd) { bd = d; best = c; }
      }
    }
    return best;
  }

  /** Does a link from cell a to cell b suit a creature: a walk, a short scramble up, a drop of a few metres. */
  private goes(a: number, b: number, kind: number): boolean {
    const dy = this.r.y[b] - this.r.y[a];
    return kind === 0 || (kind === 1 ? Math.abs(dy) <= UP : dy >= -DOWN);
  }

  private point(c: number): P3 { return { x: this.r.x[c], y: this.r.y[c], z: this.r.z[c] }; }

  /** The reached cells within `SPREAD` metres of a home along walk links. */
  private cellsAround(home: number): number[] {
    let out = this.around.get(home);
    if (out) return out;
    const start = this.homes[home], r = this.r, seen = new Set<number>([start]);
    out = [start];
    for (let n = 0; n < out.length; n++) {
      const a = out[n];
      for (let e = r.edgeStart[a]; e < r.edgeStart[a + 1]; e++) {
        const b = r.edgeTo[e];
        if (!this.goes(a, b, r.edgeKind[e]) || seen.has(b) || Math.hypot(r.x[b] - r.x[start], r.z[b] - r.z[start]) > SPREAD || Math.abs(r.y[b] - r.y[start]) > 3) continue;
        seen.add(b); out.push(b);
      }
    }
    this.around.set(home, out);
    return out;
  }

  spot(home: number, rng: { range(a: number, b: number): number }): P3 {
    const cells = this.cellsAround(home), c = cells[Math.min(cells.length - 1, Math.floor(rng.range(0, cells.length)))];
    const j = this.field.step * 0.15;
    const x = this.r.x[c] + rng.range(-j, j), z = this.r.z[c] + rng.range(-j, j);
    // The cell's own floor (a column can hold shelves over one another).
    const fl = this.floorAt(x, z, this.r.y[c] + 0.25);
    return fl !== null && Math.abs(fl - this.r.y[c]) < 0.3 ? { x, y: fl, z } : this.point(c);
  }

  /** The rock's floor under (x, z), looking down from `y` (up to 6 m), by the field's sign changes. */
  floorAt(x: number, z: number, y: number): number | null {
    const f = this.field;
    let top = y, v = fieldAt(f, x, top, z, -1);
    // Inside rock: look a little up for the air above it.
    for (let up = 0; v <= 0 && up < UP + 0.2; up += 0.1) { top = y + up + 0.1; v = fieldAt(f, x, top, z, -1); }
    if (v <= 0) return null;
    let prev = v;
    for (let d = 0.1; d <= 6; d += 0.1) {
      const w = fieldAt(f, x, top - d, z, -1);
      // The surface is where the distance crosses zero, between the two samples.
      if (w <= 0) return top - d + 0.1 * (1 - prev / (prev - w));
      prev = w;
    }
    return null;
  }

  clearance(x: number, y: number, z: number): number { return fieldAt(this.field, x, y + 0.5, z, -1); }

  sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number, eye = 1.2): boolean {
    const d = Math.hypot(bx - ax, by - ay, bz - az), n = Math.ceil(d / 0.5);
    for (let s = 1; s < n; s++) {
      const t = s / n;
      if (fieldAt(this.field, ax + (bx - ax) * t, ay + eye + (by - ay) * t, az + (bz - az) * t, -1) < 0.05) return false;
    }
    return true;
  }

  /** The way over walk links by A*, then pulled straight where the floor allows. Empty: none. */
  way(from: P3, to: P3): P3[] {
    const a = this.cellAt(from.x, from.y, from.z, 1.2, 1.6), b = this.cellAt(to.x, to.y, to.z, 1.2, 1.6);
    if (a < 0 || b < 0) return [];
    if (a === b) return [to];
    const r = this.r, g = new Map<number, number>([[a, 0]]), tree = new Map<number, number>(), heap = new MinHeap();
    const toward = (c: number): number => Math.hypot(r.x[c] - r.x[b], r.y[c] - r.y[b], r.z[c] - r.z[b]);
    heap.push(toward(a), a);
    let found = false;
    for (let n = 0; heap.size && n < SEARCH; n++) {
      const c = heap.pop();
      if (c === b) { found = true; break; }
      const gc = g.get(c)!;
      for (let e = r.edgeStart[c]; e < r.edgeStart[c + 1]; e++) {
        if (!this.goes(c, r.edgeTo[e], r.edgeKind[e])) continue;
        const d = r.edgeTo[e], gd = gc + Math.hypot(r.x[c] - r.x[d], r.y[c] - r.y[d], r.z[c] - r.z[d]);
        if (gd < (g.get(d) ?? Infinity)) { g.set(d, gd); tree.set(d, c); heap.push(gd + toward(d), d); }
      }
    }
    if (!found) return [];
    const cells: number[] = [];
    for (let c = b; c !== a; c = tree.get(c)!) cells.push(c);
    cells.reverse();
    // The point itself if a body fits there; else the nearest ground that is walked to.
    const fl = this.floorAt(to.x, to.z, to.y + 0.6), fits = fl !== null && this.room(to.x, fl, to.z) >= ROOM * 0.8 && Math.abs(fl - r.y[b]) < UP;
    return this.pulled(from, cells.map((c) => this.point(c)), fits ? to : this.point(b));
  }

  /** The cells' points with those skipped that a straight stride over level ground can cut. */
  private pulled(from: P3, pts: P3[], to: P3): P3[] {
    const out: P3[] = [];
    let at = from, i = 0;
    while (i < pts.length) {
      let j = i;
      // As far on as a straight stride from `at` is free.
      for (let k = i + 1; k < Math.min(pts.length, i + 24); k++) if (this.stride(at, pts[k])) j = k;
      out.push(pts[j]); at = pts[j]; i = j + 1;
    }
    out.push(to);
    return out;
  }

  /** Is the stride from one point to another free ground: floor within a step all along, room for the body? */
  private stride(a: P3, b: P3): boolean {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(d / 0.4));
    let y = a.y;
    for (let s = 1; s <= n; s++) {
      const t = s / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, fl = this.floorAt(x, z, y + 0.6);
      if (fl === null || Math.abs(fl - y) > STEP || fieldAt(this.field, x, fl + 0.75, z, -1) < ROOM || fieldAt(this.field, x, fl + 1.3, z, -1) < ROOM) return false;
      y = fl;
    }
    return Math.abs(y - b.y) < STEP * 1.5;
  }

  slide(x: number, y: number, z: number, dx: number, dz: number, r: number): { x: number; z: number } | null {
    if (this.passes(x, y, z, dx, dz, r)) return { x: x + dx, z: z + dz };
    if (Math.hypot(dx, dz) < 1e-5) return null;
    for (const a of AROUND) {
      const c = Math.cos(a), s = Math.sin(a), k = Math.max(0.5, c), tx = (dx * c - dz * s) * k, tz = (dx * s + dz * c) * k;
      if (this.passes(x, y, z, tx, tz, r)) return { x: x + tx, z: z + tz };
    }
    return null;
  }

  /** Room round a body standing with its feet at (x, y, z): the least at its waist and head, metres. */
  private room(x: number, y: number, z: number): number {
    return Math.min(fieldAt(this.field, x, y + 0.75, z, -1), fieldAt(this.field, x, y + 1.3, z, -1));
  }

  /** Can a body at (x, z) with its feet at y move by (dx, dz): the floor there within a scramble, room at its waist and head (or no less than where it stands)? */
  private passes(x: number, y: number, z: number, dx: number, dz: number, r: number): boolean {
    const nx = x + dx, nz = z + dz, fl = this.floorAt(nx, nz, y + 0.6);
    if (fl === null || fl - y > UP || y - fl > DOWN) return false;
    const room = this.room(nx, fl, nz);
    return room >= r * 0.8 || room >= this.room(x, y, z) - 0.01;
  }

  /** The reached ground farthest from `q` within a few tens of metres, by walk links. */
  away(from: P3, q: P3): P3[] {
    const a = this.cellAt(from.x, from.y, from.z, 1.2, 1.6);
    if (a < 0) return [];
    const r = this.r, d = new Map<number, number>([[a, 0]]), list = [a];
    let best = a, score = -Infinity;
    for (let n = 0; n < list.length && n < 1500; n++) {
      const c = list[n], dc = d.get(c)!;
      const far = Math.hypot(r.x[c] - q.x, r.z[c] - q.z) - dc * 0.3;
      if (far > score) { score = far; best = c; }
      if (dc > 24) continue;
      for (let e = r.edgeStart[c]; e < r.edgeStart[c + 1]; e++) {
        const k = r.edgeTo[e];
        if (this.goes(c, k, r.edgeKind[e]) && !d.has(k)) { d.set(k, dc + Math.hypot(r.x[c] - r.x[k], r.z[c] - r.z[k])); list.push(k); }
      }
    }
    return best === a ? [] : this.way(from, this.point(best));
  }

  /** A free cell a short hop off, nearer `toward` than `from` is (or any, stuck in rock): the body is set there. */
  hop(from: P3, toward: P3 | null, r: number): P3 | null {
    const bad = this.clearance(from.x, from.y, from.z) < r * 0.6, goal = toward ? Math.hypot(toward.x - from.x, toward.z - from.z) : 0;
    const f = this.field, ci = Math.round((from.x - f.ox) / f.step), ck = Math.round((from.z - f.oz) / f.step), n = Math.ceil(LEAP.far / f.step);
    let best: P3 | null = null, score = Infinity;
    for (let dk = -n; dk <= n; dk++) for (let di = -n; di <= n; di++) for (const c of this.columns.get(this.columnKey(ci + di, ck + dk)) ?? []) {
      const p = this.point(c), d = Math.hypot(p.x - from.x, p.z - from.z);
      if (d < LEAP.near || d > LEAP.far || p.y - from.y > LEAP.up || from.y - p.y > LEAP.down) continue;
      const left = toward ? Math.hypot(toward.x - p.x, toward.z - p.z) : 0;
      if (!bad && (!toward || left > goal - 0.75)) continue;
      const sc = left + d * 0.5;
      if (sc < score) { score = sc; best = p; }
    }
    return best;
  }
}
