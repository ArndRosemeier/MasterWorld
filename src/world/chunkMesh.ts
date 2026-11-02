/**
 * Terrain chunk meshes (pure data, built in workers): a square of `segs × segs` quads with a skirt around
 * its edge that hides cracks between chunks of different detail. Every chunk shares one index buffer.
 */
import { srgbToLinear, clamp, smoothstep } from '@futuremagic/core';
import { NATURAL_NAMES, NATURAL_TILE_METERS } from '@futuremagic/texgen';
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
  /** A kind of country's own ground layer per vertex (groundLook): the layer, how much it holds, its share, 1 / its tile (m). */
  ground: Float32Array;
  /**
   * How level the ground is around each vertex: the up component of the normal smoothed over a few metres.
   * It changes smoothly from vertex to vertex even across a cliff's edge (where the normal flips between
   * neighbours), so rock, sand and grass meet along smooth lines instead of the mesh's triangles.
   */
  level: Float32Array;
  /** Quads per side it was built with (the worker may build finer than asked: `finerFor`). */
  segs: number;
  /** Its own triangle list where some quads are cut along their other diagonal (`followEdges`); else the shared one. */
  index?: Uint16Array | Uint32Array;
  minY: number;
  maxY: number;
}

/** Side of the finest chunk, metres; with SEGS segments a vertex every 2 m (render/terrain/lod.ts draws them). */
export const CHUNK0 = 128;
export const SEGS = 64;

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


/** Vertex spacing (m) from which normals are taken over two cells each way (smoothNormals). */
const SMOOTH_STEP = 4;

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

/**
 * A chunk's own triangle list, where a quad is cut along the diagonal whose corners lie nearer in height: a steep
 * edge (a scarp's or a mesa's rim, a moor's drop) running slantwise through the vertices stood in a saw of teeth along
 * the shared list's one diagonal, the same way in every quad. Null when no quad needs it (the shared list serves).
 * Near chunks too: a moor's 2 m drop seen from 50 m stood in the same saw of teeth on 2 m cells (gate P shots).
 */
export function followEdges(h: (i: number, j: number) => number, segs: number, step: number): Uint16Array | Uint32Array | null {
  const n = segs + 1;
  let out: Uint16Array | Uint32Array | null = null;
  for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
    if (!cutsAD(h(i, j), h(i + 1, j), h(i, j + 1), h(i + 1, j + 1), step)) continue;
    out ??= vertexCount(segs) < 65536 ? new Uint16Array(chunkIndex(segs)) : chunkIndex(segs);
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1, q = (j * segs + i) * 6;
    out[q] = a; out[q + 1] = c; out[q + 2] = d; out[q + 3] = a; out[q + 4] = d; out[q + 5] = b;
  }
  return out;
}

/**
 * Whether a quad (corners a at its least x and z, b along x, c along z, d across) is cut a-d: the shared list cuts
 * b-c; a-d instead where its corners differ clearly less (by a third of a cell's width).
 */
export function cutsAD(a: number, b: number, c: number, d: number, step: number): boolean {
  return Math.abs(b - c) - Math.abs(a - d) >= step / 3;
}

/**
 * The height drawn at (u, w) in a quad (0..1 along x and z; corners as `cutsAD`), on the triangle it falls in: what
 * the mesh shows there, which the hero stands on (world/drawnGround.ts).
 */
