/**
 * The mason's kit for the camps' structures (D69, Z4; pure): walls of any thickness run as columns between two lines
 * in plan (so the corners of a ring mitre and never overlap), with openings of every arch shape cut through them,
 * tops level, gabled, crenellated or broken in courses; rings, prisms, spires, gable roofs, flights of steps and
 * fallen stones. Everything goes into the building mesh format (world/dungeon/meshKit.ts) and draws with the town's
 * one building shader, no new shader. A wall's foot goes FOOT into the ground under it or stands on a given height.
 */
import { smoothstep, type Ground, type Rng } from '@futuremagic/core';
import type { StructureArch } from '../../setting/contract';
import { MeshKit, mixTint, type Tint } from '../dungeon/meshKit';

export type P2 = readonly [number, number];

/** How far a wall's foot goes into the ground under its lowest corner, metres. */
export const FOOT = 1.6;
/** Columns of a wall are about this wide, metres (its broken top steps by them). */
const COLUMN = 1;
/** The ground's damp up a wall: full to the first height, gone by the second (m). */
const DAMP_FULL = 0.7, DAMP_UP = 2.8;
/** The depth of an arch's ring of dressed stone over its opening, m. */
const RING = 0.55;
const DAMP: Tint = [70, 74, 58], MOSSY: Tint = [98, 116, 62];

/** What every part is built with: the mesh, the seed's dice, the land, how green it has grown (0..1). */
export interface Site {
  readonly k: MeshKit;
  readonly rng: Rng;
  readonly ground: Ground;
  readonly moss: number;
}

/** An opening through a wall: s0..s1 along it (m), from y0 up to the spring line y1, its head an arch of that shape. */
export interface Opening {
  readonly s0: number;
  readonly s1: number;
  readonly y0: number;
  readonly y1: number;
  readonly arch: StructureArch;
}

export interface WallSpec {
  /** The outer face's line, a to b, and the inner face's (mitred at a ring's corners). */
  readonly a: P2;
  readonly b: P2;
  readonly ia: P2;
  readonly ib: P2;
  /** The foot: null goes FOOT into the ground under each column; a number stands on that height (a terrace), a function on what runs under it (a deck). */
  readonly base: number | null | ((s: number) => number);
  /** The top at s metres along the outer line. */
  readonly top: (s: number) => number;
  /** Each column's top level (broken courses, merlons) instead of running straight between the breaks (a gable, a ramp). */
  readonly stepped?: boolean;
  /** Places along the wall where columns must break (a merlon's edge, a gable's ridge). */
  readonly breaks?: readonly number[];
  readonly openings?: readonly Opening[];
  readonly mat: number;
  readonly tint: Tint;
  /** The top's surface (a deck's road, a wall-walk's flags); else the wall's. */
  readonly topMat?: number;
  readonly topTint?: Tint;
  /** Dressed stone at the ends and round the openings (quoins, voussoirs). */
  readonly trimMat?: number;
  readonly trimTint?: Tint;
  /** End faces are shown above these heights (a ring's corner hides what its neighbour covers); default all. */
  readonly capA?: number;
  readonly capB?: number;
  /** Each column a little lighter or darker (rough work), by up to this. */
  readonly vary?: number;
}

type Edge = readonly [number, number];
/** A solid piece of a column: its lower and upper edge (at the column's two ends), and what those edges are. */
interface Piece { lo: Edge; hi: Edge; soffit: boolean; sill: boolean; ring?: boolean }
interface Column { s0: number; s1: number; pieces: Piece[]; tint: Tint; mat: number; ringTint: Tint; ringMat: number; ground: number; top: number }

