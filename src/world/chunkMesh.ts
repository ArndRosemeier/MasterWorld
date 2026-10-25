/**
 * Terrain chunk meshes (pure data, built in workers): a square of `segs × segs` quads with a skirt around
 * its edge that hides cracks between chunks of different detail. Every chunk shares one index buffer.
 */
import { srgbToLinear, clamp } from '@futuremagic/core';
import { SURFACES } from '../setting/contract';
import type { Terrain } from './terrain';
import { canopySampler, type Canopy } from './canopy';

export interface ChunkSpec {
  /** World position of the chunk's minimum corner. */
  x0: number;
  z0: number;
  size: number;
  segs: number;
}

export interface ChunkMesh {
  /** Local positions (relative to x0, 0, z0), grid first, then the skirt. */
  position: Float32Array;
  normal: Float32Array;
  /** Linear RGB ground colour per vertex (biome tint). */
  color: Float32Array;
  /** Surface weights per vertex, 4 per vertex in SURFACES order (they sum to 1). */
  surface: Float32Array;
  /** The woods from afar per vertex (world/canopy.ts): crown cover, tree height, spacing, conifer share. */
  canopy: Float32Array;
  minY: number;
  maxY: number;
}

export const vertexCount = (segs: number): number => (segs + 1) * (segs + 1) + 4 * segs;

/** The triangle list shared by every chunk of `segs` (grid, then skirt walls). */
export function chunkIndex(segs: number): Uint32Array {
  const n = segs + 1, out: number[] = [];
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    out.push(a, c, b, b, c, d);
  }
  // The border walked counter-clockwise seen from above, as grid indices.
  const ring = borderRing(segs);
  const base = n * n;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k], b = ring[(k + 1) % ring.length];
    const sa = base + k, sb = base + ((k + 1) % ring.length);
    out.push(a, b, sa, b, sb, sa);
  }
  return new Uint32Array(out);
}

function borderRing(segs: number): number[] {
  const n = segs + 1, ring: number[] = [];
  for (let i = 0; i < segs; i++) ring.push(i); // z = 0 edge, x rising
  for (let j = 0; j < segs; j++) ring.push(j * n + segs); // x = max edge
  for (let i = segs; i > 0; i--) ring.push(segs * n + i); // z = max edge, x falling
  for (let j = segs; j > 0; j--) ring.push(j * n); // x = 0 edge
  return ring;
}

/**
 * The ground's look at a point, for any mesh drawn with the terrain material: writes the biome's linear
 * ground colour and its surface weights (one-hot, SURFACES order) at vertex `v` of `color` and `surface`.
 */
export function groundLook(t: Terrain): (x: number, z: number, color: Float32Array, surface: Float32Array, v: number) => void {
  const lin = t.biomes.map((b) => [srgbToLinear(((b.ground >> 16) & 255) / 255), srgbToLinear(((b.ground >> 8) & 255) / 255), srgbToLinear((b.ground & 255) / 255)]);
  const surf = t.biomes.map((b) => SURFACES.indexOf(b.surface));
  return (x, z, color, surface, v) => {
    const b = clamp(t.biomeAt(x, z), 0, lin.length - 1), c = lin[b];
    color[v * 3] = c[0]; color[v * 3 + 1] = c[1]; color[v * 3 + 2] = c[2];
    surface.fill(0, v * 4, v * 4 + 4);
    surface[v * 4 + surf[b]] = 1;
  };
}

export function buildChunk(t: Terrain, spec: ChunkSpec): ChunkMesh {
  const { x0, z0, size, segs } = spec;
  const n = segs + 1, step = size / segs;
  // Heights with one extra ring, so normals on the edge match the neighbour's.
  const m = n + 2;
  const h = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) h[j * m + i] = t.height(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const vc = vertexCount(segs);
  const position = new Float32Array(vc * 3), normal = new Float32Array(vc * 3), color = new Float32Array(vc * 3);
  const surface = new Float32Array(vc * 4), canopy = new Float32Array(vc * 4);
  const look = groundLook(t), woods = canopySampler(t), c: Canopy = { cover: 0, height: 0, spacing: 0, conifer: 0 };
  let minY = Infinity, maxY = -Infinity;
  // Biome colour on a coarser grid (it varies over kilometres), blended per vertex.
  const cstep = Math.max(1, Math.round(segs / 8));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = j * n + i, y = h[(j + 1) * m + i + 1];
    position[v * 3] = i * step;
    position[v * 3 + 1] = y;
    position[v * 3 + 2] = j * step;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    const dx = h[(j + 1) * m + i + 2] - h[(j + 1) * m + i];
    const dz = h[(j + 2) * m + i + 1] - h[j * m + i + 1];
    const nx = -dx, ny = 2 * step, nz = -dz, l = Math.hypot(nx, ny, nz);
    normal[v * 3] = nx / l;
    normal[v * 3 + 1] = ny / l;
    normal[v * 3 + 2] = nz / l;
    if (i % cstep === 0 && j % cstep === 0) {
      look(x0 + i * step, z0 + j * step, color, surface, v);
      woods(x0 + i * step, z0 + j * step, c);
      canopy.set([c.cover, c.height, c.spacing, c.conifer], v * 4);
    }
  }
  // Fill colours and surfaces between the coarse samples bilinearly.
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (i % cstep === 0 && j % cstep === 0) continue;
    const i0 = Math.floor(i / cstep) * cstep, j0 = Math.floor(j / cstep) * cstep;
    const i1 = Math.min(segs, i0 + cstep), j1 = Math.min(segs, j0 + cstep);
    const fx = i1 === i0 ? 0 : (i - i0) / (i1 - i0), fz = j1 === j0 ? 0 : (j - j0) / (j1 - j0);
    const v = j * n + i;
    const w00 = (1 - fx) * (1 - fz), w10 = fx * (1 - fz), w01 = (1 - fx) * fz, w11 = fx * fz;
    const v00 = j0 * n + i0, v10 = j0 * n + i1, v01 = j1 * n + i0, v11 = j1 * n + i1;
    for (const [arr, d] of [[color, 3], [surface, 4], [canopy, 4]] as const) {
      for (let k = 0; k < d; k++) arr[v * d + k] = arr[v00 * d + k] * w00 + arr[v10 * d + k] * w10 + arr[v01 * d + k] * w01 + arr[v11 * d + k] * w11;
    }
  }
  // Skirt: the border dropped by a depth that grows with the chunk's size.
  const drop = Math.max(2, step * 1.5);
  const ring = borderRing(segs), base = n * n;
  for (let k = 0; k < ring.length; k++) {
    const g = ring[k], v = base + k;
    position[v * 3] = position[g * 3];
    position[v * 3 + 1] = position[g * 3 + 1] - drop;
    position[v * 3 + 2] = position[g * 3 + 2];
    for (let c = 0; c < 3; c++) { normal[v * 3 + c] = normal[g * 3 + c]; color[v * 3 + c] = color[g * 3 + c]; }
    for (let c = 0; c < 4; c++) { surface[v * 4 + c] = surface[g * 4 + c]; canopy[v * 4 + c] = canopy[g * 4 + c]; }
  }
  return { position, normal, color, surface, canopy, minY: minY - drop, maxY };
}
