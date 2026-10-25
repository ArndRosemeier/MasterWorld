/**
 * Terrain volumes (plan 5.6, D9): rock the height field cannot hold, as signed distances meshed with surface
 * nets (@futuremagic/volume), blended into the ground around their edge. Pure, runs in workers.
 *
 * First kind: a natural arch, a fin of rock bent over from one foot to the other. Milestone 1 places one
 * near the start (`archNear`); later the VGM places them like any other feature.
 */
import { Noise, deriveSeed, hash2f, lerp, smin, smoothstep } from '@futuremagic/core';
import { PAD, surfaceNets, type Grid } from '@futuremagic/volume';
import { groundLook } from './chunkMesh';
import type { Terrain } from './terrain';

export interface ArchSite {
  readonly kind: 'arch';
  /** Where its feet stand (world xz) and how high its crown rises above the higher foot, metres. */
  readonly a: readonly [number, number];
  readonly b: readonly [number, number];
  readonly rise: number;
  readonly seed: number;
}

/** Points along the arch's spine (more is smoother and slower). */
const SPINE = 28;
/** Radius of the rock at the feet and at the crown; the fin is this much thicker across than along. */
const R_FOOT = 6.2, R_CROWN = 3.1, FIN = 1.45;
/** How far into the ground the feet go, and the blend radius into the ground. */
const SINK = 4;
export const BLEND = 3.5;
/** Sample spacing of the volume grid, metres. */
export const VOLUME_STEP = 0.7;

/** The arch's rock as a signed distance (positive in air), without the ground. */
export class ArchField {
  private readonly spine: Float32Array; // x, y, z, r per point
  private readonly noise: Noise;
  /** Its bounds (with room for the blend). */
  readonly min: [number, number, number];
  readonly max: [number, number, number];
  /** Across the span, horizontal (the fin's thick direction). */
  private readonly ax: number;
  private readonly az: number;

  constructor(t: Terrain, readonly site: ArchSite) {
    this.noise = new Noise(deriveSeed(site.seed, 'arch'));
    const [ax, az] = site.a, [bx, bz] = site.b;
    const ya = t.height(ax, az) - SINK, yb = t.height(bx, bz) - SINK;
    const top = Math.max(ya, yb) + SINK + site.rise;
    const len = Math.hypot(bx - ax, bz - az);
    this.ax = -(bz - az) / len; this.az = (bx - ax) / len;
    this.spine = new Float32Array(SPINE * 4);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < SPINE; i++) {
      const s = i / (SPINE - 1), base = lerp(ya, yb, s);
      // A rounded hump, a little flattened at the crown; the rock thins towards it.
      const y = base + (top - base) * Math.pow(Math.sin(Math.PI * s), 0.75);
      const r = lerp(R_CROWN, R_FOOT, Math.pow(Math.abs(2 * s - 1), 1.6));
      const x = lerp(ax, bx, s), z = lerp(az, bz, s);
      this.spine.set([x, y, z, r], i * 4);
      for (const [k, v] of [x, y, z].entries()) { lo[k] = Math.min(lo[k], v - r * FIN - BLEND - 3); hi[k] = Math.max(hi[k], v + r * FIN + BLEND + 3); }
    }
    this.min = lo as [number, number, number];
    this.max = hi as [number, number, number];
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= this.min[0] && x <= this.max[0] && y >= this.min[1] && y <= this.max[1] && z >= this.min[2] && z <= this.max[2];
  }

  /** Signed distance to the rock (approximate: the nearest spine segment, swept with its radius, then roughened). */
  at(x: number, y: number, z: number): number {
    if (!this.inBounds(x, y, z)) return 50;
    const S = this.spine;
    let best = Infinity;
    for (let i = 0; i < SPINE - 1; i++) {
      const p = i * 4, q = p + 4;
      const ex = S[q] - S[p], ey = S[q + 1] - S[p + 1], ez = S[q + 2] - S[p + 2];
      let dx = x - S[p], dy = y - S[p + 1], dz = z - S[p + 2];
      const h = Math.max(0, Math.min(1, (dx * ex + dy * ey + dz * ez) / (ex * ex + ey * ey + ez * ez)));
      dx -= ex * h; dy -= ey * h; dz -= ez * h;
      // Squash the across-span part: a fin, thicker across than along.
      const across = (dx * this.ax + dz * this.az) / FIN;
      const alongX = dx - this.ax * (dx * this.ax + dz * this.az), alongZ = dz - this.az * (dx * this.ax + dz * this.az);
      const d = Math.sqrt(across * across + alongX * alongX + alongZ * alongZ + dy * dy) - lerp(S[p + 3], S[q + 3], h);
      if (d < best) best = d;
    }
    if (best > 6) return best;
    // Weathered rock: lumps and bedding planes.
    const n = this.noise;
    return best + n.fbm3(x / 6.5, y / 6.5, z / 6.5, 3) * 1.7 + Math.sin(y * 1.25 + n.fbm3(x / 15, y / 15, z / 15, 2) * 3) * 0.22;
  }
}

