/**
 * A small mesh kit for built spaces (pure): quads, boxes and cylinders into the building mesh format of
 * @futuremagic/settlement (positions, normals, uv in metres, a material layer and a tint per vertex), so
 * dungeons draw with the town's one building shader.
 */
import type { Rng } from '@futuremagic/core';
import { BuildingMat, type BuildingMesh } from '@futuremagic/settlement';

export type Tint = readonly [number, number, number];

export class MeshKit {
  private p: number[] = [];
  private n: number[] = [];
  private uv: number[] = [];
  private mat: number[] = [];
  private tint: number[] = [];
  private idx: number[] = [];

  get empty(): boolean { return this.idx.length === 0; }
  /** How many vertices so far (smoothFrom from here). */
  get mark(): number { return this.p.length / 3; }

  /**
   * A quad a, b, c, d (counter-clockwise seen from the front), uv from each corner's (u, v) in metres; one
   * tint, or one per corner (grime that fades up a wall).
   */
  quad(a: number[], b: number[], c: number[], d: number[], uv: number[][], mat: number, tint: Tint | readonly Tint[]): void {
    // Across the diagonals: right for a quad that is not flat, and for one with two corners in one (a cone's tip).
    const e1 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], e2 = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.p.length / 3;
    const corner = (i: number): Tint => (typeof tint[0] === 'number' ? tint as Tint : (tint as readonly Tint[])[i]);
    [a, b, c, d].forEach((q, i) => {
      const t = corner(i);
      this.p.push(q[0], q[1], q[2]);
      this.n.push(nx, ny, nz);
      this.uv.push(uv[i][0], uv[i][1]);
      this.mat.push(mat);
      this.tint.push(t[0], t[1], t[2]);
    });
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** A triangle (counter-clockwise seen from the front), uv from x and z. */
  tri(a: number[], b: number[], c: number[], mat: number, tint: Tint): void {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = this.p.length / 3;
    for (const q of [a, b, c]) {
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.uv.push(q[0], q[2]);
      this.mat.push(mat); this.tint.push(tint[0], tint[1], tint[2]);
    }
    this.idx.push(base, base + 1, base + 2);
  }

