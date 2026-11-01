/**
 * Carved rock as a mesh (pure): a grid of signed distances (positive in air) meshed with surface nets
 * (@futuremagic/volume) in cubes, then put into the building format so it draws with the town's one
 * building shader. Each triangle takes one material and texture coordinates projected along the axis it
 * faces most; a vertex is split where its triangles differ in either, so no triangle blends two layers or
 * two projections. A cave's rock (caveRock.ts) and its mouth on the land (caveMouth.ts) are made this way.
 */
import { lerp } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import { PAD, surfaceNets, type Grid } from '@futuremagic/volume';
import { WildMat, type Tint } from './meshKit';

/** Signed distances on a grid (positive in air). */
export interface Field {
  /** The first sample's position. */
  readonly ox: number;
  readonly oy: number;
  readonly oz: number;
  readonly step: number;
  /** Samples per axis. */
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  /** x fastest, then y, then z. */
  readonly d: Float32Array;
}

/** Samples per side of a brick of a `BrickField`. */
export const BRICK = 16;

/**
 * Signed distances on a grid kept in bricks of BRICK³ samples, only where there is anything (a big cave's
 * chambers and ways in a box of solid rock): a missing brick is solid rock throughout.
 */
export interface BrickField extends Omit<Field, 'd'> {
  /** Bricks per axis. */
  readonly bx: number;
  readonly by: number;
  readonly bz: number;
  /** By brick (x fastest, then y, then z); within one, x fastest, then y, then z. Null: solid rock. */
  readonly bricks: (Float32Array | null)[];
}

/** A field, dense or in bricks. */
export type AnyField = Field | BrickField;

/** An empty field in bricks over nx·ny·nz samples (all solid rock). */
export function brickField(ox: number, oy: number, oz: number, step: number, nx: number, ny: number, nz: number): BrickField {
  const bx = Math.ceil(nx / BRICK), by = Math.ceil(ny / BRICK), bz = Math.ceil(nz / BRICK);
  return { ox, oy, oz, step, nx, ny, nz, bx, by, bz, bricks: new Array<Float32Array | null>(bx * by * bz).fill(null) };
}

/** Set a sample of a field in bricks (its brick is made when first needed). */
export function setSample(f: BrickField, i: number, j: number, k: number, v: number): void {
  const b = ((i / BRICK) | 0) + f.bx * (((j / BRICK) | 0) + f.by * ((k / BRICK) | 0));
  let brick = f.bricks[b];
  if (!brick) {
    if (v === -1) return;
    brick = f.bricks[b] = new Float32Array(BRICK * BRICK * BRICK).fill(-1);
  }
  brick[(i % BRICK) + BRICK * ((j % BRICK) + BRICK * (k % BRICK))] = v;
}

/** A sample of a field (inside its grid). */
export function sampleOf(f: AnyField, i: number, j: number, k: number): number {
  if ('d' in f) return f.d[i + f.nx * (j + f.ny * k)];
  const brick = f.bricks[((i / BRICK) | 0) + f.bx * (((j / BRICK) | 0) + f.by * ((k / BRICK) | 0))];
  return brick ? brick[(i % BRICK) + BRICK * ((j % BRICK) + BRICK * (k % BRICK))] : -1;
}

/** Does a field in bricks hold anything but solid rock over samples i0..i1, j0..j1, k0..k1 (dense fields: yes)? */
function anyIn(f: AnyField, i0: number, j0: number, k0: number, i1: number, j1: number, k1: number): boolean {
  if ('d' in f) return true;
  const b = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v / BRICK)));
  for (let z = b(k0, f.bz); z <= b(k1, f.bz); z++) for (let y = b(j0, f.by); y <= b(j1, f.by); y++) for (let x = b(i0, f.bx); x <= b(i1, f.bx); x++) {
    if (f.bricks[x + f.bx * (y + f.by * z)]) return true;
  }
  return false;
}

/** What the rock looks like where: a triangle's material (null: leave it out) by its middle and how much it faces up; a vertex's tint. */
export interface RockLook {
  mat(x: number, y: number, z: number, up: number): number | null;
  /** `up`: how much the vertex's own (smooth) normal faces up. */
  tint(x: number, y: number, z: number, mat: number, up: number): Tint;
}

/** Cells per side of the cubes the field is meshed in. */
const CHUNK = 32;

