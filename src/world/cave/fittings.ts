/**
 * What people fitted into a mine (D63, phase K8; pure): timber sets (two posts and a cap beam) holding the roof every few
 * metres, rails with sleepers along the adit and the level drifts, and a cart standing on the rails. All of it is oriented boxes
 * (`Box`), placed on the carved floor and against the carved walls by the dresser (world/cave/dress.ts) and meshed here as
 * plain arrays for the worker (parts.ts). They are only drawn: the hero walks through the timber (it stands at the walls and
 * over his head), as the rock's loose stones are not solid either.
 */
import { Rng, v3norm } from '@futuremagic/core';
import type { CaveMineDef } from '../../setting/contract';
import { PartBuilder, type PartMesh } from './parts';
import type { Conduit } from './skeleton';

/** An oriented box: its middle, its half sizes (`l` along the heading `yaw` tilted up by `pitch`, `h` along the box's up, `w` across), and its colour (0xrrggbb). */
export interface Box { readonly x: number; readonly y: number; readonly z: number; readonly l: number; readonly h: number; readonly w: number; readonly yaw: number; readonly pitch: number; readonly color: number }

/** The floor and ceiling of the span of air at (x, z) nearest to y, or null (the dresser's `spanAt`). */
export type SpanAt = (x: number, y: number, z: number) => readonly [number, number] | null;

const WOOD = [0x6b4a2c, 0x5e4126, 0x7a5835, 0x54391f] as const, IRON = [0x4c4a48, 0x5a4034, 0x3e3d3c] as const;

/** The fittings of a mine's passages: timber sets, rails and sleepers, and carts. */
export function fitMine(conduits: readonly Conduit[], mine: CaveMineDef, spanAt: SpanAt, rng: Rng): Box[] {
  const f = mine.fittings, out: Box[] = [];
  const passages = conduits.filter((c) => c.kind === 'passage');
  const heading = (c: Conduit, i: number): number => { const a = c.points[Math.max(0, i - 1)], b = c.points[Math.min(c.points.length - 1, i + 1)]; return Math.atan2(b.z - a.z, b.x - a.x); };
  /** The point `t` of the way from point i to point i + 1 of a conduit, and the way's heading there. */
  const lerpAt = (c: Conduit, i: number, t: number) => {
    const a = c.points[i], b = c.points[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, A: a.A + (b.A - a.A) * t, yaw: Math.atan2(b.z - a.z, b.x - a.x) };
  };
  let carts = 0;
  for (const c of passages) {
    const pts = c.points, run: number[] = [0];
    for (let i = 1; i < pts.length; i++) run.push(run[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z, pts[i].y - pts[i - 1].y));
    const length = run[run.length - 1];
    // Slope of the whole passage: rails go along the level ways (the adit and the drifts), not the inclines.
    const level = Math.abs(pts[pts.length - 1].y - pts[0].y) / (length || 1) < 0.1;
    const runAt = (s: number) => { let i = 0; while (i + 2 < pts.length && run[i + 1] < s) i++; return { i, t: Math.max(0, Math.min(1, (s - run[i]) / ((run[i + 1] - run[i]) || 1))) }; };

    // Timber sets: a post either side against the wall and a cap beam across, every `posts` metres, a third of them missing (people ran out of timber).
    for (let s = f.posts * rng.range(0.4, 0.9); s < length - 1; s += f.posts * rng.range(0.8, 1.3)) {
      if (!rng.chance(f.timbered)) continue;
      const { i, t } = runAt(s), p = lerpAt(c, i, t), sn = Math.sin(p.yaw), cs = Math.cos(p.yaw), ends: { floor: number; ceil: number; x: number; z: number }[] = [];
      for (const sg of [-1, 1]) {
        const x = p.x - sn * sg * (p.A - f.post), z = p.z + cs * sg * (p.A - f.post), sp = spanAt(x, p.y, z);
        if (sp && sp[1] - sp[0] > 1.8) ends.push({ floor: sp[0], ceil: sp[1], x, z });
      }
      if (ends.length < 2) continue;
      const wood = WOOD[rng.int(0, WOOD.length - 1)];
      for (const e of ends) out.push({ x: e.x, y: (e.floor + e.ceil) / 2 - f.beam * 0.5, z: e.z, l: (e.ceil - e.floor - f.beam) / 2, h: f.post * rng.range(0.9, 1.15), w: f.post * rng.range(0.9, 1.15), yaw: p.yaw, pitch: Math.PI / 2, color: wood });
      const roof = Math.min(ends[0].ceil, ends[1].ceil), half = Math.hypot(ends[1].x - ends[0].x, ends[1].z - ends[0].z) / 2 + f.post;
      out.push({ x: (ends[0].x + ends[1].x) / 2, y: roof - f.beam, z: (ends[0].z + ends[1].z) / 2, l: f.beam, h: f.beam, w: half, yaw: p.yaw, pitch: 0, color: wood });
    }

    // Rails: two on sleepers along the middle of a level way, on the floor (the floor under the middle, so they follow its dents).
    if (!level || length < 8) continue;
    const railPts: { x: number; y: number; z: number; yaw: number }[] = [];
    for (let s = 1; s <= length - 1; s += f.sleeper) {
      const { i, t } = runAt(s), p = lerpAt(c, i, t), sp = spanAt(p.x, p.y, p.z);
      if (sp) railPts.push({ x: p.x, y: sp[0], z: p.z, yaw: heading(c, i) });
    }
    for (let k = 0; k < railPts.length; k++) {
      const p = railPts[k], q = railPts[Math.min(k + 1, railPts.length - 1)], iron = IRON[rng.int(0, IRON.length - 1)];
      out.push({ x: p.x, y: p.y + f.rail * 0.5, z: p.z, l: f.gauge * 0.62, h: f.rail * 0.5, w: f.sleeper * 0.12, yaw: p.yaw + Math.PI / 2, pitch: 0, color: WOOD[k % WOOD.length] });
      if (q === p) continue;
      const l = Math.hypot(q.x - p.x, q.z - p.z) / 2 + 0.04, yaw = Math.atan2(q.z - p.z, q.x - p.x), pitch = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z));
      for (const sg of [-1, 1]) out.push({ x: (p.x + q.x) / 2 - Math.sin(yaw) * sg * f.gauge / 2, y: (p.y + q.y) / 2 + f.rail * 1.4, z: (p.z + q.z) / 2 + Math.cos(yaw) * sg * f.gauge / 2, l, h: f.rail * 0.6, w: f.rail * 0.55, yaw, pitch, color: iron });
    }
    // A cart on the rails (the longest way's, and some others): a box body on four wheels, half full of rock.
    if (carts < f.carts && railPts.length > 6 && rng.chance(0.7)) {
      carts++;
      const p = railPts[rng.int(2, railPts.length - 3)], q = railPts[Math.min(railPts.length - 1, railPts.indexOf(p) + 1)];
      const yaw = Math.atan2(q.z - p.z, q.x - p.x), pitch = Math.atan2(q.y - p.y, Math.hypot(q.x - p.x, q.z - p.z)), body = IRON[2];
      out.push({ x: p.x, y: p.y + 0.55, z: p.z, l: 0.75, h: 0.3, w: f.gauge / 2 + 0.12, yaw, pitch, color: body });
      for (const [a, sg] of [[-0.45, -1], [-0.45, 1], [0.45, -1], [0.45, 1]] as const) out.push({ x: p.x + Math.cos(yaw) * a - Math.sin(yaw) * sg * f.gauge / 2, y: p.y + 0.2, z: p.z + Math.sin(yaw) * a + Math.cos(yaw) * sg * f.gauge / 2, l: 0.17, h: 0.17, w: 0.05, yaw, pitch: 0, color: IRON[0] });
      // Ore heaped in it.
      out.push({ x: p.x, y: p.y + 0.82, z: p.z, l: 0.6, h: 0.14, w: f.gauge / 2 - 0.05, yaw, pitch, color: 0x7a5a3c });
    }
  }
  return out;
}

