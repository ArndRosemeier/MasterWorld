/**
 * Z-fighting found in the mesh data itself (pure): two triangles that face the same way, lie in one plane and
 * overlap draw over each other with nothing to choose between them, so the picture flickers between the two
 * as the camera moves. The depth buffer is reversed and float (stage renderer), so faces even a few
 * millimetres apart are drawn right; only faces in one plane fight. Faces turned away from each other in one
 * plane do not (the building shader draws front faces only).
 *
 * `zFights` scans a mesh (positions and an index, as the building mesh format has them) and lists every such
 * pair with where it is and how much of them overlaps, so a test can hold a generator to none and a report can
 * list them for the whole world.
 */

/**
 * Two triangles of a mesh in one plane, facing the same way and overlapping: their numbers (index / 3), the area
 * they share (m²), its middle. `same`: both look alike there (one material, tint and texture place: a face drawn
 * twice, which shows nothing). `hidden`: no camera sees the patch: it lies inside a closed solid of the mesh (a
 * wall's end inside the next wall), pressed against another face, or in the ground or facing down onto it. Only a
 * fight neither same nor hidden flickers on screen.
 */
export interface ZFight {
  readonly a: number;
  readonly b: number;
  readonly area: number;
  readonly at: readonly [number, number, number];
  readonly normal: readonly [number, number, number];
  readonly same: boolean;
  readonly hidden: boolean;
}

/** A mesh to scan: positions and an index; with its look (the building mesh format) faces drawn twice alike are told apart. */
export interface ZMesh {
  readonly position: ArrayLike<number>;
  readonly index?: ArrayLike<number> | null;
  readonly uv?: ArrayLike<number>;
  readonly mat?: ArrayLike<number>;
  readonly tint?: ArrayLike<number>;
}

export interface ZFightOptions {
  /** Faces closer than this (m) count as in one plane. */
  readonly gap?: number;
  /** Overlaps smaller than this (m²) are let be: a sliver along a shared edge, not a patch that flickers. */
  readonly minArea?: number;
  /**
   * The land (or a dungeon's floor) under a point of the mesh in its frame, the top of what is below `y`; null
   * none: a patch in the ground, or facing down onto it, is hidden.
   */
  readonly ground?: (x: number, z: number, y: number) => number | null;
}

/** Normals closer than this (1 − cos) count as facing the same way: about half a degree. */
const PARALLEL = 4e-5;
/** A face this close in front of a patch (m) covers it. */
const PRESSED = 5e-3;
/** The grid the triangles are sorted into, metres. */
const CELL = 2;

export function zFights(mesh: ZMesh, opts: ZFightOptions = {}): ZFight[] {
  const { position } = mesh, index = mesh.index ?? null;
  const gap = opts.gap ?? 1e-3, minArea = opts.minArea ?? 1e-3;
  const tris = index ? index.length / 3 : position.length / 9;
  const vi = (t: number, k: number) => (index ? index[t * 3 + k] : t * 3 + k);
  // Each triangle's corners, unit normal, plane offset and box.
  const P = new Float64Array(tris * 9), N = new Float64Array(tris * 3), D = new Float64Array(tris), ok = new Uint8Array(tris);
  const cells = new Map<string, number[]>();
  for (let t = 0; t < tris; t++) {
    for (let k = 0; k < 3; k++) for (let c = 0; c < 3; c++) P[t * 9 + k * 3 + c] = position[vi(t, k) * 3 + c];
    const o = t * 9;
    const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
    const wx = P[o + 6] - P[o], wy = P[o + 7] - P[o + 1], wz = P[o + 8] - P[o + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
    if (l / 2 < minArea * 0.25) continue;
    N[t * 3] = nx / l; N[t * 3 + 1] = ny / l; N[t * 3 + 2] = nz / l;
    D[t] = (nx * P[o] + ny * P[o + 1] + nz * P[o + 2]) / l;
    ok[t] = 1;
    const lo = [0, 1, 2].map((c) => Math.floor(Math.min(P[o + c], P[o + 3 + c], P[o + 6 + c]) / CELL));
    const hi = [0, 1, 2].map((c) => Math.floor(Math.max(P[o + c], P[o + 3 + c], P[o + 6 + c]) / CELL));
    for (let x = lo[0]; x <= hi[0]; x++) for (let y = lo[1]; y <= hi[1]; y++) for (let z = lo[2]; z <= hi[2]; z++) {
      const key = `${x},${y},${z}`;
      let list = cells.get(key);
      if (!list) cells.set(key, (list = []));
      list.push(t);
    }
  }
  const out: ZFight[] = [], seen = new Set<number>();
  for (const list of cells.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const dot = N[a * 3] * N[b * 3] + N[a * 3 + 1] * N[b * 3 + 1] + N[a * 3 + 2] * N[b * 3 + 2];
      if (dot < 1 - PARALLEL || Math.abs(D[a] - D[b]) > gap * 4 + 0.05) continue;
      const pair = a < b ? a * tris + b : b * tris + a;
      if (seen.has(pair)) continue;
      seen.add(pair);
      const f = overlap(P, N, D, a, b, gap);
      if (!f || f.area < minArea) continue;
      const same = alike(mesh, vi, P, a, b, f.at);
      out.push({ a: Math.min(a, b), b: Math.max(a, b), ...f, same, hidden: !same && hidden(P, N, ok, cells, f.at, f.normal, opts.ground) });
    }
  }
  return out.sort((p, q) => p.a - q.a || p.b - q.b);
}