const lerp2 = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** The head of an opening at s: its height over the spring line follows the arch. */
export function archHead(o: Opening, s: number): number {
  const w = o.s1 - o.s0, r = w / 2, d = Math.min(r, Math.abs(s - (o.s0 + o.s1) / 2));
  switch (o.arch) {
    case 'flat': return o.y1;
    case 'round': return o.y1 + Math.sqrt(Math.max(0, r * r - d * d));
    case 'segmental': {
      const rise = w * 0.2, R = (r * r + rise * rise) / (2 * rise);
      return o.y1 + rise - (R - Math.sqrt(Math.max(0, R * R - d * d)));
    }
    case 'pointed': {
      const R = w * 0.82, off = R - r;
      return o.y1 + Math.sqrt(Math.max(0, R * R - (d + off) * (d + off)));
    }
  }
}

/** How high an arch of that shape rises over its spring line for a width, m. */
export function archRise(arch: StructureArch, w: number): number {
  return archHead({ s0: 0, s1: w, y0: 0, y1: 0, arch }, w / 2);
}

/** A quad turned to face `want` (its corners in order round it, either way). */
export function faceTo(k: MeshKit, q: number[][], uv: number[][], mat: number, tint: Tint | readonly Tint[], want: readonly number[]): void {
  const [a, b, c, d] = q;
  const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) { k.quad(a, b, c, d, uv, mat, tint); return; }
  const t = typeof tint[0] === 'number' ? tint as Tint : null;
  const ts = tint as readonly Tint[];
  k.quad(a, d, c, b, [uv[0], uv[3], uv[2], uv[1]], mat, t ?? [ts[0], ts[3], ts[2], ts[1]]);
}

/** A tint weathered at height y: damp at the foot (`gy` the ground there), green near the top as the site has grown over. */
export function aged(site: Site, tint: Tint, y: number, gy: number, top: number): Tint {
  const damp = 1 - smoothstep(DAMP_FULL, DAMP_UP, y - gy), green = site.moss * smoothstep(top - 1.4, top, y);
  return mixTint(mixTint(tint, MOSSY, green * 0.75), DAMP, damp * 0.75);
}

/** Subtract [a, b] from a sorted list of ranges. */
function minus(ranges: [number, number][], a: number, b: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [p, q] of ranges) {
    if (b <= p || a >= q) { out.push([p, q]); continue; }
    if (a > p) out.push([p, a]);
    if (b < q) out.push([b, q]);
  }
  return out;
}

