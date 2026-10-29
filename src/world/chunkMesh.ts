/**
 * Terrain chunk meshes (pure data, built in workers): a square of `segs × segs` quads with a skirt around
 * its edge that hides cracks between chunks of different detail. Every chunk shares one index buffer.
 */
import { srgbToLinear, clamp } from '@futuremagic/core';
import { SURFACES } from '../setting/contract';
import type { Terrain } from './terrain';
import { canopySampler, type Canopy } from './canopy';
import { TownGround } from './town';
import { emptyWater, inChannel } from './hydro';

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
  /**
   * How level the ground is around each vertex: the up component of the normal smoothed over a few metres.
   * It changes smoothly from vertex to vertex even across a cliff's edge (where the normal flips between
   * neighbours), so rock, sand and grass meet along smooth lines instead of the mesh's triangles.
   */
  level: Float32Array;
  /** Quads per side it was built with (the worker may build finer than asked: `finerFor`). */
  segs: number;
  minY: number;
  maxY: number;
}

/** Brooks are drawn finer: a chunk this size or smaller with a brook's channel in it is built at twice the segments asked. */
export const BROOK_FINE_SIZE = 128;
/** Sampling step when looking for a brook's channel in a chunk, m (the narrowest channel is 2 m wide). */
const BROOK_LOOK = 2;

/**
 * The segments chunk `spec` is built with: twice those asked where a brook's channel crosses a near chunk.
 * A brook is only 2 to 7 m wide, so on the near chunks' 2 m grid its channel came out as a chain of big
 * triangles (the water fills only the cells whose corners dip in); 1 m vertices follow its banks.
 */
export function finerFor(t: Terrain, spec: ChunkSpec): number {
  if (spec.size > BROOK_FINE_SIZE) return spec.segs;
  const w = emptyWater(), n = Math.ceil(spec.size / BROOK_LOOK);
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    if (inChannel(t.hydro.brookAt(spec.x0 + i * BROOK_LOOK, spec.z0 + j * BROOK_LOOK, w), BROOK_LOOK) && w.brook) return spec.segs * 2;
  }
  return spec.segs;
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

/** The surfaces a settlement's ground swaps (the wood's floor for kept grass). */
const FOREST = SURFACES.indexOf('forest'), GRASS = SURFACES.indexOf('grass');

/**
 * The ground's look at a point, for any mesh drawn with the terrain material: writes the biome's linear
 * ground colour and its surface weights (one-hot, SURFACES order) at vertex `v` of `color` and `surface`.
 */
export function groundLook(t: Terrain): (x: number, z: number, color: Float32Array, surface: Float32Array, v: number) => void {
  const linear = (c: number): number[] => [srgbToLinear(((c >> 16) & 255) / 255), srgbToLinear(((c >> 8) & 255) / 255), srgbToLinear((c & 255) / 255)];
  const lin = t.biomes.map((b) => linear(b.ground));
  const surf = t.biomes.map((b) => SURFACES.indexOf(b.surface));
  // The kinds of country that wear their own ground (downs' turf, badlands' clay), blended in by how much of each is here.
  const kinds = t.skeleton.kinds, worn = kinds.map((k) => (k.wears ? { color: linear(k.wears.color), surface: SURFACES.indexOf(k.wears.surface) } : null));
  const wears = worn.some((k) => k);
  return (x, z, color, surface, v) => {
    const b = clamp(t.biomeAt(x, z), 0, lin.length - 1), c = lin[b];
    // A settlement's ground is kept: grass, not the wood's floor, even where it was cleared from forest.
    const town = t.townGround(x, z) !== TownGround.None, kept = surf[b] === FOREST && town;
    let left = 1, r = 0, g = 0, bl = 0;
    surface.fill(0, v * 4, v * 4 + 4);
    if (wears && !town && t.height(x, z) > 1.5) {
      const w = t.skeleton.kindWeights(x, z);
      for (let i = 0; i < w.length; i++) {
        const k = worn[i];
        if (!k || w[i] <= 0) continue;
        r += w[i] * k.color[0]; g += w[i] * k.color[1]; bl += w[i] * k.color[2];
        surface[v * 4 + k.surface] += w[i];
        left -= w[i];
      }
    }
    color[v * 3] = r + left * c[0]; color[v * 3 + 1] = g + left * c[1]; color[v * 3 + 2] = bl + left * c[2];
    surface[v * 4 + (kept ? GRASS : surf[b])] += left;
  };
}

/** Vertex spacing (m) from which normals are taken over two cells each way (smoothNormals). */
const SMOOTH_STEP = 4;

export function buildChunk(t: Terrain, spec: ChunkSpec): ChunkMesh {
  const { x0, z0, size, segs } = spec;
  const n = segs + 1, step = size / segs;
  // Heights with two extra rings, so normals and levels on the edge match the neighbour's.
  const m = n + 4;
  const h = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) h[j * m + i] = t.height(x0 + (i - 2) * step, z0 + (j - 2) * step);
  const H = (i: number, j: number): number => h[(j + 2) * m + i + 2];
  const vc = vertexCount(segs);
  const position = new Float32Array(vc * 3), normal = new Float32Array(vc * 3), color = new Float32Array(vc * 3);
  const surface = new Float32Array(vc * 4), level = new Float32Array(vc), canopy = new Float32Array(vc * 4);
  const look = groundLook(t), woods = canopySampler(t), c: Canopy = { cover: 0, height: 0, spacing: 0, conifer: 0 };
  let minY = Infinity, maxY = -Infinity;
  // Biome colour on a coarser grid (it varies over kilometres), blended per vertex.
  const cstep = Math.max(1, Math.round(segs / 8));
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = j * n + i, y = H(i, j);
    position[v * 3] = i * step;
    position[v * 3 + 1] = y;
    position[v * 3 + 2] = j * step;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    const dx = H(i + 1, j) - H(i - 1, j);
    const dz = H(i, j + 1) - H(i, j - 1);
    // The level: the slope over two cells each way.
    const sx = (H(i + 2, j) + dx - H(i - 2, j)) / (6 * step), sz = (H(i, j + 2) + dz - H(i, j - 2)) / (6 * step);
    level[v] = 1 / Math.sqrt(1 + sx * sx + sz * sz);
    // Far out, the normal over two cells each way, as the level: a wall running slantwise through vertices
    // 16 m apart and more lit in a saw of light and dark teeth with the normal over one.
    const far = step >= SMOOTH_STEP;
    const nx = far ? -sx : -dx, ny = far ? 1 : 2 * step, nz = far ? -sz : -dz, l = Math.hypot(nx, ny, nz);
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
    level[v] = level[g];
  }
  return { position, normal, color, surface, level, canopy, segs, minY: minY - drop, maxY };
}

/** Moves world-space vertices (x, y, z triples) to be relative to their middle (whole metres, xz); returns it. */
export function recentre(position: Float32Array): [number, number] {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < position.length; i += 3) {
    x0 = Math.min(x0, position[i]); x1 = Math.max(x1, position[i]);
    z0 = Math.min(z0, position[i + 2]); z1 = Math.max(z1, position[i + 2]);
  }
  if (!(x0 <= x1)) return [0, 0];
  const cx = Math.round((x0 + x1) / 2), cz = Math.round((z0 + z1) / 2);
  for (let i = 0; i < position.length; i += 3) { position[i] -= cx; position[i + 2] -= cz; }
  return [cx, cz];
}