/** The fights that show: not drawn twice alike, not inside a solid. */
export const seenFights = (fights: readonly ZFight[]): ZFight[] => fights.filter((f) => !f.same && !f.hidden);

/** Barycentric weights of `p` in triangle t (in its plane). */
function weights(P: Float64Array, t: number, p: readonly number[]): [number, number, number] {
  const o = t * 9, v0 = [P[o + 3] - P[o], P[o + 4] - P[o + 1], P[o + 5] - P[o + 2]], v1 = [P[o + 6] - P[o], P[o + 7] - P[o + 1], P[o + 8] - P[o + 2]];
  const v2 = [p[0] - P[o], p[1] - P[o + 1], p[2] - P[o + 2]];
  const inner = (x: number[], y: number[]) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  const d00 = inner(v0, v0), d01 = inner(v0, v1), d11 = inner(v1, v1), d20 = inner(v2, v0), d21 = inner(v2, v1), den = d00 * d11 - d01 * d01 || 1;
  const v = (d11 * d20 - d01 * d21) / den, w = (d00 * d21 - d01 * d20) / den;
  return [1 - v - w, v, w];
}

/** Do triangles a and b look alike at p: one material, tints within a step, the texture in one place? Without a look: no. */
function alike(m: ZMesh, vi: (t: number, k: number) => number, P: Float64Array, a: number, b: number, p: readonly number[]): boolean {
  if (!m.uv && !m.mat && !m.tint) return false;
  const wa = weights(P, a, p), wb = weights(P, b, p);
  const blend = (arr: ArrayLike<number>, n: number, t: number, w: readonly number[], c: number) => w[0] * arr[vi(t, 0) * n + c] + w[1] * arr[vi(t, 1) * n + c] + w[2] * arr[vi(t, 2) * n + c];
  if (m.mat) for (let k = 0; k < 3; k++) if (m.mat[vi(a, k)] !== m.mat[vi(a, 0)] || m.mat[vi(b, k)] !== m.mat[vi(a, 0)]) return false;
  if (m.tint) for (let c = 0; c < 3; c++) if (Math.abs(blend(m.tint, 3, a, wa, c) - blend(m.tint, 3, b, wb, c)) > 2) return false;
  if (m.uv) for (let c = 0; c < 2; c++) if (Math.abs(blend(m.uv, 2, a, wa, c) - blend(m.uv, 2, b, wb, c)) > 2e-3) return false;
  return true;
}

/**
 * Is the point p (a patch facing n) out of every camera's sight? In the ground, or facing down onto it; pressed
 * against another face (one lies within a few millimetres in front of it); or inside a closed solid of the mesh:
 * rays from just in front of it, straight out and slanted four ways, each meet the back of a face first (the
 * solid's inside), none gets out or meets a face's front.
 */