export function drawnIn(a: number, b: number, c: number, d: number, u: number, w: number, step: number): number {
  if (cutsAD(a, b, c, d, step)) return w >= u ? a + (d - c) * u + (c - a) * w : a + (b - a) * u + (d - b) * w;
  return u + w <= 1 ? a + (b - a) * u + (c - a) * w : d + (c - d) * (1 - u) + (b - d) * (1 - w);
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
export function groundLook(t: Terrain): (x: number, z: number, color: Float32Array, surface: Float32Array, v: number, ground?: Float32Array) => void {
  const linear = (c: number): number[] => [srgbToLinear(((c >> 16) & 255) / 255), srgbToLinear(((c >> 8) & 255) / 255), srgbToLinear((c & 255) / 255)];
  const lin = t.biomes.map((b) => linear(b.ground));
  const surf = t.biomes.map((b) => SURFACES.indexOf(b.surface));
  // The kinds of country that wear their own ground (downs' turf, badlands' clay), blended in by how much of each is here.
  const kinds = t.skeleton.kinds, worn = kinds.map((k) => (k.wears?.color !== undefined && k.wears.surface ? { color: linear(k.wears.color), surface: SURFACES.indexOf(k.wears.surface) } : null));
  const wears = worn.some((k) => k);
  // Their own ground layers (a moor's heather, badlands' clay): texgen natural layers.
  const layers = kinds.map((k) => (k.wears?.layer ? { layer: NATURAL_NAMES.indexOf(k.wears.layer), share: k.wears.share ?? 1 } : null));
  const laid = layers.some((k) => k);
  return (x, z, color, surface, v, ground) => {
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
    if (ground) kindGround(t, layers, laid && !town && t.height(x, z) > 1.5, x, z, ground, v);
  };
}

/**
 * The kind of country's own ground layer at (x, z) into `ground` at vertex `v`: the layer of the kind that holds most
 * here, and by how much more than the next one with a layer (so where two kinds' layers meet, each fades out before
 * the other comes in, and a triangle never blends two layers' numbers), its share, and 1 / its tile in metres.
 */
function kindGround(t: Terrain, layers: readonly ({ layer: number; share: number } | null)[], on: boolean, x: number, z: number, ground: Float32Array, v: number): void {
  let best = -1, w1 = 0, w2 = 0;
  if (on) {
    const w = t.skeleton.kindWeights(x, z);
    for (let i = 0; i < w.length; i++) {
      if (!layers[i] || w[i] <= 0) continue;
      if (w[i] > w1) { w2 = w1; w1 = w[i]; best = i; } else if (w[i] > w2) w2 = w[i];
    }
  }
  const k = best >= 0 ? layers[best]! : null;
  ground[v * 4] = k ? k.layer : -1;
  ground[v * 4 + 1] = k ? w1 - w2 : 0;
  ground[v * 4 + 2] = k ? k.share : 0;
  ground[v * 4 + 3] = k ? 1 / NATURAL_TILE_METERS[k.layer] : 1;
}

/**
 * Where no kind lays its ground (number −1), the number of the nearest coarse sample that has one (else 0), so a
 * triangle running out of a kind's ground fades by its weight alone and never blends one layer's number into another's.
 */
function layerEverywhere(ground: Float32Array, n: number, cstep: number, segs: number): void {
  const coarse = (i: number, j: number) => (Math.min(segs, j * cstep) * n + Math.min(segs, i * cstep)) * 4;
  const m = Math.ceil(segs / cstep) + 1;
  for (let pass = 0; pass < m; pass++) {
    let left = false;
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
      const g = coarse(i, j);
      if (ground[g] >= 0) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= m || b >= m) continue;
        const o = coarse(a, b);
        if (ground[o] >= 0) { ground[g] = ground[o]; ground[g + 2] = ground[o + 2]; ground[g + 3] = ground[o + 3]; break; }
      }
      if (ground[g] < 0) left = true;
    }
    if (!left) break;
  }
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) { const g = coarse(i, j); if (ground[g] < 0) ground[g] = 0; }
}


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
  const surface = new Float32Array(vc * 4), level = new Float32Array(vc), canopy = new Float32Array(vc * 4), ground = new Float32Array(vc * 4);
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
    // On a steep face (a mesa's wall, a scarp) near by too: there the normal over one cell flips from column to
    // column of vertices and lit the wall, and turned its rock's projection, in vertical stripes like a comb (P2).
    const far = step >= SMOOTH_STEP ? 1 : smoothstep(0.75, 0.45, level[v]);
    const nx = -(sx * far + (dx / (2 * step)) * (1 - far)), nz = -(sz * far + (dz / (2 * step)) * (1 - far)), ny = 1, l = Math.hypot(nx, ny, nz);
    normal[v * 3] = nx / l;
    normal[v * 3 + 1] = ny / l;
    normal[v * 3 + 2] = nz / l;
    if (i % cstep === 0 && j % cstep === 0) {
      look(x0 + i * step, z0 + j * step, color, surface, v, ground);
      woods(x0 + i * step, z0 + j * step, c);
      canopy.set([c.cover, c.height, c.spacing, c.conifer], v * 4);
    }
  }
  layerEverywhere(ground, n, cstep, segs);
  // Fill colours and surfaces between the coarse samples bilinearly (the ground layer's number from the corner it holds most at).
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
    const most = [v00, v10, v01, v11].reduce((a, b) => (ground[b * 4 + 1] > ground[a * 4 + 1] ? b : a));
    ground[v * 4] = ground[most * 4]; ground[v * 4 + 2] = ground[most * 4 + 2]; ground[v * 4 + 3] = ground[most * 4 + 3];
    ground[v * 4 + 1] = ground[v00 * 4 + 1] * w00 + ground[v10 * 4 + 1] * w10 + ground[v01 * 4 + 1] * w01 + ground[v11 * 4 + 1] * w11;
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
    for (let c = 0; c < 4; c++) { surface[v * 4 + c] = surface[g * 4 + c]; canopy[v * 4 + c] = canopy[g * 4 + c]; ground[v * 4 + c] = ground[g * 4 + c]; }
    level[v] = level[g];
  }
  const index = followEdges(H, segs, step) ?? undefined;
  return { position, normal, color, surface, level, canopy, ground, segs, index, minY: minY - drop, maxY };
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