/** The mesh of boxes: six faces each, flat normals, a little shade from the box's own turn so no two look alike. */
export function boxesMesh(list: readonly Box[]): PartMesh {
  const b = new PartBuilder();
  for (const [n, k] of list.entries()) {
    const cp = Math.cos(k.pitch), f = v3norm([Math.cos(k.yaw) * cp, Math.sin(k.pitch), Math.sin(k.yaw) * cp]), s = v3norm([-Math.sin(k.yaw), 0, Math.cos(k.yaw)]);
    const u: readonly [number, number, number] = [s[1] * f[2] - s[2] * f[1], s[2] * f[0] - s[0] * f[2], s[0] * f[1] - s[1] * f[0]];
    const hash = Math.sin(n * 12.9898 + k.x * 78.233 + k.z * 37.719) * 43758.5453, shade = 0.88 + 0.24 * (hash - Math.floor(hash)), r = ((k.color >> 16) & 255) * shade, g = ((k.color >> 8) & 255) * shade, bl = (k.color & 255) * shade;
    const corner = (a: number, c: number, d: number): [number, number, number] => [k.x + f[0] * a * k.l + u[0] * c * k.h + s[0] * d * k.w, k.y + f[1] * a * k.l + u[1] * c * k.h + s[1] * d * k.w, k.z + f[2] * a * k.l + u[2] * c * k.h + s[2] * d * k.w];
    // Each face: its outward axis (a, c, d) and the other two axes' signs round the face.
    const faces: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (const [a, c, d] of faces) {
      const nx = f[0] * a + u[0] * c + s[0] * d, ny = f[1] * a + u[1] * c + s[1] * d, nz = f[2] * a + u[2] * c + s[2] * d;
      // Two axes across the face.
      const p = a !== 0 ? [[0, 1, 1], [0, 1, -1], [0, -1, -1], [0, -1, 1]] : c !== 0 ? [[1, 0, 1], [1, 0, -1], [-1, 0, -1], [-1, 0, 1]] : [[1, 1, 0], [1, -1, 0], [-1, -1, 0], [-1, 1, 0]];
      const vs = p.map(([pa, pc, pd]) => { const q = corner(a !== 0 ? a : pa, c !== 0 ? c : pc, d !== 0 ? d : pd); return b.vertex(q[0], q[1], q[2], nx, ny, nz, r, g, bl, 0); });
      b.tri(vs[0], vs[1], vs[2]); b.tri(vs[0], vs[2], vs[3]);
      b.tri(vs[0], vs[2], vs[1]); b.tri(vs[0], vs[3], vs[2]);
    }
  }
  return b.build();
}