/** A mesh for the terrain material: positions (world), normals, ground colour, surface weights, triangles. */
export interface VolumeMesh {
  position: Float32Array;
  normal: Float32Array;
  color: Float32Array;
  surface: Float32Array;
  /** How level the ground is (see ChunkMesh): here the normal's up component. */
  level: Float32Array;
  index: Uint32Array;
}

/**
 * Mesh an arch with the ground it stands on (blended), keeping only the rock and its fillet: the plain ground
 * around is the height field's to draw. Null if nothing is left.
 */
export function archMesh(t: Terrain, site: ArchSite): VolumeMesh | null {
  const f = new ArchField(t, site);
  const step = VOLUME_STEP;
  const side = Math.max(f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]);
  const cells = Math.ceil(side / step);
  const n = cells + 2 * PAD + 1;
  const ox = f.min[0], oy = f.min[1], oz = f.min[2];
  // The ground on the grid's columns (and a slope factor, so the field is about a distance on hillsides too).
  const ground = new Float32Array(n * n), slope = new Float32Array(n * n);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const x = ox + (i - PAD) * step, z = oz + (k - PAD) * step, h = t.height(x, z);
    const gx = (t.height(x + 0.5, z) - h) / 0.5, gz = (t.height(x, z + 0.5) - h) / 0.5;
    ground[k * n + i] = h;
    slope[k * n + i] = 1 / Math.sqrt(1 + gx * gx + gz * gz);
  }
  const d = new Float32Array(n * n * n);
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = ox + (i - PAD) * step, y = oy + (j - PAD) * step, z = oz + (k - PAD) * step;
    const c = k * n + i;
    d[i + n * (j + n * k)] = smin((y - ground[c]) * slope[c], f.at(x, y, z), BLEND);
  }
  const grid: Grid = { n, d };
  const m = surfaceNets(grid, ox, oy, oz, step);
  if (!m) return null;
  // Keep the triangles of the rock and its fillet (near the arch's own surface), drop the plain ground.
  const near = new Uint8Array(m.positions.length / 3);
  for (let v = 0; v < near.length; v++) near[v] = f.at(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]) < BLEND * 1.6 ? 1 : 0;
  const keep: number[] = [];
  for (let tri = 0; tri < m.indices.length; tri += 3) {
    const a = m.indices[tri], b = m.indices[tri + 1], c = m.indices[tri + 2];
    if (near[a] || near[b] || near[c]) keep.push(a, b, c);
  }
  if (!keep.length) return null;
  // Where the fillet runs out onto the plain ground, sink it a hand's breadth, so the height field's own
  // mesh wins there instead of flickering against it.
  for (let v = 0; v < near.length; v++) {
    const x = m.positions[v * 3], z = m.positions[v * 3 + 2];
    m.positions[v * 3 + 1] -= 0.15 * smoothstep(BLEND, BLEND * 1.6, f.at(x, m.positions[v * 3 + 1], z));
  }
  const count = near.length;
  const color = new Float32Array(count * 3), surface = new Float32Array(count * 4);
  const look = groundLook(t);
  for (let v = 0; v < count; v++) look(m.positions[v * 3], m.positions[v * 3 + 2], color, surface, v);
  const level = new Float32Array(count);
  for (let v = 0; v < count; v++) level[v] = m.normals[v * 3 + 1];
  return { position: m.positions, normal: m.normals, color, surface, level, index: new Uint32Array(keep) };
}

/**
 * The arch near the start (milestone 1): on dry, fairly level ground 150 to 300 m from `home`, its span
 * across the line of sight from there, so it is seen broadside. Deterministic per seed; null if none fits.
 */
export function archNear(t: Terrain, home: { x: number; z: number }): ArchSite | null {
  const seed = deriveSeed(t.seed, 'volumes', 'arch');
  const w = { river: 0, lake: 0 };
  const turn = hash2f(seed, 1, 2) * Math.PI * 2;
  for (const r of [180, 230, 280, 150]) for (let k = 0; k < 24; k++) {
    const a = turn + (k / 24) * Math.PI * 2;
    const cx = home.x + Math.cos(a) * r, cz = home.z + Math.sin(a) * r;
    const span = 30 + 10 * hash2f(seed, k, r);
    // Across the line of sight.
    const ux = -Math.sin(a), uz = Math.cos(a);
    const ax = cx - ux * span / 2, az = cz - uz * span / 2, bx = cx + ux * span / 2, bz = cz + uz * span / 2;
    const ha = t.height(ax, az), hb = t.height(bx, bz), hc = t.height(cx, cz);
    if (Math.min(ha, hb, hc) < 6 || Math.abs(ha - hb) > 6) continue;
    if (t.clearOfWater(cx, cz, hc, w).river < 30 || w.lake < 2) continue;
    return { kind: 'arch', a: [ax, az], b: [bx, bz], rise: 17 + 6 * hash2f(seed, r, k), seed: deriveSeed(seed, k, r) };
  }
  return null;
}
