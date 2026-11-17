/**
 * A great ruin standing at its camp (D69, Z4 in play; pure): the camp's ruin planned on the land as it lies, the ground
 * it gives (its terraces level, its stairs as ramps, so what the hero walks on is what they see), and the walls and towers
 * that stand in the way. The plan is the same wherever it is made (main thread, terrain workers): the land before the
 * ruin, the camp's seed and holders. Its front (the gate) faces −z, as the ruin's generator builds it.
 */
import type { CampDecision } from './decisions';
import type { StructuresDef } from '../setting/contract';
import { planGreatRuin, type GreatRuinPlan } from './structures/ruin';
import { ensureCCW, type Poly } from '@futuremagic/settlement';
import { dist2 } from '@futuremagic/core';

/** The Z4 kinds a camp can stand in now (their generators fit the land here). */
export const PLAYED_KINDS = ['great-ruin'] as const;

export interface CampRuin {
  readonly d: CampDecision;
  readonly plan: GreatRuinPlan;
  /** The land at the camp's middle (the plan's 0). */
  readonly y0: number;
  /** The land round the middle before the ruin, from the plan's 0 (what its mesh is fitted to). */
  readonly land: (u: number, v: number) => number;
  /** The terraces' box round the middle (local x0, z0, x1, z1). */
  readonly box: readonly [number, number, number, number];
}

/** The camp's ruin on `land` (the ground before the ruin shapes it); `holder`: the camp's holders. */
export function campRuin(d: CampDecision, defs: StructuresDef, land: (x: number, z: number) => number, holder?: string): CampRuin {
  const y0 = land(d.x, d.z), fromMiddle = (u: number, v: number) => land(d.x + u, d.z + v) - y0;
  const plan = planGreatRuin(defs, d.seed, fromMiddle, holder);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const t of plan.terraces) for (const [x, z] of t.pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
  return { d, plan, y0, land: fromMiddle, box: [x0, z0, x1, z1] };
}

/** The open ground kept round a ruin's reach, metres: the trees keep back from its walls, and it is seen whole from its edge. */
export const RUIN_OPEN = 30;

/** How far a ruin reaches from its camp's middle, metres (the land it shapes, the clearing round it). */
export const ruinReach = (r: CampRuin): number => Math.max(-r.box[0], -r.box[1], r.box[2], r.box[3], r.plan.radius);

/** The ground at (x, z) with the ruin on it: its terraces' floors and its stairs; `h` elsewhere. */
export function ruinGround(r: CampRuin, x: number, z: number, h: number): number {
  const u = x - r.d.x, v = z - r.d.z, [x0, z0, x1, z1] = r.box;
  if (u < x0 - 40 || u > x1 + 40 || v < z0 - 40 || v > z1 + 40) return h;
  let g = h;
  if (u >= x0 && u <= x1 && v >= z0 && v <= z1) g = r.y0 + r.plan.levelAt(u, v);
  // A stair is a ramp under its steps (up to the gate from the land, up from one terrace to the next).
  for (const s of r.plan.stairs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = dist2(s.a[0], s.a[1], s.b[0], s.b[1]) || 1;
    const t = ((u - s.a[0]) * dx + (v - s.a[1]) * dz) / (len * len), across = Math.abs(((u - s.a[0]) * dz - (v - s.a[1]) * dx) / len);
    if (t < 0 || t > 1 || across > s.half) continue;
    g = Math.max(s.onGround ? h : g, r.y0 + s.y0 + (s.y1 - s.y0) * t);
  }
  return g;
}

/** The ground at (x, z) with every ruin of `rs` on it (`h`: the land without them). */
export function onRuins(rs: readonly CampRuin[], x: number, z: number, h: number): number {
  for (let i = 0; i < rs.length; i++) h = ruinGround(rs[i], x, z, h);
  return h;
}

/** A wall from a to b, `thick` thick, as a solid's outline (world coordinates). */
function slab(cx: number, cz: number, a: readonly [number, number], b: readonly [number, number], thick: number): Poly {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = dist2(a[0], a[1], b[0], b[1]) || 1, nx = (-dz / len) * thick / 2, nz = (dx / len) * thick / 2;
  return ensureCCW([cx + a[0] + nx, cz + a[1] + nz, cx + b[0] + nx, cz + b[1] + nz, cx + b[0] - nx, cz + b[1] - nz, cx + a[0] - nx, cz + a[1] - nz]);
}

/** The pieces of a wall from a to b with its openings ([s0, s1] metres along) left out. */
function piecesOf(a: readonly [number, number], b: readonly [number, number], gaps: readonly (readonly [number, number])[]): [readonly [number, number], readonly [number, number]][] {
  const len = dist2(a[0], a[1], b[0], b[1]), at = (s: number): [number, number] => [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
  const out: [readonly [number, number], readonly [number, number]][] = [];
  let s = 0;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > s + 0.2) out.push([at(s), at(g0)]);
    s = Math.max(s, g1);
  }
  if (len > s + 0.2) out.push([at(s), at(len)]);
  return out;
}

/**
 * What of the ruin stands in the way (world coordinates): its towers, its curtain walls (but at their gates), and the
 * walls of its halls and wings (but at their doors: their insides are walkable).
 */
export function ruinSolids(r: CampRuin): Poly[] {
  const { plan } = r, cx = r.d.x, cz = r.d.z, out: Poly[] = [];
  for (const t of plan.towers) out.push(ensureCCW(t.pts.flatMap(([x, z]) => [cx + x, cz + z])));
  for (const c of plan.curtains) {
    const len = dist2(c.a[0], c.a[1], c.b[0], c.b[1]);
    for (const [a, b] of piecesOf(c.a, c.b, c.gate !== null ? [[len * c.gate - 2, len * c.gate + 2]] : [])) out.push(slab(cx, cz, a, b, c.thick));
  }
  for (const bl of plan.blocks) {
    const [x0, z0, x1, z1] = bl.box, corners: [number, number][] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
    const doorW = bl.kind === 'crypt' ? 1.6 : bl.kind === 'hall' ? 3 : 2.2, t = bl.kind === 'hall' ? 1.2 : 0.9;
    // Sides 0 −z, 1 +x, 2 +z, 3 −x (the ruin's own numbering).
    const sides: [number, [number, number], [number, number]][] = [[0, corners[0], corners[1]], [1, corners[1], corners[2]], [2, corners[2], corners[3]], [3, corners[3], corners[0]]];
    for (const [side, a, b] of sides) {
      const len = dist2(a[0], a[1], b[0], b[1]);
      const gaps: [number, number][] = bl.doors.includes(side) ? [[len / 2 - doorW / 2, len / 2 + doorW / 2]] : [];
      for (const [p, q] of piecesOf(a, b, gaps)) out.push(slab(cx, cz, p, q, t));
    }
  }
  return out;
}