function hidden(P: Float64Array, N: Float64Array, ok: Uint8Array, cells: Map<string, number[]>, p: readonly number[], n: readonly number[], ground?: (x: number, z: number, y: number) => number | null): boolean {
  const g = ground?.(p[0], p[2], p[1] + 0.05);
  if (g != null && (p[1] < g - 0.01 || (n[1] < -0.7 && p[1] < g + 0.01))) return true;
  const t1 = Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [0, -n[2], n[1]], l = Math.hypot(t1[0], t1[1], t1[2]);
  const u = t1.map((v) => v / l), v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const from = [p[0] + n[0] * 3e-3, p[1] + n[1] * 3e-3, p[2] + n[2] * 3e-3];
  const dirs = [n, ...[u, v].flatMap((t) => [1, -1].map((sg) => n.map((c, i) => (c + sg * t[i]) * Math.SQRT1_2)))];
  if (firstHit(P, ok, cells, from, n, PRESSED) >= 0 || backed(P, N, ok, cells, from, n)) return true;
  return dirs.every((d) => {
    const hit = firstHit(P, ok, cells, from, d, 40);
    return hit >= 0 && N[hit * 3] * d[0] + N[hit * 3 + 1] * d[1] + N[hit * 3 + 2] * d[2] > 0;
  });
}

/**
 * Does a face turned the other way lie in the patch's plane right behind it (a crate's foot on the floor, a
 * beam's end against a wall)? Then the patch shows only from the far side of that face, where nothing looks from.
 */
function backed(P: Float64Array, N: Float64Array, ok: Uint8Array, cells: Map<string, number[]>, from: readonly number[], n: readonly number[]): boolean {
  const back = [-n[0], -n[1], -n[2]], key = (k: number) => [0, 1, 2].map((c) => Math.floor((from[c] - n[c] * k) / CELL)).join(',');
  // The cells just in front and just behind (the plane may be a cell's bound).
  const list = new Set([...(cells.get(key(0)) ?? []), ...(cells.get(key(6e-3)) ?? [])]);
  for (const t of list) {
    if (!ok[t] || N[t * 3] * n[0] + N[t * 3 + 1] * n[1] + N[t * 3 + 2] * n[2] > -1 + PARALLEL) continue;
    const h = rayTri(P, t, from, back);
    if (h > 0 && h < 3e-3 + 2e-3) return true;
  }
  return false;
}

/** The first triangle a ray from `o` along `d` (unit) meets within `far` metres, walking the grid cell by cell; −1 none. */
function firstHit(P: Float64Array, ok: Uint8Array, cells: Map<string, number[]>, o: readonly number[], d: readonly number[], far: number): number {
  let best = -1, bestT = far;
  const tested = new Set<number>();
  // Steps of a cell's width along the ray (a triangle in any cell the step passes is tried once).
  const step = CELL * 0.5;
  for (let s = 0; s * step < bestT + CELL; s++) {
    const x = o[0] + d[0] * s * step, y = o[1] + d[1] * s * step, z = o[2] + d[2] * s * step;
    const ci = Math.floor(x / CELL), cj = Math.floor(y / CELL), ck = Math.floor(z / CELL);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) for (let dk = -1; dk <= 1; dk++) {
      const list = cells.get(`${ci + di},${cj + dj},${ck + dk}`);
      if (!list) continue;
      for (const t of list) {
        if (!ok[t] || tested.has(t)) continue;
        tested.add(t);
        const h = rayTri(P, t, o, d);
        if (h > 1e-5 && h < bestT) { bestT = h; best = t; }
      }
    }
  }
  return best;
}

/** Möller–Trumbore: how far along the ray triangle t is met (either side), −1 if not. */
function rayTri(P: Float64Array, t: number, o: readonly number[], d: readonly number[]): number {
  const q = t * 9;
  const e1 = [P[q + 3] - P[q], P[q + 4] - P[q + 1], P[q + 5] - P[q + 2]], e2 = [P[q + 6] - P[q], P[q + 7] - P[q + 1], P[q + 8] - P[q + 2]];
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const a = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(a) < 1e-12) return -1;
  const f = 1 / a, s = [o[0] - P[q], o[1] - P[q + 1], o[2] - P[q + 2]];
  const uu = f * (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]);
  if (uu < 0 || uu > 1) return -1;
  const qq = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const vv = f * (d[0] * qq[0] + d[1] * qq[1] + d[2] * qq[2]);
  if (vv < 0 || uu + vv > 1) return -1;
  return f * (e2[0] * qq[0] + e2[1] * qq[1] + e2[2] * qq[2]);
}