/** A wall: its columns, their faces, the tops, sills and soffits of its openings, and the end faces where they show. */
export function wall(site: Site, w: WallSpec): void {
  const { k, ground, rng } = site;
  const len = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]);
  if (len < 0.05) return;
  const ops = w.openings ?? [];
  // Where columns break: every metre or so, the given breaks, each opening's edges and (for an arch) its curve.
  const cuts: number[] = [0, len, ...(w.breaks ?? [])];
  for (let s = COLUMN; s < len - 0.3; s += COLUMN) cuts.push(s);
  const trimmed = w.trimMat !== undefined;
  for (const o of ops) {
    cuts.push(o.s0, o.s1);
    if (trimmed) cuts.push(o.s0 - 0.5, o.s1 + 0.5);
    if (o.arch !== 'flat') for (let i = 1; i < 12; i++) cuts.push(o.s0 + ((o.s1 - o.s0) * i) / 12);
  }
  if (trimmed) cuts.push(0.6, len - 0.6);
  const ss = [...new Set(cuts.filter((s) => s >= 0 && s <= len).map((s) => Math.round(s * 1000) / 1000))].sort((p, q) => p - q);
  const out = [w.a[0] - w.ia[0], w.a[1] - w.ia[1]];
  const ol = Math.hypot(out[0], out[1]) || 1;
  const outward = [out[0] / ol, 0, out[1] / ol], inward = [-outward[0], 0, -outward[2]];
  const along = [(w.b[0] - w.a[0]) / len, 0, (w.b[1] - w.a[1]) / len];
  const O = (s: number) => lerp2(w.a, w.b, s / len), I = (s: number) => lerp2(w.ia, w.ib, s / len);
  const cols: Column[] = [];
  for (let i = 0; i + 1 < ss.length; i++) {
    const s0 = ss[i], s1 = ss[i + 1];
    if (s1 - s0 < 0.002) continue;
    const mid = (s0 + s1) / 2, o0 = O(s0), o1 = O(s1), i0 = I(s0), i1 = I(s1);
    const g = Math.min(ground(o0[0], o0[1]), ground(o1[0], o1[1]), ground(i0[0], i0[1]), ground(i1[0], i1[1]));
    const b0 = typeof w.base === 'function' ? w.base(s0) : w.base ?? g - FOOT, b1 = typeof w.base === 'function' ? w.base(s1) : b0;
    const t0 = w.stepped ? w.top(mid) : w.top(s0), t1 = w.stepped ? t0 : w.top(s1);
    if (t0 <= b0 + 0.01 && t1 <= b1 + 0.01) { cols.push({ s0, s1, pieces: [], tint: w.tint, mat: w.mat, ringTint: w.tint, ringMat: w.mat, ground: g, top: t0 }); continue; }
    let pieces: Piece[] = [{ lo: [b0, b1], hi: [Math.max(t0, b0), Math.max(t1, b1)], soffit: false, sill: false }];
    for (const o of ops) {
      if (o.s0 > mid || o.s1 < mid) continue;
      const h0 = archHead(o, s0), h1 = archHead(o, s1), hm = archHead(o, mid);
      const next: Piece[] = [];
      for (const p of pieces) {
        const plo = (p.lo[0] + p.lo[1]) / 2, phi = (p.hi[0] + p.hi[1]) / 2;
        if (hm <= plo || o.y0 >= phi) { next.push(p); continue; }
        if (o.y0 > plo + 0.01) next.push({ lo: p.lo, hi: [Math.min(o.y0, p.hi[0]), Math.min(o.y0, p.hi[1])], soffit: p.soffit, sill: true });
        if (hm < phi - 0.01) next.push({ lo: [Math.max(h0, p.lo[0]), Math.max(h1, p.lo[1])], hi: p.hi, soffit: true, sill: p.sill });
      }
      pieces = next;
    }
    // Quoins at the ends; over an opening its arch's ring of dressed stone (the piece above it split there).
    const nearEdge = trimmed && (s0 < 0.6 - 1e-3 || s1 > len - 0.6 + 1e-3);
    if (trimmed && !nearEdge) pieces = pieces.flatMap((p) => {
      if (!p.soffit || (p.hi[0] + p.hi[1]) / 2 - (p.lo[0] + p.lo[1]) / 2 < 1) return [p];
      const r0 = p.lo[0] + RING, r1 = p.lo[1] + RING;
      return [{ ...p, hi: [r0, r1], sill: false, ring: true }, { ...p, lo: [r0, r1], soffit: false }];
    });
    const v = w.vary ?? 0.05, f = 1 + rng.range(-v, v);
    const vary = (t: Tint) => t.map((c) => Math.max(0, Math.min(255, Math.round(c * f)))) as unknown as Tint;
    const tint = vary(nearEdge ? w.trimTint! : w.tint);
    cols.push({ s0, s1, pieces, tint, mat: nearEdge ? w.trimMat! : w.mat, ringTint: trimmed ? vary(w.trimTint!) : tint, ringMat: w.trimMat ?? w.mat, ground: g, top: Math.max(t0, t1) });
  }
  const P3 = (p: P2, y: number) => [p[0], y, p[1]];
  for (const c of cols) {
    const o0 = O(c.s0), o1 = O(c.s1), i0 = I(c.s0), i1 = I(c.s1);
    for (const p of c.pieces) {
      const pt = p.ring ? c.ringTint : c.tint, pm = p.ring ? c.ringMat : c.mat;
      const tintAt = (y: number) => aged(site, pt, y, c.ground, c.top);
      // The faces, cut where the weathering turns when the piece is level (its texture runs on through the cuts).
      const level = Math.abs(p.lo[0] - p.lo[1]) < 1e-3 && Math.abs(p.hi[0] - p.hi[1]) < 1e-3;
      const ys = level ? [p.lo[0], c.ground + DAMP_FULL, c.ground + DAMP_UP, c.top - 1.4, p.hi[0]].filter((y) => y >= p.lo[0] && y <= p.hi[0]).sort((a, b) => a - b) : null;
      const bands: [Edge, Edge][] = ys ? ys.slice(1).map((y, i) => [[ys[i], ys[i]], [y, y]] as [Edge, Edge]) : [[p.lo, p.hi]];
      for (const [lo, hi] of bands) {
        if (hi[0] - lo[0] < 0.002 && hi[1] - lo[1] < 0.002) continue;
        const tints = [tintAt(lo[0]), tintAt(hi[0]), tintAt(hi[1]), tintAt(lo[1])];
        faceTo(k, [P3(o0, lo[0]), P3(o0, hi[0]), P3(o1, hi[1]), P3(o1, lo[1])], [[c.s0, lo[0]], [c.s0, hi[0]], [c.s1, hi[1]], [c.s1, lo[1]]], pm, tints, outward);
        faceTo(k, [P3(i0, lo[0]), P3(i0, hi[0]), P3(i1, hi[1]), P3(i1, lo[1])], [[-c.s0, lo[0]], [-c.s0, hi[0]], [-c.s1, hi[1]], [-c.s1, lo[1]]], pm, tints, inward);
      }
      const across = Math.hypot(o0[0] - i0[0], o0[1] - i0[1]);
      const isTop = !p.sill;
      const topMat = isTop ? (w.topMat ?? pm) : pm, topTint = isTop ? (w.topTint ?? tintAt(p.hi[0])) : tintAt(p.hi[0]);
      if (!p.ring) faceTo(k, [P3(o0, p.hi[0]), P3(o1, p.hi[1]), P3(i1, p.hi[1]), P3(i0, p.hi[0])], [[c.s0, 0], [c.s1, 0], [c.s1, across], [c.s0, across]], topMat, topTint, [0, 1, 0]);
      if (p.soffit) faceTo(k, [P3(o0, p.lo[0]), P3(o1, p.lo[1]), P3(i1, p.lo[1]), P3(i0, p.lo[0])], [[c.s0, 0], [c.s1, 0], [c.s1, across], [c.s0, across]], pm, tintAt(p.lo[0]), [0, -1, 0]);
    }
  }
  // End faces: what a column has at its end that the next one has not.
  const at = (c: Column, end: 0 | 1): [number, number][] => c.pieces.map((p) => [p.lo[end], p.hi[end]] as [number, number]).sort((a, b) => a[0] - b[0]);
  const cap = (s: number, ranges: [number, number][], want: number[], tint: Tint, mat: number, g: number, top: number) => {
    const o = O(s), i = I(s), across = Math.hypot(o[0] - i[0], o[1] - i[1]);
    for (const [y0, y1] of ranges) {
      if (y1 - y0 < 0.002) continue;
      const t = (y: number) => aged(site, tint, y, g, top);
      faceTo(k, [P3(o, y0), P3(o, y1), P3(i, y1), P3(i, y0)], [[0, y0], [0, y1], [across, y1], [across, y0]], mat, [t(y0), t(y1), t(y1), t(y0)], want);
    }
  };
  const back = along.map((v) => -v);
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i], prev = cols[i - 1], next = cols[i + 1];
    let left = at(c, 0), right = at(c, 1);
    if (prev) for (const [a, b] of at(prev, 1)) left = minus(left, a, b);
    else left = left.flatMap(([a, b]) => (b > (w.capA ?? -Infinity) ? [[Math.max(a, w.capA ?? -Infinity), b] as [number, number]] : []));
    if (next) for (const [a, b] of at(next, 0)) right = minus(right, a, b);
    else right = right.flatMap(([a, b]) => (b > (w.capB ?? -Infinity) ? [[Math.max(a, w.capB ?? -Infinity), b] as [number, number]] : []));
    cap(c.s0, left, back, c.tint, c.mat, c.ground, c.top);
    cap(c.s1, right, along, c.tint, c.mat, c.ground, c.top);
  }
}

