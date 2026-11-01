/**
 * The carver (D63, phase K2; docs/design/caves.md 3.3; pure, runs in a worker): a void skeleton becomes the signed field
 * the cave rock already uses (sparse bricks, positive in air, surface nets in rockMesh.ts). The field is sampled only
 * near the voids, so a long cave costs little. Each conduit's segments are stamped as a tube (an ellipse) joined with a
 * canyon (a slot cut below), smoothly; a collapse void is a noisy dome over a heap of rubble. The walls are roughened
 * with scallops that only widen a little more than they narrow (the least way stays: no squeezing, D63).
 */
import { Noise, deriveSeed, smax } from '@futuremagic/core';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { CavesDef } from '../../setting/contract';
import { WildMat } from '../dungeon/meshKit';
import { BRICK, brickField, brickIndex, meshField, sampleOf, setSample, type BrickField } from '../dungeon/rockMesh';
import { bedAt, oreAt, type RockBlock } from './block';
import { ORE_MAT } from './parts';
import type { CondPoint, Skeleton, Void } from './skeleton';

/** Metres of rock kept round the skeleton in the field. */
const MARGIN = 4;
/** Blending of a tube and its canyon, metres. */
const BLEND = 0.8;

/** The field of a cave: signed distances in bricks, positive in air, in the block's frame. */
export type FormedField = BrickField;

/** The field of a skeleton. */
export function carveSkeleton(sk: Skeleton, block: RockBlock, caves: CavesDef, step: number): FormedField {
  const rough = caves.walls.rough, noise = new Noise(deriveSeed(block.seed, 'cave', 'walls'));
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  const grow = (x: number, y: number, z: number, rh: number, down: number, up: number) => {
    x0 = Math.min(x0, x - rh); x1 = Math.max(x1, x + rh); z0 = Math.min(z0, z - rh); z1 = Math.max(z1, z + rh); y0 = Math.min(y0, y - down); y1 = Math.max(y1, y + up);
  };
  for (const c of sk.conduits) for (const p of c.points) grow(p.x, p.y, p.z, Math.max(p.A, p.C) + MARGIN, p.B + p.D + MARGIN, p.B + MARGIN);
  for (const v of sk.voids) grow(v.x, v.floor, v.z, Math.max(v.rx, v.rz) + MARGIN, MARGIN, v.height + MARGIN);
  if (!isFinite(x0)) { x0 = y0 = z0 = 0; x1 = y1 = z1 = step; }
  const f = brickField(x0, y0, z0, step, Math.ceil((x1 - x0) / step) + 1, Math.ceil((y1 - y0) / step) + 1, Math.ceil((z1 - z0) / step) + 1);

  /** Scallops: how much the wall bulges out (little goes in). */
  const wall = (x: number, y: number, z: number) => rough * Math.max(-0.2, noise.n3(x / 2.6, y / 2.6, z / 2.6));

  for (const c of sk.conduits) for (let s = 0; s + 1 < c.points.length; s++) stampTube(f, c.points[s], c.points[s + 1], rough, wall);
  for (const v of sk.voids) stampVoid(v);
  return f;

  function stampVoid(v: Void): void {
    const rn = new Noise(v.seed), reach = Math.max(v.rx, v.rz), cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
    const [i0, i1] = sampleRange(f, v.x - reach - 3, v.x + reach + 3, 'x'), [j0, j1] = sampleRange(f, v.floor - 1, v.floor + v.height + 3, 'y'), [k0, k1] = sampleRange(f, v.z - reach - 3, v.z + reach + 3, 'z');
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = f.ox + i * step, y = f.oy + j * step, z = f.oz + k * step, dy = y - v.floor, dx = x - v.x, dz = z - v.z;
      // In the room's own frame: long along yaw, short across it. The ceiling is a flattened dome.
      const u = (dx * cy + dz * sy) / v.rx, w = (-dx * sy + dz * cy) / v.rz, e2 = u * u + w * w;
      if (e2 > 1.6) continue;
      const top = v.height * Math.sqrt(Math.max(0, 1 - e2)) ** 0.55;
      let a = Math.min(top - dy, (1 - Math.sqrt(e2)) * 0.9 * v.rz, dy + 0.4);
      if (a < -3) continue;
      // A fallen ceiling is uneven: broad bulges and ledges, not cauliflower.
      a += 1.3 * rn.n3(x / 9, y / 8, z / 9) + 0.3 * rn.n3(x / 3 + 5, y / 3, z / 3);
      if (a > -1) {
        const d = Math.hypot(dx, dz);
        if (a > 0 && d < v.heapR + 1) {
          // The rubble heap under the fall: solid below its surface.
          const hh = v.heapH * Math.max(0, 1 - d / v.heapR) ** 1.3 + (d < v.heapR ? 0.5 * rn.n3(x / 1.8 + 3, 0, z / 1.8) : 0);
          a = Math.min(a, (dy - hh) * 0.7);
        }
        putSample(f, i, j, k, a);
      }
    }
  }
}

