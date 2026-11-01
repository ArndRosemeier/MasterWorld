/**
 * The water of a formed cave as a mesh (D63, K3; pure): each stream a ribbon of five lines across with the depth of the
 * cut bed (nothing at the banks), each pool a fan; every vertex carries the water's depth, its speed (from how
 * fast the surface falls along the stream) and its direction, which the cave water shader reads (as the outside
 * water reads them from its masks). Streams run downhill.
 */
import type { Dressing } from './dress';

export interface WaterMesh {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  /** Per vertex: the water's depth (m) and its speed (m/s). */
  readonly uv: Float32Array;
  /** Per vertex: the direction it runs (x, z; unit, or 0) and 0. */
  readonly flow: Float32Array;
  readonly index: Uint32Array;
}

const ACROSS = 5;

/** The water mesh of a dressing; `bed` is how deep the stream's bed is cut (the setting's `dress.water.bed`), `poolDepth` a pool's. */
export function waterMesh(d: Dressing, bed: number, poolDepth: number): WaterMesh {
  const pos: number[] = [], uv: number[] = [], flow: number[] = [], idx: number[] = [];
  const push = (x: number, y: number, z: number, depth: number, speed: number, fx: number, fz: number): number => {
    pos.push(x, y, z); uv.push(depth, speed); flow.push(fx, fz, 0);
    return pos.length / 3 - 1;
  };
  for (const s of d.streams) {
    // Downhill: from the higher end to the lower.
    const pts = s.pts[0][1] < s.pts[s.pts.length - 1][1] ? [...s.pts].reverse() : s.pts;
    const rows: number[][] = [];
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1;
      const far = pts[Math.max(0, i - 3)], near = pts[Math.min(pts.length - 1, i + 3)], run = Math.hypot(near[0] - far[0], near[2] - far[2]) || 1;
      const speed = Math.max(0.3, Math.min(3.4, 0.35 + 7 * Math.max(0, (far[1] - near[1]) / run)));
      const row: number[] = [];
      for (let u = 0; u < ACROSS; u++) {
        const k = (u / (ACROSS - 1)) * 2 - 1;
        row.push(push(p[0] + (-dz / l) * p[3] * k * 0.97, p[1], p[2] + (dx / l) * p[3] * k * 0.97, bed * (1 - k * k), speed, dx / l, dz / l));
      }
      rows.push(row);
    });
    for (let i = 0; i + 1 < rows.length; i++) for (let u = 0; u + 1 < ACROSS; u++) {
      const a = rows[i][u], b = rows[i][u + 1], c = rows[i + 1][u], e = rows[i + 1][u + 1];
      idx.push(a, b, c, b, e, c);
    }
  }
  const RIM = 20;
  for (const p of d.pools) {
    const mid = push(p.x, p.y, p.z, poolDepth, 0, 0, 0), ring: number[] = [], rim: number[] = [];
    for (let k = 0; k < RIM; k++) {
      const a = (k / RIM) * Math.PI * 2, c = Math.cos(a), n = Math.sin(a);
      ring.push(push(p.x + c * p.r * 0.55, p.y, p.z + n * p.r * 0.55, poolDepth * 0.7, 0, 0, 0));
      rim.push(push(p.x + c * p.r * 0.96, p.y, p.z + n * p.r * 0.96, 0, 0, 0, 0));
    }
    for (let k = 0; k < RIM; k++) {
      const j = (k + 1) % RIM;
      idx.push(mid, ring[j], ring[k], ring[k], ring[j], rim[k], rim[k], ring[j], rim[j]);
    }
  }
  const normal = new Float32Array(pos.length);
  for (let i = 1; i < normal.length; i += 3) normal[i] = 1;
  return { position: Float32Array.from(pos), normal, uv: Float32Array.from(uv), flow: Float32Array.from(flow), index: Uint32Array.from(idx) };
}
