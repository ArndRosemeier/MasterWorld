/**
 * A tower of a camp's structure (D69, Z4; pure): square, round or eight-sided walls round a hollow, a way through it
 * or a door into it, slits or windows by the storey, and its top as its builder made it and time left it: a pyramid or
 * cone roof, crenels, a corbelled gallery (machicolations), a timber hoarding, rafters burned bare, or broken off
 * towards one side in courses; rebuilt above some height in another stone where a later hand patched it.
 */
import { smoothstep } from '@futuremagic/core';
import type { StructureArch } from '../../setting/contract';
import { BuildingMat, CellarMat, scaleTint, type Tint } from '../dungeon/meshKit';
import { annulus, beam, centroid, floorOf, inset, wallRing, spire, wall as wallOf, type Opening, type P2, type Site } from './masonry';
import type { Style } from './style';

export type TowerTop = 'spire' | 'crenels' | 'machicolations' | 'hoarding' | 'burned';

export interface TowerSpec {
  /** The outer walls in plan. */
  readonly pts: readonly P2[];
  /** The walls' foot: null into the ground. */
  readonly base: number | null;
  /** The lowest floor inside (a deck, a court's flags). */
  readonly floor: number;
  /** Where the walls' top stands when whole. */
  readonly top: number;
  readonly roof: TowerTop;
  readonly thick: number;
  /** Ways through at floor level: on these sides, `half` wide each side of the side's middle, springing at `spring`. */
  readonly ways?: { readonly sides: readonly number[]; readonly half: number; readonly spring: number; readonly arch: StructureArch; readonly sill?: number };
  /** 0 whole .. 1 broken down to its foot (towards `fallSide`, a side's index). */
  readonly broken: number;
  readonly fallSide: number;
  /** Patched with other stone from this height up. */
  readonly rebuilt?: { readonly y: number; readonly mat: number; readonly tint: Tint };
  /** Windows: narrow slits (true) or arched windows. */
  readonly slits: boolean;
  /** Any wall it stands against: these sides get no windows. */
  readonly blind?: readonly number[];
  /** Merlons as wide as the gaps (1) or broad (2). */
  readonly merlon: number;
  /** No floor of its own at `floor` (it stands on one: a terrace's). */
  readonly noFloor?: boolean;
}

/** Height of a storey, metres. */
const STOREY = 3.6;

/** The walls' top where it has fallen: highest far from the fallen side, coming down towards it in courses. */
function brokenTop(spec: TowerSpec, x: number, z: number, jag: number): number {
  if (spec.broken <= 0) return spec.top;
  const c = centroid(spec.pts), f = spec.pts[spec.fallSide], g = spec.pts[(spec.fallSide + 1) % spec.pts.length];
  const fx = (f[0] + g[0]) / 2, fz = (f[1] + g[1]) / 2, size = Math.hypot(fx - c[0], fz - c[1]) * 2 || 1;
  const near = Math.min(1, Math.hypot(x - fx, z - fz) / size);
  const h = spec.top - spec.floor, fall = (1 - smoothstep(0, 1, near)) * h * spec.broken + spec.broken * h * 0.12;
  return spec.top - Math.round((fall + jag) / 0.45) * 0.45;
}