/** Twice the signed area of a polygon in plan (x, z): positive when it runs one way round, negative the other. */
function area2(pts: readonly P2[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; }
  return a;
}

/** The polygon moved in by `d` at every edge (out for negative d), its corners mitred. */
export function inset(pts: readonly P2[], d: number): P2[] {
  const turn = area2(pts) > 0 ? 1 : -1, n = pts.length;
  const normal = (i: number): P2 => {
    const p = pts[i], q = pts[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    // Inward: left of the way round for one turn, right for the other.
    return [(-(q[1] - p[1]) / l) * turn, ((q[0] - p[0]) / l) * turn];
  };
  return pts.map((p, i) => {
    const a = normal((i + n - 1) % n), b = normal(i), dot = a[0] * b[0] + a[1] * b[1];
    const k = d / Math.max(0.2, 1 + dot);
    return [p[0] + (a[0] + b[0]) * k, p[1] + (a[1] + b[1]) * k] as P2;
  });
}

/** A ring of walls round a polygon, `thick` deep (inwards), its corners mitred: one WallSpec per side, completed by `each`. */
export function wallRing(pts: readonly P2[], thick: number, each: (i: number, len: number) => Omit<WallSpec, 'a' | 'b' | 'ia' | 'ib'>): WallSpec[] {
  const inner = inset(pts, thick), n = pts.length;
  return pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    return { a: p, b: q, ia: inner[i], ib: inner[(i + 1) % n], ...each(i, Math.hypot(q[0] - p[0], q[1] - p[1])) };
  });
}

