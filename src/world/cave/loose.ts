/**
 * Loose rock and crystals as meshes (D63, K3; pure): stones of every size (a power law: many pebbles, some cobbles, few
 * boulders), angular and chunky, flat on the underside so they sit on the floor; lumps of ore stuck in the wall; and
 * clusters of crystals (faceted hexagonal prisms with pointed tips) growing out of it. Seeded; smooth normals for
 * stones, flat faces for crystals.
 */
import { Noise, Rng, deriveSeed, v3norm } from '@futuremagic/core';
import { CRYSTAL_MAT, ORE_MAT, PartBuilder, type PartMesh } from './parts';

/** A stone: its middle, size, flattening (height share), turn, and its tone (0 dark to 1 pale); `ore` is an ore colour for a lump in the wall (else -1). */
export interface Stone { readonly x: number; readonly y: number; readonly z: number; readonly r: number; readonly flat: number; readonly yaw: number; readonly tone: number; readonly ore: number; readonly seed: number }

/** A cluster of crystals on a wall: where it grows from, which way the wall faces (into the cave), how many and how long, and its colour. */
export interface Crystal { readonly x: number; readonly y: number; readonly z: number; readonly nx: number; readonly ny: number; readonly nz: number; readonly count: number; readonly len: number; readonly color: number; readonly seed: number }

type V3 = readonly [number, number, number];

/** An icosphere's unit vertices and triangles, split `levels` times (cached). */
const spheres = new Map<number, { v: V3[]; t: number[] }>();
function icosphere(levels: number): { v: V3[]; t: number[] } {
  const hit = spheres.get(levels);
  if (hit) return hit;
  const g = (1 + Math.sqrt(5)) / 2;
  let v: V3[] = [[-1, g, 0], [1, g, 0], [-1, -g, 0], [1, -g, 0], [0, -1, g], [0, 1, g], [0, -1, -g], [0, 1, -g], [g, 0, -1], [g, 0, 1], [-g, 0, -1], [-g, 0, 1]].map(([x, y, z]) => v3norm([x, y, z]));
  let t = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
  for (let l = 0; l < levels; l++) {
    const mid = new Map<number, number>(), nt: number[] = [];
    const half = (a: number, b: number): number => {
      const key = Math.min(a, b) * 100003 + Math.max(a, b);
      let m = mid.get(key);
      if (m === undefined) { v = [...v, v3norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2])]; m = v.length - 1; mid.set(key, m); }
      return m;
    };
    for (let i = 0; i < t.length; i += 3) {
      const a = t[i], b = t[i + 1], c = t[i + 2], ab = half(a, b), bc = half(b, c), ca = half(c, a);
      nt.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca);
    }
    t = nt;
  }
  const out = { v, t };
  spheres.set(levels, out);
  return out;
}

/** The mesh of stones. `tintAt` is the wall's stone colour (sRGB bytes) at a point; ore lumps take their ore colour (a 0xrrggbb number). */
export function stonesMesh(list: readonly Stone[], seed: number, tintAt: (x: number, y: number, z: number) => [number, number, number]): PartMesh {
  const b = new PartBuilder(), noise = new Noise(deriveSeed(seed, 'cave', 'stones'));
  for (const s of list) {
    const { v, t } = icosphere(s.r > 0.35 ? 2 : s.r > 0.12 ? 1 : 0), c = Math.cos(s.yaw), sn = Math.sin(s.yaw), v0 = b.vertexCount, i0 = b.idx.length;
    const base = s.ore >= 0 ? [(s.ore >> 16) & 255, (s.ore >> 8) & 255, s.ore & 255] : tintAt(s.x, s.y, s.z), k = 0.6 + 0.7 * s.tone;
    for (const u of v) {
      // Chunky: each axis pushed towards a block's face, then lumped by noise.
      const q = [Math.sign(u[0]) * Math.abs(u[0]) ** 0.7, Math.sign(u[1]) * Math.abs(u[1]) ** 0.7, Math.sign(u[2]) * Math.abs(u[2]) ** 0.7];
      const d = 1 + 0.26 * noise.n3(u[0] * 1.9 + s.seed, u[1] * 1.9, u[2] * 1.9) + 0.09 * noise.n3(u[0] * 5.3, u[1] * 5.3 + s.seed, u[2] * 5.3);
      let x = q[0] * s.r * d, y = q[1] * s.r * d * s.flat, z = q[2] * s.r * d;
      y = Math.max(y, -s.r * s.flat * 0.55);
      const wx = s.x + x * c - z * sn, wz = s.z + x * sn + z * c, shade = k * (0.9 + 0.2 * noise.n3(wx * 3, (s.y + y) * 3, wz * 3));
      b.vertex(wx, s.y + y, wz, 0, 1, 0, Math.min(255, base[0] * shade), Math.min(255, base[1] * shade), Math.min(255, base[2] * shade), s.ore >= 0 ? ORE_MAT : 15);
    }
    for (let i = 0; i < t.length; i += 3) b.tri(v0 + t[i], v0 + t[i + 1], v0 + t[i + 2]);
    b.smooth(v0, i0);
  }
  return b.build();
}