/** Write v into a sample: the larger of it and the stored value (air is added), or with `rock` the smaller (rock is added); a brick is made where there was none and v is inside its skin. */
export function putSample(f: BrickField, i: number, j: number, k: number, v: number, rock = false): void {
  if (rock ? v >= 1 : v <= -1) return;
  const b = brickIndex(f, i, j, k);
  let brick = f.bricks[b];
  if (!brick) brick = f.bricks[b] = new Float32Array(BRICK * BRICK * BRICK).fill(-1);
  const at = (i % BRICK) + BRICK * ((j % BRICK) + BRICK * (k % BRICK));
  if (rock) { if (v < brick[at]) brick[at] = Math.max(v, -1); } else if (v > brick[at]) brick[at] = Math.min(v, 3);
}

/** The samples of one axis a range of metres covers. */
export function sampleRange(f: BrickField, lo: number, hi: number, axis: 'x' | 'y' | 'z'): [number, number] {
  const o = axis === 'x' ? f.ox : axis === 'y' ? f.oy : f.oz, n = axis === 'x' ? f.nx : axis === 'y' ? f.ny : f.nz;
  return [Math.max(0, Math.floor((lo - o) / f.step)), Math.min(n - 1, Math.ceil((hi - o) / f.step))];
}

/** Stamp one stretch of conduit (from a to b) into the field as a tube joined with its canyon; `wall` adds the scallops near the surface. */
export function stampTube(f: BrickField, a: CondPoint, b: CondPoint, rough = 0, wall: (x: number, y: number, z: number) => number = () => 0): void {
  const { step } = f;
  const rh = Math.max(a.A, b.A, a.C, b.C) + 1.5, down = Math.max(a.B + a.D, b.B + b.D) + 1.5, up = Math.max(a.B, b.B) + 1.5;
  const [i0, i1] = sampleRange(f, Math.min(a.x, b.x) - rh, Math.max(a.x, b.x) + rh, 'x'), [j0, j1] = sampleRange(f, Math.min(a.y, b.y) - down, Math.max(a.y, b.y) + up, 'y'), [k0, k1] = sampleRange(f, Math.min(a.z, b.z) - rh, Math.max(a.z, b.z) + rh, 'z');
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, len2 = abx * abx + aby * aby + abz * abz || 1;
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = f.ox + i * step, y = f.oy + j * step, z = f.oz + k * step;
    const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby + (z - a.z) * abz) / len2));
    const qx = a.x + abx * t, qy = a.y + aby * t, qz = a.z + abz * t, dx = x - qx, dy = y - qy, dz = z - qz;
    const A = a.A + (b.A - a.A) * t, B = a.B + (b.B - a.B) * t, hh = Math.sqrt(dx * dx + dz * dz);
    // The tube: an ellipse, its distance estimated to first order.
    const e = Math.sqrt((hh / A) ** 2 + (dy / B) ** 2);
    let v = e < 1e-4 ? Math.min(A, B) : (1 - e) * e / Math.sqrt((hh / (A * A)) ** 2 + (dy / (B * B)) ** 2);
    v = Math.min(v, Math.min(A, B));
    const C = a.C + (b.C - a.C) * t;
    if (C > 0) {
      const D = a.D + (b.D - a.D) * t, vs = Math.min(C - hh, y - (qy - B - D), qy - 0.3 * B - y);
      v = smax(v, vs, BLEND);
    }
    if (v < -1.4) continue;
    if (v < rough + 0.3 && v > -rough - 0.3) v += wall(x, y, z);
    putSample(f, i, j, k, v);
  }
}