export function meshField(f: AnyField, look: RockLook): BuildingMesh {
  const n = CHUNK + 2 * PAD + 1;
  const sample = new Float32Array(n * n * n);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], mat: number[] = [], tint: number[] = [], idx: number[] = [];
  for (let cz = 0; cz < f.nz - 1; cz += CHUNK) for (let cy = 0; cy < f.ny - 1; cy += CHUNK) for (let cx = 0; cx < f.nx - 1; cx += CHUNK) {
    if (!anyIn(f, cx - PAD, cy - PAD, cz - PAD, cx + n - PAD, cy + n - PAD, cz + n - PAD)) continue;
    let air = false, rock = false;
    for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gi = cx + i - PAD, gj = cy + j - PAD, gk = cz + k - PAD;
      const v = gi < 0 || gj < 0 || gk < 0 || gi >= f.nx || gj >= f.ny || gk >= f.nz ? -1 : sampleOf(f, gi, gj, gk);
      sample[i + n * (j + n * k)] = v;
      if (v > 0) air = true; else rock = true;
    }
    if (!air || !rock) continue;
    const grid: Grid = { n, d: sample };
    const m = surfaceNets(grid, f.ox + cx * f.step, f.oy + cy * f.step, f.oz + cz * f.step, f.step);
    if (m) add(m.positions, m.normals, m.indices);
  }
  return { position: Float32Array.from(pos), normal: Float32Array.from(nor), uv: Float32Array.from(uv), mat: Uint8Array.from(mat), tint: Uint8Array.from(tint), index: Uint32Array.from(idx) };

  /** One cube's triangles. */
  function add(P: Float32Array, N: Float32Array, I: Uint32Array): void {
    const made = new Map<number, number>();
    const vertex = (v: number, axis: number, m: number): number => {
      const key = (v * 3 + axis) * 256 + m;
      let out = made.get(key);
      if (out !== undefined) return out;
      out = pos.length / 3;
      const x = P[3 * v], y = P[3 * v + 1], z = P[3 * v + 2];
      pos.push(x, y, z);
      nor.push(N[3 * v], N[3 * v + 1], N[3 * v + 2]);
      uv.push(...(axis === 0 ? [z, y] : axis === 1 ? [x, z] : [x, y]));
      mat.push(m);
      tint.push(...look.tint(x, y, z, m, N[3 * v + 1]));
      made.set(key, out);
      return out;
    };
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      const e1 = [P[3 * b] - P[3 * a], P[3 * b + 1] - P[3 * a + 1], P[3 * b + 2] - P[3 * a + 2]];
      const e2 = [P[3 * c] - P[3 * a], P[3 * c + 1] - P[3 * a + 1], P[3 * c + 2] - P[3 * a + 2]];
      const fx = e1[1] * e2[2] - e1[2] * e2[1], fy = e1[2] * e2[0] - e1[0] * e2[2], fz = e1[0] * e2[1] - e1[1] * e2[0];
      const ax = Math.abs(fx), ay = Math.abs(fy), az = Math.abs(fz);
      const axis = ay >= ax && ay >= az ? 1 : ax >= az ? 0 : 2;
      const up = fy / (Math.hypot(fx, fy, fz) || 1);
      const m = look.mat((P[3 * a] + P[3 * b] + P[3 * c]) / 3, (P[3 * a + 1] + P[3 * b + 1] + P[3 * c + 1]) / 3, (P[3 * a + 2] + P[3 * b + 2] + P[3 * c + 2]) / 3, up);
      if (m === null) continue;
      idx.push(vertex(a, axis, m), vertex(b, axis, m), vertex(c, axis, m));
    }
  }
}

/** The field at a point (trilinear); `outside` beyond it. */
export function fieldAt(f: AnyField, x: number, y: number, z: number, outside = -1): number {
  const u = (x - f.ox) / f.step, v = (y - f.oy) / f.step, w = (z - f.oz) / f.step;
  const i = Math.floor(u), j = Math.floor(v), k = Math.floor(w);
  if (i < 0 || j < 0 || k < 0 || i >= f.nx - 1 || j >= f.ny - 1 || k >= f.nz - 1) return outside;
  const a = u - i, b = v - j, c = w - k;
  const at = (p: number, q: number, r: number) => sampleOf(f, p, q, r);
  return lerp(
    lerp(lerp(at(i, j, k), at(i + 1, j, k), a), lerp(at(i, j + 1, k), at(i + 1, j + 1, k), a), b),
    lerp(lerp(at(i, j, k + 1), at(i + 1, j, k + 1), a), lerp(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), a), b),
    c,
  );
}

/** Where on the ground a rock is in a body's way: a raster from (x0, z0), `step` a cell, 1 where it is. */
export interface WalkRaster {
  readonly blocked: Uint8Array;
  readonly x0: number;
  readonly z0: number;
  readonly step: number;
  readonly cols: number;
  readonly rows: number;
}

/** The raster over x0..x1, z0..z1: `inWay(x, z)` at each cell's middle. */
export function walkRaster(x0: number, x1: number, z0: number, z1: number, step: number, inWay: (x: number, z: number) => boolean): WalkRaster {
  const cols = Math.ceil((x1 - x0) / step), rows = Math.ceil((z1 - z0) / step), blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (inWay(x0 + (c + 0.5) * step, z0 + (r + 0.5) * step)) blocked[r * cols + c] = 1;
  return { blocked, x0, z0, step, cols, rows };
}

/** Is a body at (x, z) in the rock's way? (Off the raster: no.) */
export function inWalkRaster(w: WalkRaster, x: number, z: number): boolean {
  const c = Math.floor((x - w.x0) / w.step), r = Math.floor((z - w.z0) / w.step);
  if (c < 0 || r < 0 || c >= w.cols || r >= w.rows) return false;
  return w.blocked[r * w.cols + c] === 1;
}

/**
 * The faces of a crag standing out of the land (a cave's mouth, a hold's rock): none at the field's cut edges
 * (`inside` false), none where it is only the ground (far from the rock's own surface, or level and at the
 * ground), turf where `grass`, bare rock elsewhere.
 */
export function cragMat(
  inside: (x: number, y: number, z: number) => boolean, rock: (x: number, y: number, z: number) => number,
  ground: (x: number, z: number) => number, grass: (x: number, y: number, z: number, up: number) => boolean,
): RockLook['mat'] {
  return (x, y, z, up) => {
    if (!inside(x, y, z) || rock(x, y, z) > 2.4) return null;
    if (up > 0.6 && y < ground(x, z) + 0.35) return null;
    return grass(x, y, z, up) ? WildMat.Grass : WildMat.Rock;
  };
}