/** A free-standing wall along a line, `thick` deep to its right (looking from a to b). */
export function line(a: P2, b: P2, thick: number, spec: Omit<WallSpec, 'a' | 'b' | 'ia' | 'ib'>): WallSpec {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / l * thick, nz = (b[0] - a[0]) / l * thick;
  return { a, b, ia: [a[0] - nx, a[1] - nz], ib: [b[0] - nx, b[1] - nz], ...spec };
}

/** A polygon's floor (or ceiling, facing down), flat at y; a fan from its first corner (convex polygons). */
export function floorOf(k: MeshKit, pts: readonly P2[], y: number, mat: number, tint: Tint, up = true): void {
  for (let i = 1; i + 1 < pts.length; i++) {
    const a = pts[0], b = pts[i], c = pts[i + 1];
    const quad = [[a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [c[0], y, c[1]]];
    faceTo(k, quad, [[a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [c[0], c[1]]], mat, tint, [0, up ? 1 : -1, 0]);
  }
}

/**
 * A solid with straight sides over a polygon (a pier's cutwater, a buttress, a plinth, a block): from its foot (null:
 * FOOT into the ground under each corner) up to `top`, and closed there by a flat top or a pyramid rising `apex`.
 * Sides listed in `open` are left out (pressed against a wall).
 */
export function prism(site: Site, pts: readonly P2[], base: number | null, top: number, mat: number, tint: Tint, o: { open?: readonly number[]; apex?: number; topMat?: number; topTint?: Tint } = {}): void {
  const { k, ground } = site, n = pts.length, c = centroid(pts);
  const g = Math.min(...pts.map((p) => ground(p[0], p[1])));
  let u = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n], l = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (!o.open?.includes(i)) {
      const b0 = base ?? ground(p[0], p[1]) - FOOT, b1 = base ?? ground(q[0], q[1]) - FOOT;
      const want = [(p[0] + q[0]) / 2 - c[0], 0, (p[1] + q[1]) / 2 - c[1]];
      const t = (y: number) => aged(site, tint, y, g, top);
      faceTo(k, [[p[0], b0, p[1]], [p[0], top, p[1]], [q[0], top, q[1]], [q[0], b1, q[1]]], [[u, b0], [u, top], [u + l, top], [u + l, b1]], mat, [t(b0), t(top), t(top), t(b1)], want);
    }
    u += l;
  }
  const tm = o.topMat ?? mat, tt = o.topTint ?? aged(site, tint, top, g, top);
  if (o.apex) spire(k, pts, top, top + o.apex, tm, tt, false);
  else floorOf(k, pts, top, tm, tt);
}