/**
 * Cut a hero-sized way between two floor points (the concession, K4): air `height` high over a floor that runs straight from
 * one point to the other, `half` wide either side of the line seen from above; the walls are smooth, the floor level across.
 * Where the line crosses open air the floor is a slab of rock 2.5 m thick (a ramp of fallen rock, a fallen slab across a gap).
 */
export function stampSlab(f: BrickField, a: readonly [number, number, number], b: readonly [number, number, number], half: number, height: number): void {
  const { step } = f, hx = b[0] - a[0], hz = b[2] - a[2], len2 = hx * hx + hz * hz || 1;
  const [i0, i1] = sampleRange(f, Math.min(a[0], b[0]) - half - 1, Math.max(a[0], b[0]) + half + 1, 'x'), [j0, j1] = sampleRange(f, Math.min(a[1], b[1]) - 2.6, Math.max(a[1], b[1]) + height + 1, 'y'), [k0, k1] = sampleRange(f, Math.min(a[2], b[2]) - half - 1, Math.max(a[2], b[2]) + half + 1, 'z');
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const x = f.ox + i * step, z = f.oz + k * step, t = Math.max(0, Math.min(1, ((x - a[0]) * hx + (z - a[2]) * hz) / len2));
    const hh = Math.hypot(x - (a[0] + hx * t), z - (a[2] + hz * t));
    if (hh > half + 1) continue;
    const yf = a[1] + (b[1] - a[1]) * t;
    for (let j = j0; j <= j1; j++) {
      const y = f.oy + j * step;
      if (y < yf) { if (y > yf - 2.5) putSample(f, i, j, k, -Math.min(half + 0.4 - hh, yf - y, 1), true); continue; }
      putSample(f, i, j, k, Math.min(half - hh, y - yf, yf + height - y, 1.5));
    }
  }
}

/** The rock's look: stone in the colour of its bed, ore where a body of it reaches the wall. */
export function formedLook(block: RockBlock): Parameters<typeof meshField>[1] {
  const ores = block.oreDef.ores;
  const stone = (x: number, y: number, z: number) => (block.ore.length && oreAt(block, x, y, z) ? ORE_MAT : WildMat.Rock);
  const tinted = (x: number, y: number, z: number, _mat: number, up: number): [number, number, number] => {
      const o = block.ore.length ? oreAt(block, x, y, z) : 0;
      if (o) { const c = ores[o - 1].color; return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
      const i = bedAt(block.beds, x, y, z) * 3, bc = block.beds.color, k = up > 0.5 ? 1 : 0.82;
      return [bc[i] * k, bc[i + 1] * k, bc[i + 2] * k];
  };
  return { mat: stone, tint: tinted };
}

/** The mesh of a carved cave (the building format, so it draws with the one building shader). */
export const formedMesh = (field: FormedField, block: RockBlock): BuildingMesh => meshField(field, formedLook(block));

/** The field with every `k`-th sample (a look at a big cave in a fraction of the meshing time: the walls lose their scallops). */
export function coarsen(f: FormedField, k: number): FormedField {
  const c = brickField(f.ox, f.oy, f.oz, f.step * k, Math.floor((f.nx - 1) / k) + 1, Math.floor((f.ny - 1) / k) + 1, Math.floor((f.nz - 1) / k) + 1);
  for (let bk = 0; bk < f.bz; bk++) for (let bj = 0; bj < f.by; bj++) for (let bi = 0; bi < f.bx; bi++) {
    if (!f.bricks[bi + f.bx * (bj + f.by * bk)]) continue;
    for (let kk = Math.ceil(bk * BRICK / k); kk * k < (bk + 1) * BRICK && kk < c.nz; kk++) for (let jj = Math.ceil(bj * BRICK / k); jj * k < (bj + 1) * BRICK && jj < c.ny; jj++) for (let ii = Math.ceil(bi * BRICK / k); ii * k < (bi + 1) * BRICK && ii < c.nx; ii++) {
      setSample(c, ii, jj, kk, sampleOf(f, ii * k, jj * k, kk * k));
    }
  }
  return c;
}