/** A tower as its spec says, in the builder's style. */
export function tower(site: Site, style: Style, spec: TowerSpec): void {
  const { k, rng } = site, n = spec.pts.length;
  const roofed = spec.roof === 'spire' || spec.roof === 'hoarding' || spec.roof === 'burned';
  const intact = spec.broken < 0.05;
  // The walls stop under a corbelled gallery; crenels stand on them; a roof sits on them.
  const wallTop = intact && spec.roof === 'machicolations' ? spec.top - 1.6 : spec.top;
  const merlonW = 0.8 * spec.merlon, gapW = 0.7;
  const jags = new Map<string, number>();
  const jagAt = (x: number, z: number) => { const key = `${Math.round(x * 2)},${Math.round(z * 2)}`; let j = jags.get(key); if (j === undefined) jags.set(key, (j = rng.range(0, spec.broken > 0 ? 1.4 : 0))); return j; };
  const walls = wallRing(spec.pts, spec.thick, (i, len) => {
    const a = spec.pts[i], b = spec.pts[(i + 1) % n], ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const crenels = intact && spec.roof === 'crenels';
    const breaks: number[] = [];
    if (crenels) for (let s = gapW / 2; s < len; s += merlonW + gapW) breaks.push(s, s + merlonW);
    const top = (s: number) => {
      const x = a[0] + ux * s, z = a[1] + uz * s;
      let t = intact ? wallTop : brokenTop(spec, x, z, jagAt(x, z));
      if (crenels) { const m = ((s - gapW / 2) % (merlonW + gapW) + merlonW + gapW) % (merlonW + gapW); if (m < merlonW && s > gapW / 2 - 1e-6) t += 0.95; }
      return Math.max(spec.floor + 0.6, t);
    };
    const openings: Opening[] = [];
    const mid = len / 2;
    if (spec.ways?.sides.includes(i)) openings.push({ s0: mid - spec.ways.half, s1: mid + spec.ways.half, y0: spec.ways.sill ?? spec.floor, y1: spec.ways.spring, arch: spec.ways.arch });
    if (!spec.blind?.includes(i) && len > 2.2) {
      // Windows by the storey above the way in, up to under the top; slits on a long side in threes.
      // Windows by the storey, one to a side; slits on a long side in threes, every storey.
      const across = spec.slits && len > 7 ? [len / 4, mid, (3 * len) / 4] : [mid];
      for (let y = spec.floor + STOREY + 0.9, st = 0; y + 2.2 < wallTop; y += STOREY, st++) for (const s of across) {
        if (!spec.slits && (st + i) % 2 === 1) continue;
        if (spec.ways?.sides.includes(i) && Math.abs(s - mid) < spec.ways.half + 0.8 && y < spec.ways.spring + 3) continue;
        const half = spec.slits ? 0.16 : 0.45;
        openings.push({ s0: s - half, s1: s + half, y0: y, y1: y + (spec.slits ? 1.3 : 1.2), arch: spec.slits ? 'flat' : 'round' });
      }
    }
    return { base: spec.base, top, stepped: true, breaks, openings, mat: style.wall, tint: style.tint, trimMat: style.trimMat, trimTint: style.trim, capA: Infinity, capB: Infinity };
  });
  const rebuilt = spec.rebuilt;
  for (const w of walls) {
    if (!rebuilt) { wallOf(site, w); continue; }
    const top = w.top;
    wallOf(site, { ...w, top: (s) => Math.min(rebuilt.y, top(s)) });
    wallOf(site, { ...w, base: rebuilt.y, top: (s) => Math.max(rebuilt.y, top(s)), mat: rebuilt.mat, tint: rebuilt.tint, trimMat: rebuilt.mat, trimTint: rebuilt.tint, openings: w.openings?.filter((o) => o.y0 > rebuilt.y) });
  }
  const inner = inset(spec.pts, spec.thick);
  if (!spec.noFloor) floorOf(k, inner, spec.floor, style.floor, style.floorTint);
  // The floor under an open top (the wall-walk), where it still stands.
  const lowest = intact ? wallTop : Math.min(...spec.pts.map((p) => brokenTop(spec, p[0], p[1], 0)));
  if (!roofed && lowest - 1.2 > spec.floor + 3) floorOf(k, inner, lowest - 1.2, style.floor, scaleTint(style.floorTint, 0.9));
  if (!intact) return;
  const size = Math.max(...spec.pts.map((p) => Math.hypot(p[0] - centroid(spec.pts)[0], p[1] - centroid(spec.pts)[1])));
  const pitch = (n === 4 ? 1.1 : 1.5) * style.builder.tall;
  if (spec.roof === 'spire') spire(k, inset(spec.pts, -0.45), spec.top, spec.top + size * pitch, style.roof, style.roofTint);
  if (spec.roof === 'burned') {
    // Bare rafters, charred, from the eaves to where the ridge was; a few fallen.
    const c = centroid(spec.pts), apex = [c[0], spec.top + size * pitch * 0.9, c[1]];
    // (Each stops a little short of the ridge, so two in one plane never lie over each other.)
    for (const p of inset(spec.pts, -0.2)) if (rng.chance(0.75)) beam(k, [p[0], spec.top, p[1]], rng.chance(0.8) ? apex.map((v, i) => v + ([p[0], spec.top, p[1]][i] - v) * 0.08) : [c[0] + rng.range(-1, 1), spec.top + 0.5, c[1] + rng.range(-1, 1)], 0.18, 0.18, BuildingMat.Oak, [38, 32, 28]);
  }
  if (spec.roof === 'machicolations') {
    // A gallery on corbels round the top: its parapet with crenels, its floor's underside, the corbels under it.
    const out = inset(spec.pts, -0.6);
    wallRing(out, 0.6, (_i, len) => {
      const breaks: number[] = [];
      for (let s = gapW / 2; s < len; s += merlonW + gapW) breaks.push(s, s + merlonW);
      return { base: wallTop, top: (s) => { const m = ((s - gapW / 2) % (merlonW + gapW) + merlonW + gapW) % (merlonW + gapW); return wallTop + 1.1 + (m < merlonW && s > gapW / 2 ? 0.95 : 0); }, stepped: true, breaks, mat: style.wall, tint: style.trim };
    }).forEach((w) => wallOf(site, w));
    annulus(k, out, spec.pts, wallTop, style.wall, style.trim, false);
    floorOf(k, inner, wallTop, style.floor, style.floorTint);
    for (let i = 0; i < n; i++) {
      const a = spec.pts[i], b = spec.pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), oa = out[i], ob = out[(i + 1) % n];
      for (let s = 0.6; s < len - 0.3; s += 1.3) {
        const t = s / len, wx = a[0] + (b[0] - a[0]) * t, wz = a[1] + (b[1] - a[1]) * t, ox = oa[0] + (ob[0] - oa[0]) * t, oz = oa[1] + (ob[1] - oa[1]) * t;
        beam(k, [wx * 0.97 + ox * 0.03, wallTop - 1.1, wz * 0.97 + oz * 0.03], [ox, wallTop - 0.02, oz], 0.32, 0.32, style.wall, scaleTint(style.trim, 0.9));
      }
    }
  }
  if (spec.roof === 'hoarding') {
    // A timber gallery round the top on brackets, boarded, under the roof's wide eaves.
    const out = inset(spec.pts, -1), y0 = spec.top - 2.4;
    wallRing(out, 0.14, (_i, len) => ({ base: y0, top: () => spec.top - 0.05, breaks: [], openings: len > 2 ? [{ s0: len / 2 - 0.35, s1: len / 2 + 0.35, y0: y0 + 1, y1: y0 + 1.8, arch: 'flat' as const }] : [], mat: CellarMat.Boards, tint: style.timber, stepped: true })).forEach((w) => wallOf(site, w));
    annulus(k, out, spec.pts, y0, CellarMat.Boards, scaleTint(style.timber, 0.7), false);
    for (let i = 0; i < n; i++) {
      const a = spec.pts[i], o = out[i];
      beam(k, [a[0], y0 - 1.2, a[1]], [o[0], y0 - 0.05, o[1]], 0.18, 0.18, BuildingMat.Oak, scaleTint(style.timber, 0.8));
    }
    spire(k, inset(spec.pts, -1.3), spec.top - 0.05, spec.top + size * pitch, style.roof, style.roofTint);
  }
}