export function centroid(pts: readonly P2[]): P2 {
  let x = 0, z = 0;
  for (const p of pts) { x += p[0]; z += p[1]; }
  return [x / pts.length, z / pts.length];
}

/** A pyramid or cone over a polygon from its eaves at `eave` to its apex; `under` closes the eaves from below. */
export function spire(k: MeshKit, pts: readonly P2[], eave: number, apex: number, mat: number, tint: Tint, under = true): void {
  const c = centroid(pts), top = [c[0], apex, c[1]];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const mx = (p[0] + q[0]) / 2 - c[0], mz = (p[1] + q[1]) / 2 - c[1];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]), rise = apex - eave, slant = Math.hypot(Math.hypot(mx, mz), rise);
    faceTo(k, [[p[0], eave, p[1]], [q[0], eave, q[1]], top, top], [[0, 0], [l, 0], [l / 2, slant], [l / 2, slant]], mat, tint, [mx, (Math.sign(rise) * Math.hypot(mx, mz) ** 2) / Math.max(0.1, Math.abs(rise)), mz]);
  }
  if (under) floorOf(k, pts, eave, mat, tint, apex < eave);
}

/** The flat band between two rings of one polygon (outer and inner, corner for corner) at y, facing up or down. */
export function annulus(k: MeshKit, outer: readonly P2[], inner: readonly P2[], y: number, mat: number, tint: Tint, up: boolean): void {
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length, a = outer[i], b = outer[j], c = inner[j], d = inner[i];
    faceTo(k, [[a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], [d[0], y, d[1]]], [[a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [d[0], d[1]]], mat, tint, [0, up ? 1 : -1, 0]);
  }
}

/** A rectangle in plan from its centre, half-sizes along and across a direction (yaw: the angle of `along` from +x toward +z). */
export function rect(cx: number, cz: number, hx: number, hz: number, yaw = 0): P2[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (u: number, v: number): P2 => [cx + u * c - v * s, cz + u * s + v * c];
  return [P(-hx, -hz), P(hx, -hz), P(hx, hz), P(-hx, hz)];
}

/** A regular polygon in plan (a round tower's n sides, an octagon). */
export function roundPts(cx: number, cz: number, r: number, n: number, turn = 0): P2[] {
  return Array.from({ length: n }, (_, i) => { const a = turn + (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cz + Math.sin(a) * r] as P2; });
}

/**
 * A gable roof over a rectangle (centre, half-length along yaw, half-width across): two slopes from the eaves at
 * `eave` up to the ridge, the gable ends left open (the walls' own gables close them), the eaves overhanging.
 */
export function gable(k: MeshKit, cx: number, cz: number, hx: number, hz: number, yaw: number, eave: number, ridge: number, mat: number, tint: Tint, over = 0.5): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (u: number, v: number, y: number) => [cx + u * c - v * s, y, cz + u * s + v * c];
  const L = hx + over, W = hz + over, drop = ((ridge - eave) / hz) * over, slant = Math.hypot(W, ridge - eave + drop);
  for (const side of [-1, 1]) {
    const q = [P(-L, side * W, eave - drop), P(L, side * W, eave - drop), P(L, 0, ridge), P(-L, 0, ridge)];
    const n = [-s * side * (ridge - eave), hz, c * side * (ridge - eave)];
    faceTo(k, q, [[-L, 0], [L, 0], [L, slant], [-L, slant]], mat, tint, n);
    faceTo(k, q, [[-L, 0], [L, 0], [L, slant], [-L, slant]], mat, scaleDown(tint), [-n[0], -n[1], -n[2]]);
  }
}
const scaleDown = (t: Tint): Tint => [Math.round(t[0] * 0.55), Math.round(t[1] * 0.55), Math.round(t[2] * 0.55)];