  /**
   * A vertical wall face from (x0, z0) to (x1, z1), y0 .. y1, facing left of the direction of travel; `lo`
   * and `hi` tint its foot and its top (else `tint` all over).
   */
  wall(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, mat: number, tint: Tint, u0 = 0, lo: Tint = tint, hi: Tint = tint): void {
    if (y1 - y0 < 0.005) return;
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z1], [x1, y0, z1], [[u0, y0], [u0, y1], [u0 + len, y1], [u0 + len, y0]], mat, [lo, hi, hi, lo]);
  }

  /** Triangles as they are: positions, normals, uv (metres), a material and a tint per vertex. */
  append(position: ArrayLike<number>, normal: ArrayLike<number>, uv: ArrayLike<number>, mat: ArrayLike<number>, tint: ArrayLike<number>, index: ArrayLike<number>): void {
    const base = this.p.length / 3;
    for (let i = 0; i < position.length; i++) { this.p.push(position[i]); this.n.push(normal[i]); this.tint.push(tint[i]); }
    for (let i = 0; i < uv.length; i++) this.uv.push(uv[i]);
    for (let i = 0; i < mat.length; i++) this.mat.push(mat[i]);
    for (let i = 0; i < index.length; i++) this.idx.push(base + index[i]);
  }

  /** A horizontal rectangle at height y, facing up (or down). */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean, mat: number, tint: Tint): void {
    if (up) this.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], mat, tint);
    else this.quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], mat, tint);
  }

  /** A box centred at (x, y0 + sy/2, z), turned by yaw about +y. */
  box(x: number, y0: number, z: number, sx: number, sy: number, sz: number, yaw: number, mat: number, tint: Tint): void {
    this.solid(corners(x, y0, z, sx, sy, sz, yaw), sx, sy, sz, mat, tint, tint, 0);
  }

  /**
   * A rough stone about the size of a box centred at (x, y0 + sy/2, z), turned by yaw: each face a 3 by 3
   * grid, the box rounded by `round` (0 a box, 1 a ball) and every point knocked out of true by up to `rough` (m), so
   * it shows facets rather than a crate's flat sides. Darker and damper at its foot (`tint` at its top);
   * its texture runs upright on the sides and is shifted so no two stones match.
   */
  stone(x: number, y0: number, z: number, sx: number, sy: number, sz: number, yaw: number, mat: number, tint: Tint, rng: Rng, rough = 0.07, round = 0.45): void {
    const n = 3, c = Math.cos(yaw), s = Math.sin(yaw), half = [sx / 2, sy / 2, sz / 2], o = rng.range(0, 8);
    const foot: Tint = [Math.round(tint[0] * 0.62), Math.round(tint[1] * 0.66), Math.round(tint[2] * 0.6)];
    // One knock per point of the cube, so faces that share an edge share its points.
    const knocks = new Map<string, number[]>();
    const knocked = (p: number[]): { at: number[]; t: Tint } => {
      const key = p.join(',');
      let k = knocks.get(key);
      if (!k) knocks.set(key, (k = [rng.range(-rough, rough), rng.range(-rough, rough), rng.range(-rough, rough)]));
      const l = Math.hypot(p[0], p[1], p[2]);
      const q = p.map((v, i) => (v * (1 - round) + (v / l) * round) * half[i] + k[i]);
      const lx = q[0], ly = q[1] + half[1], lz = q[2];
      const up = (p[1] + 1) / 2;
      return { at: [x + lx * c + lz * s, y0 + ly, z - lx * s + lz * c], t: foot.map((f, i) => Math.round(f + (tint[i] - f) * up)) as unknown as Tint };
    };
    // Each face: its axis, side, and the two axes its grid runs along (sides: across, then up).
    const faces: [number, number, number, number][] = [[2, 1, 0, 1], [2, -1, 0, 1], [0, 1, 2, 1], [0, -1, 2, 1], [1, 1, 0, 2], [1, -1, 0, 2]];
    for (const [ax, side, u, v] of faces) {
      // The grid's turn (u × v: +z for x,y; −x for z,y; −y for x,z) against the face's outward side.
      const flip = (ax === 2 ? 1 : -1) * side < 0;
      const pt = (i: number, j: number) => {
        const p = [0, 0, 0];
        p[ax] = side; p[u] = -1 + (2 * i) / n; p[v] = -1 + (2 * j) / n;
        return { ...knocked(p), uv: [o + p[u] * half[u], o + p[v] * half[v]] };
      };
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const a = pt(i, j), b = pt(i + 1, j), cc = pt(i + 1, j + 1), d = pt(i, j + 1);
        const q = flip ? [a, d, cc, b] : [a, b, cc, d];
        this.quad(q[0].at, q[1].at, q[2].at, q[3].at, q.map((e) => e.uv), mat, q.map((e) => e.t));
      }
    }
  }

  /** The six faces of a box from its corners (bottom four, then top four); `lo` tints the foot, `hi` the top. */
  private solid(v: number[][], sx: number, sy: number, sz: number, mat: number, lo: Tint, hi: Tint, o: number): void {
    const U = (a: number, b: number) => [[o, o], [o, o + b], [o + a, o + b], [o + a, o]];
    const side = [lo, hi, hi, lo];
    this.quad(v[4], v[7], v[6], v[5], U(sx, sz), mat, hi); // top
    this.quad(v[0], v[1], v[2], v[3], U(sx, sz), mat, lo); // bottom
    this.quad(v[0], v[4], v[5], v[1], U(sy, sx), mat, side); // -z
    this.quad(v[2], v[6], v[7], v[3], U(sy, sx), mat, side); // +z
    this.quad(v[3], v[7], v[4], v[0], U(sy, sz), mat, side); // -x
    this.quad(v[1], v[5], v[6], v[2], U(sy, sz), mat, side); // +x
  }

  /** An upright cylinder (a barrel, a vat, a candle), `bulge` widens its middle. */
  cylinder(x: number, y0: number, z: number, r: number, h: number, seg: number, mat: number, tint: Tint, bulge = 0): void {
    const rings = bulge ? [0, 0.5, 1] : [0, 1];
    const rad = (t: number) => r * (1 + bulge * Math.sin(Math.PI * t));
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      for (let q = 0; q + 1 < rings.length; q++) {
        const t0 = rings[q], t1 = rings[q + 1], r0 = rad(t0), r1 = rad(t1);
        const P = (a: number, rr: number, t: number) => [x + Math.cos(a) * rr, y0 + t * h, z + Math.sin(a) * rr];
        this.quad(P(a0, r0, t0), P(a0, r1, t1), P(a1, r1, t1), P(a1, r0, t0), [[a0 * r, t0 * h], [a0 * r, t1 * h], [a1 * r, t1 * h], [a1 * r, t0 * h]], mat, tint);
      }
      const c = [x, y0 + h, z];
      const p0 = [x + Math.cos(a0) * r, y0 + h, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, y0 + h, z + Math.sin(a1) * r];
      this.tri(c, p1, p0, mat, tint);
    }
  }

  /**
   * A filled sack standing at (x, y0, z): a heavy, lumpy body slumped at the foot, gathered and tied at the
   * neck. `lump(a, t)` (-1..1, around a in radians and up t in 0..1) dents and bulges it.
   */
  sack(x: number, y0: number, z: number, r: number, h: number, mat: number, tint: Tint, lump: (a: number, t: number) => number): void {
    const seg = 16, rings = 10, start = this.p.length / 3;
    // Radius up the sack: wide and settled at the foot, full in the body, drawn in at the neck, a small flare above the tie.
    const prof = (t: number) => t < 0.08 ? 0.75 + 3 * t : t < 0.62 ? 1 - 0.25 * ((t - 0.35) / 0.27) ** 2 : t < 0.86 ? 0.95 - 3.3 * (t - 0.62) : 0.16 + 0.6 * (t - 0.86);
    const P = (a: number, t: number) => {
      const rr = r * prof(t) * (1 + 0.12 * lump(a, t)), yy = y0 + h * t * (1 - 0.08 * Math.max(0, lump(a + 1.7, 0.5)) * t);
      return [x + Math.cos(a) * rr, yy, z + Math.sin(a) * rr];
    };
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      for (let q = 0; q < rings; q++) {
        const t0 = q / rings, t1 = (q + 1) / rings;
        const u0 = a0 * r, u1 = a1 * r;
        this.quad(P(a0, t0), P(a0, t1), P(a1, t1), P(a1, t0), [[u0, t0 * h], [u0, t1 * h], [u1, t1 * h], [u1, t0 * h]], mat, tint);
      }
      this.tri([x, y0 + h, z], P(a1, 1), P(a0, 1), mat, tint);
    }
    this.smoothFrom(start);
    // The cord round the neck.
    this.cylinder(x, y0 + h * 0.84, z, r * 0.24, h * 0.05, 8, mat, [tint[0] * 0.55, tint[1] * 0.5, tint[2] * 0.45]);
  }

  /** Smooth the normals of the vertices from index `start` on: where corners meet, they share one normal. */
  smoothFrom(start: number): void {
    const sum = new Map<string, number[]>();
    const spotOf = (i: number) => `${Math.round(this.p[3 * i] * 1e4)},${Math.round(this.p[3 * i + 1] * 1e4)},${Math.round(this.p[3 * i + 2] * 1e4)}`;
    const n = this.p.length / 3;
    for (let i = start; i < n; i++) {
      const k = spotOf(i), s = sum.get(k) ?? [0, 0, 0];
      s[0] += this.n[3 * i]; s[1] += this.n[3 * i + 1]; s[2] += this.n[3 * i + 2];
      sum.set(k, s);
    }
    for (let i = start; i < n; i++) {
      const s = sum.get(spotOf(i))!, l = Math.hypot(s[0], s[1], s[2]) || 1;
      this.n[3 * i] = s[0] / l; this.n[3 * i + 1] = s[1] / l; this.n[3 * i + 2] = s[2] / l;
    }
  }

  mesh(): BuildingMesh {
    return {
      position: Float32Array.from(this.p), normal: Float32Array.from(this.n), uv: Float32Array.from(this.uv),
      mat: Uint8Array.from(this.mat), tint: Uint8Array.from(this.tint), index: Uint32Array.from(this.idx),
    };
  }
}