/** The mesh of crystal clusters: faceted hexagonal prisms with pointed tips, tilted about the wall's normal. */
export function crystalsMesh(list: readonly Crystal[]): PartMesh {
  const b = new PartBuilder();
  for (const cl of list) {
    const rng = new Rng(cl.seed), n = v3norm([cl.nx, cl.ny, cl.nz]);
    // Two axes across the wall.
    const a0: V3 = Math.abs(n[1]) < 0.9 ? v3norm([-n[2], 0, n[0]]) : [1, 0, 0], a1: V3 = [n[1] * a0[2] - n[2] * a0[1], n[2] * a0[0] - n[0] * a0[2], n[0] * a0[1] - n[1] * a0[0]];
    const rgbc = [(cl.color >> 16) & 255, (cl.color >> 8) & 255, cl.color & 255];
    for (let i = 0; i < cl.count; i++) {
      const L = cl.len * rng.range(0.45, 1) * (i === 0 ? 1.2 : 1), r = L * rng.range(0.1, 0.17), tilt = rng.range(0, 0.6), az = rng.range(0, Math.PI * 2);
      const dir = v3norm([n[0] + (a0[0] * Math.cos(az) + a1[0] * Math.sin(az)) * tilt, n[1] + (a0[1] * Math.cos(az) + a1[1] * Math.sin(az)) * tilt, n[2] + (a0[2] * Math.cos(az) + a1[2] * Math.sin(az)) * tilt]);
      const e0: V3 = Math.abs(dir[1]) < 0.9 ? v3norm([-dir[2], 0, dir[0]]) : [1, 0, 0], e1: V3 = [dir[1] * e0[2] - dir[2] * e0[1], dir[2] * e0[0] - dir[0] * e0[2], dir[0] * e0[1] - dir[1] * e0[0]];
      const off = rng.range(0, cl.len * 0.25), ba = rng.range(0, Math.PI * 2);
      const bx = cl.x + (a0[0] * Math.cos(ba) + a1[0] * Math.sin(ba)) * off - n[0] * 0.08, by = cl.y + (a0[1] * Math.cos(ba) + a1[1] * Math.sin(ba)) * off - n[1] * 0.08, bz = cl.z + (a0[2] * Math.cos(ba) + a1[2] * Math.sin(ba)) * off - n[2] * 0.08;
      const k = rng.range(0.8, 1.15), col = [Math.min(255, rgbc[0] * k), Math.min(255, rgbc[1] * k), Math.min(255, rgbc[2] * k)];
      const ringAt = (h: number, rad: number, j: number): V3 => {
        const an = (j / 6) * Math.PI * 2;
        return [bx + dir[0] * h + (e0[0] * Math.cos(an) + e1[0] * Math.sin(an)) * rad, by + dir[1] * h + (e0[1] * Math.cos(an) + e1[1] * Math.sin(an)) * rad, bz + dir[2] * h + (e0[2] * Math.cos(an) + e1[2] * Math.sin(an)) * rad];
      };
      const tip: V3 = [bx + dir[0] * L, by + dir[1] * L, bz + dir[2] * L];
      // Each face its own vertices: facets catch the light apart.
      const facet = (p: V3[]): void => {
        const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2], vx = p[2][0] - p[0][0], vy = p[2][1] - p[0][1], vz = p[2][2] - p[0][2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const vs = p.map((q) => b.vertex(q[0], q[1], q[2], nx, ny, nz, col[0], col[1], col[2], CRYSTAL_MAT));
        for (let m = 1; m + 1 < vs.length; m++) b.tri(vs[0], vs[m], vs[m + 1]);
      };
      const shoulder = L * 0.78;
      for (let j = 0; j < 6; j++) {
        facet([ringAt(0, r, j + 1), ringAt(0, r, j), ringAt(shoulder, r, j), ringAt(shoulder, r, j + 1)]);
        facet([ringAt(shoulder, r, j + 1), ringAt(shoulder, r, j), tip]);
      }
    }
  }
  return b.build();
}