/** The patch two near-parallel triangles share, if they lie within `gap` of each other over all of it. */
function overlap(P: Float64Array, N: Float64Array, D: Float64Array, a: number, b: number, gap: number): { area: number; at: [number, number, number]; normal: [number, number, number] } | null {
  // A frame in a's plane.
  const n = [N[a * 3], N[a * 3 + 1], N[a * 3 + 2]];
  const o = [P[a * 9], P[a * 9 + 1], P[a * 9 + 2]];
  const e1 = [P[a * 9 + 3] - o[0], P[a * 9 + 4] - o[1], P[a * 9 + 5] - o[2]];
  const l1 = Math.hypot(e1[0], e1[1], e1[2]);
  e1[0] /= l1; e1[1] /= l1; e1[2] /= l1;
  const e2 = [n[1] * e1[2] - n[2] * e1[1], n[2] * e1[0] - n[0] * e1[2], n[0] * e1[1] - n[1] * e1[0]];
  const flat = (t: number): number[][] => [0, 1, 2].map((k) => {
    const q = [P[t * 9 + k * 3] - o[0], P[t * 9 + k * 3 + 1] - o[1], P[t * 9 + k * 3 + 2] - o[2]];
    return [q[0] * e1[0] + q[1] * e1[1] + q[2] * e1[2], q[0] * e2[0] + q[1] * e2[1] + q[2] * e2[2]];
  });
  // Both wound counter-clockwise in this frame (they face the same way, so both are, or both are not).
  const ccw = (poly: number[][]) => (signedArea(poly) < 0 ? poly.reverse() : poly);
  let poly = ccw(flat(b));
  const clip = ccw(flat(a));
  for (let k = 0; k < 3 && poly.length > 2; k++) poly = clipBy(poly, clip[k], clip[(k + 1) % 3]);
  if (poly.length < 3) return null;
  const area = signedArea(poly);
  if (area <= 0) return null;
  // How far b's plane stands from a's over the shared patch.
  const nb = [N[b * 3], N[b * 3 + 1], N[b * 3 + 2]], cos = nb[0] * n[0] + nb[1] * n[1] + nb[2] * n[2];
  let cx = 0, cy = 0;
  for (const [u, v] of poly) {
    const p = [o[0] + e1[0] * u + e2[0] * v, o[1] + e1[1] * u + e2[1] * v, o[2] + e1[2] * u + e2[2] * v];
    const h = (D[b] - (nb[0] * p[0] + nb[1] * p[1] + nb[2] * p[2])) / cos;
    if (Math.abs(h) > gap) return null;
    cx += u; cy += v;
  }
  cx /= poly.length; cy /= poly.length;
  const at: [number, number, number] = [o[0] + e1[0] * cx + e2[0] * cy, o[1] + e1[1] * cx + e2[1] * cy, o[2] + e1[2] * cx + e2[2] * cy];
  return { area, at, normal: [n[0], n[1], n[2]] };
}

function signedArea(poly: number[][]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i], [x1, y1] = poly[(i + 1) % poly.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** The part of a convex polygon left of the edge p → q (Sutherland–Hodgman). */
function clipBy(poly: number[][], p: number[], q: number[]): number[][] {
  // How far each corner stands left of the edge (times its length).
  const ex = q[0] - p[0], ey = q[1] - p[1], left = poly.map((r) => ex * (r[1] - p[1]) - ey * (r[0] - p[0]));
  const out: number[][] = [];
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length, r = poly[i], s = poly[j], sr = left[i], ss = left[j];
    if (sr >= 0) out.push(r);
    if ((sr >= 0) !== (ss >= 0)) {
      const t = sr / (sr - ss);
      out.push([r[0] + (s[0] - r[0]) * t, r[1] + (s[1] - r[1]) * t]);
    }
  }
  return out;
}

/**
 * The fights of a mesh gathered into spots: fights within `near` metres of each other and facing the same way
 * count as one place to fix, with their total area. For a report a person reads.
 */
export function zFightSpots(fights: readonly ZFight[], near = 0.5): { at: readonly [number, number, number]; normal: readonly [number, number, number]; area: number; pairs: number }[] {
  const spots: { at: [number, number, number]; normal: readonly [number, number, number]; area: number; pairs: number }[] = [];
  for (const f of fights) {
    const s = spots.find((p) => p.normal[0] * f.normal[0] + p.normal[1] * f.normal[1] + p.normal[2] * f.normal[2] > 0.99
      && Math.hypot(p.at[0] - f.at[0], p.at[1] - f.at[1], p.at[2] - f.at[2]) < near);
    if (s) { s.area += f.area; s.pairs++; } else spots.push({ at: [...f.at], normal: f.normal, area: f.area, pairs: 1 });
  }
  return spots.sort((p, q) => q.area - p.area);
}