/** A box's corners, centred at (x, y0 + sy/2, z) and turned by yaw about +y: the bottom four, then the top four. */
function corners(x: number, y0: number, z: number, sx: number, sy: number, sz: number, yaw: number): number[][] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (u: number, v: number, w: number) => [x + u * c + w * s, y0 + v, z - u * s + w * c];
  const hx = sx / 2, hz = sz / 2;
  return [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz), P(-hx, sy, -hz), P(hx, sy, -hz), P(hx, sy, hz), P(-hx, sy, hz)];
}

/** `base` a little lighter or darker, by up to ±v. */
/** A tint made lighter or darker by `k` (clamped to 0..255). */
export const scaleTint = (t: Tint, k: number): Tint => t.map((c) => Math.max(0, Math.min(255, Math.round(c * k)))) as unknown as Tint;
export const varyTint = (rng: Rng, base: Tint, v: number): Tint => base.map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + rng.range(-v, v)))))) as unknown as Tint;

export { BuildingMat };

/**
 * The cellar's own surfaces, after the town's layers in the building texture array (render/terrain/
 * groundTextures.ts TOWN_LAYERS: the BuildingMats, cobbles 9, trodden earth 10, then these).
 */
export const CellarMat = { Earth: 10, Flagstone: 11, Brick: 12, Boards: 13, Limewash: 14 } as const;

/** The land's own surfaces for what stands out on it (a barrow's stones and turf), after the cellars' layers. */
export const WildMat = { Rock: 15, Grass: 16 } as const;