/** A flight of steps from a (at height y0) to b (at y1), `half` wide each side, each step a block on what is under it. */
export function steps(site: Site, a: P2, b: P2, y0: number, y1: number, half: number, mat: number, tint: Tint, base: number | null = null): void {
  const rise = y1 - y0, n = Math.max(1, Math.round(Math.abs(rise) / 0.3)), len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len, vx = -uz * half, vz = ux * half;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, y = y0 + rise * (rise > 0 ? t1 : t0);
    const p0: P2 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0], p1: P2 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
    // Each block runs on under the next (no gaps), and down to the foot.
    const back: P2 = rise > 0 ? p0 : [p0[0] - ux * 0.0, p0[1] - uz * 0.0];
    prism(site, [[back[0] - vx, back[1] - vz], [p1[0] - vx, p1[1] - vz], [p1[0] + vx, p1[1] + vz], [back[0] + vx, back[1] + vz]], base, y, mat, tint);
  }
}

/** Fallen stones round (x, z) within r: n of them, from big blocks to small, each lying on the land. */
export function rubble(site: Site, x: number, z: number, r: number, n: number, mat: number, tint: Tint, size = 1): void {
  const { k, rng, ground } = site;
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, Math.PI * 2), d = r * Math.sqrt(rng.float()), big = rng.chance(0.25) ? rng.range(1, 1.6) : rng.range(0.35, 0.9);
    const sx = big * size * rng.range(0.8, 1.4), sy = big * size * rng.range(0.45, 0.8), sz = big * size * rng.range(0.7, 1.1);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    const t = aged(site, tint, 0.4, 0, 0.5);
    k.onGround(ground, () => k.stone(px, 0, pz, sx, sy, sz, rng.range(0, Math.PI), mat, t, rng, 0.06, 0.25), 0.12);
  }
}

/** A box (a beam, a post, a plank) from a to b in 3D, `w` wide and `h` deep, its long side along a to b. */
export function beam(k: MeshKit, a: readonly number[], b: readonly number[], w: number, h: number, mat: number, tint: Tint): void {
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1;
  const u = d.map((v) => v / l);
  // Two axes across the beam: one level (or x when the beam is upright), one square to both.
  let s = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [-u[2], 0, u[0]];
  const sl = Math.hypot(s[0], s[1], s[2]); s = s.map((v) => v / sl);
  const t = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
  const P = (e: readonly number[], i: number, j: number) => [e[0] + s[0] * i * w / 2 + t[0] * j * h / 2, e[1] + s[1] * i * w / 2 + t[1] * j * h / 2, e[2] + s[2] * i * w / 2 + t[2] * j * h / 2];
  const sides: [number, number, number, number][] = [[1, 1, 1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1], [1, -1, -1, -1]];
  for (const [i0, j0, i1, j1] of sides) {
    const want = [s[0] * (i0 + i1) + t[0] * (j0 + j1), s[1] * (i0 + i1) + t[1] * (j0 + j1), s[2] * (i0 + i1) + t[2] * (j0 + j1)];
    faceTo(k, [P(a, i0, j0), P(b, i0, j0), P(b, i1, j1), P(a, i1, j1)], [[0, 0], [l, 0], [l, w], [0, w]], mat, tint, want);
  }
  faceTo(k, [P(a, -1, -1), P(a, 1, -1), P(a, 1, 1), P(a, -1, 1)], [[0, 0], [w, 0], [w, h], [0, h]], mat, tint, u.map((v) => -v));
  faceTo(k, [P(b, -1, -1), P(b, 1, -1), P(b, 1, 1), P(b, -1, 1)], [[0, 0], [w, 0], [w, h], [0, h]], mat, tint, u);
}
