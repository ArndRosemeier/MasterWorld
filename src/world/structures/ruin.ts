/**
 * The great ruin (D69, Z4; pure): the old realm's halls gone to the dead, the kind of camp that takes an evening to
 * learn. A grammar of parts, each from the seed, so two of them look very distinct (Arnd 2026-11-17):
 *
 * - **Layout**: axial (a gate, one court or two, the hall across the end), a cloister (a square court with an
 *   arcade, wings on three sides, the hall on the fourth), terraced (courts stepping up a slope, the hall on top),
 *   a citadel (a ring of curtain walls and towers round a hall and a keep) or scattered halls round an open court.
 * - **Its parts**: halls (one or two storeys high, an apse or not, columns, transverse arches left standing where
 *   the roof fell), wings, a gatehouse, a great tower that is seen from afar, corner towers, curtain walls with
 *   wall-walks and stairs up to them, a crypt's house with its door into the dark.
 * - **The land**: terraces at the levels the land asks for, retaining walls where it falls away, steps between.
 * - **Who built it**, **how far it has fallen** (roofs, walls broken in courses, breaches, fallen columns, rubble),
 *   **grown over**, and **its holders**: graves, bones, coffins, tattered banners, cages.
 *
 * Its front (the gate) faces −z. `planGreatRuin` reads the land and decides, `greatRuinMesh` builds.
 */
import { Noise, Rng, deriveSeed, type Ground } from '@futuremagic/core';
import type { StructureArch, StructureAddition, StructuresDef } from '../../setting/contract';
import { MeshKit, WildMat, mixTint, scaleTint, type PlacedMesh, type Tint } from '../dungeon/meshKit';
import { archRise, grimed, centroid, roundPts, floorOf, gable, inset, line, prism, rect, wallRing, rubble, steps, wall, type Opening, type P2, type Site } from './masonry';
import { banner, bones, cage, coffin, grave, room, skull, stake } from './props';
import { tower, type TowerTop } from './tower';
import { apart, fallen, pickStructure, styleOf, type Picks, type Signature, type Style } from './style';

export type RuinLayout = 'axial' | 'cloister' | 'terraced' | 'citadel' | 'scattered';
type Box = readonly [number, number, number, number];

export interface Block {
  readonly kind: 'hall' | 'wing' | 'chapel' | 'crypt';
  readonly box: Box;
  /** The ridge runs along x (0) or z (1). */
  readonly axis: 0 | 1;
  readonly storeys: number;
  /** The apse's side (0 −z, 1 +x, 2 +z, 3 −x), if it has one. */
  readonly apse: number | null;
  readonly roof: 'roof' | 'ribs' | 'open';
  readonly columns: boolean;
  readonly doors: readonly number[];
  readonly broken: number;
}
export interface RTower { readonly pts: readonly P2[]; readonly top: number; readonly roof: TowerTop; readonly broken: number; readonly fallSide: number; readonly great: boolean; readonly ways?: readonly number[] }
export interface Curtain { readonly a: P2; readonly b: P2; readonly height: number; readonly thick: number; readonly breaches: readonly [number, number][]; readonly gate: number | null }
export interface Arcade { readonly a: P2; readonly b: P2; readonly height: number }

export interface GreatRuinPlan {
  readonly seed: number;
  readonly picks: Picks;
  readonly layout: RuinLayout;
  readonly blocks: readonly Block[];
  readonly towers: readonly RTower[];
  readonly curtains: readonly Curtain[];
  readonly arcades: readonly Arcade[];
  /** The terraces: their boxes and levels (a citadel's one is its ring's inside). */
  readonly terraces: readonly { readonly pts: readonly P2[]; readonly level: number; readonly walled: boolean }[];
  readonly stairs: readonly { readonly a: P2; readonly b: P2; readonly y0: number; readonly y1: number; readonly half: number; readonly onGround: boolean }[];
  readonly adds: readonly StructureAddition[];
  /** Where its gate is (x, z, the floor there), its middle, how far it reaches, its lowest ground and highest point. */
  readonly gate: readonly [number, number, number];
  readonly cx: number;
  readonly cz: number;
  readonly radius: number;
  readonly low: number;
  readonly high: number;
  readonly levelAt: (x: number, z: number) => number;
}

const boxPts = (b: Box): P2[] => [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
const overlaps = (a: Box, b: Box, m = 0) => a[0] < b[2] + m && b[0] < a[2] + m && a[1] < b[3] + m && b[1] < a[3] + m;

/** `holder`: who holds it (a camp's own, D69), else the kind's usual ones. */
export function planGreatRuin(defs: StructuresDef, seed: number, ground: Ground, holder?: string): GreatRuinPlan {
  const rng = new Rng(deriveSeed(seed, 'ruin'));
  const picks = pickStructure(defs, 'great-ruin', rng, holder), b = picks.builder, fall = fallen(picks.state);
  const slope = Math.abs(ground(0, 40) - ground(0, -40)) / 80;
  const layout = rng.weighted<RuinLayout>(['axial', 'cloister', 'terraced', 'citadel', 'scattered'], (l) => ({ axial: 2, cloister: 2, terraced: slope > 0.08 ? 4 : 1, citadel: 2, scattered: 1 })[l]);
  const S = rng.range(62, 96), t = b.thick;
  const blocks: Block[] = [], towers: RTower[] = [], curtains: Curtain[] = [], arcades: Arcade[] = [];
  const ruinBroken = (min = 0) => Math.max(min, fall === 0 ? 0 : rng.range(0.15, 0.35) + fall * rng.range(0.2, 0.55));
  const roofOf = (): Block['roof'] => (fall < 0.4 && rng.chance(0.7) ? 'roof' : rng.chance(0.5) ? 'ribs' : 'open');
  const block = (kind: Block['kind'], box: Box, axis: 0 | 1, storeys: number, doors: number[], apse: number | null = null): void => {
    blocks.push({ kind, box, axis, storeys, apse, roof: kind === 'crypt' ? 'roof' : roofOf(), columns: kind === 'hall' && rng.chance(0.6), doors, broken: kind === 'crypt' ? 0 : ruinBroken() });
  };
  const towerRoof = (): TowerTop => rng.pick<TowerTop>(b.ornament.includes('machicolations') ? ['machicolations', 'crenels', 'spire'] : b.ornament.includes('hoardings') ? ['hoarding', 'spire', 'crenels'] : ['spire', 'crenels', 'crenels']);
  const towerAt = (x: number, z: number, r: number, h: number, great: boolean, ways?: number[]) => {
    const shape = great ? rng.pick(b.towers) : rng.pick(b.towers);
    const pts = shape === 'square' || ways ? rect(x, z, r, r) : roundPts(x, z, r, shape === 'round' ? 14 : 8, shape === 'octagon' ? Math.PI / 8 : 0);
    const broken = great ? (fall > 0.6 ? rng.range(0.1, 0.35) : fall > 0 && rng.chance(0.3) ? rng.range(0.1, 0.2) : 0) : ruinBroken();
    towers.push({ pts, top: h, roof: towerRoof(), broken, fallSide: rng.int(0, pts.length - 1), great, ways });
  };
  const greatH = rng.range(24, 40) * b.tall, smallH = rng.range(10, 15) * b.tall, curtainH = rng.range(6.5, 9.5) * b.tall;
  const curtain = (a: P2, c: P2, gate: number | null = null) => {
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]), breaches: [number, number][] = [];
    for (let s = 3; s < len - 6; s += 10) if (rng.chance(fall * 0.5)) breaches.push([s, s + rng.range(3, 8)]);
    curtains.push({ a, b: c, height: curtainH, thick: 2.2 * t, breaches, gate });
  };
  let gate: P2 = [0, -S / 2];
  if (layout === 'axial') {
    const cw = S * rng.range(0.5, 0.72), c1 = S * rng.range(0.32, 0.45), z0 = -S / 2, z1 = z0 + c1;
    const hallAcross = rng.chance(0.55), hd = rng.range(14, 19) * t;
    const second = rng.chance(0.5), z2 = second ? z1 + S * rng.range(0.22, 0.3) : z1;
    towerAt(0, z0, 5, smallH * 1.1, false, [0, 2]);
    curtain([-cw / 2, z0], [-5, z0]); curtain([5, z0], [cw / 2, z0]);
    curtain([-cw / 2, z0], [-cw / 2, z2 - 0.3]); curtain([cw / 2, z2 - 0.3], [cw / 2, z0]);
    towerAt(-cw / 2, z0, 3.6, smallH, false); towerAt(cw / 2, z0, 3.6, smallH, false);
    if (second) { block('wing', [-cw / 2 + 2.2 * t, z1, -cw / 2 + 2.2 * t + 9, z2], 1, 2, [1]); block('wing', [cw / 2 - 2.2 * t - 9, z1, cw / 2 - 2.2 * t, z2], 1, 2, [3]); }
    if (hallAcross) block('hall', [-cw / 2, z2, cw / 2, z2 + hd], 0, rng.int(1, 2), [0], rng.chance(0.4) ? 2 : null);
    else block('hall', [-hd / 2, z2, hd / 2, z2 + S * rng.range(0.4, 0.55)], 1, rng.int(1, 2), [0], rng.chance(0.6) ? 2 : null);
    const back = Math.max(...blocks.map((q) => q.box[3]));
    towerAt(rng.sign() * (cw / 2), back - 4, rng.range(5, 6.5), greatH, true);
  } else if (layout === 'cloister' || layout === 'scattered') {
    const cs = S * rng.range(0.34, 0.44), wd = rng.range(8, 10) * t, cz = -S * 0.04;
    const court: Box = [-cs / 2, cz - cs / 2, cs / 2, cz + cs / 2];
    if (layout === 'cloister') {
      block('wing', [court[0] - wd, court[1], court[0], court[3]], 1, 2, [1]);
      block('wing', [court[2], court[1], court[2] + wd, court[3]], 1, 2, [3]);
      block('wing', [court[0] - wd, court[1] - wd, -3, court[1]], 0, 2, [2]);
      block('wing', [3, court[1] - wd, court[2] + wd, court[1]], 0, 2, [2]);
      towerAt(0, court[1] - wd / 2, 3.4, smallH * 0.9, false, [0, 2]);
      gate = [0, court[1] - wd];
      const hd = rng.range(15, 20) * t;
      block('hall', [court[0] - wd, court[3], court[2] + wd, court[3] + hd], 0, rng.int(1, 2), [0], rng.chance(0.4) ? 2 : null);
      const inset2 = 3.2;
      const c = [court[0] + inset2, court[1] + inset2, court[2] - inset2, court[3] - inset2];
      const h = rng.range(4.5, 6) * b.tall;
      arcades.push({ a: [c[0], c[1]], b: [c[2], c[1]], height: h }, { a: [c[2], c[1]], b: [c[2], c[3]], height: h }, { a: [c[2], c[3]], b: [c[0], c[3]], height: h }, { a: [c[0], c[3]], b: [c[0], c[1]], height: h });
      towerAt(rng.sign() * (court[2] + wd), court[1] - wd, rng.range(5, 6.5), greatH, true);
    } else {
      // Halls round an open court, joined by low walls; the great tower apart.
      const n = rng.int(3, 5), r = S * rng.range(0.34, 0.42);
      const placed: Box[] = [];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + Math.PI * 0.35 + (i / Math.max(1, n - 1)) * Math.PI * 1.3 + rng.range(-0.15, 0.15);
        const along = rng.chance(0.5), l = rng.range(16, 30), w = rng.range(9, 14) * t, x = Math.cos(a) * r, z = Math.sin(a) * r + cz;
        const box: Box = along ? [x - l / 2, z - w / 2, x + l / 2, z + w / 2] : [x - w / 2, z - l / 2, x + w / 2, z + l / 2];
        if (placed.some((p) => overlaps(p, box, 2))) continue;
        placed.push(box);
        const door = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) > 0 ? 3 : 1) : Math.sin(a) > 0 ? 0 : 2;
        block(i === 0 || l > 26 ? 'hall' : 'wing', box, along ? 0 : 1, rng.int(1, 2), [door], rng.chance(0.3) ? (door + 2) % 4 : null);
      }
      const ga = rng.range(-0.6, 0.6) + (rng.chance(0.5) ? 0 : Math.PI);
      towerAt(Math.cos(ga) * S * 0.48, cz + Math.sin(ga) * S * 0.3, rng.range(5, 6.5), greatH, true);
    }
  } else if (layout === 'terraced') {
    const cw = S * rng.range(0.5, 0.7), d = S / 3;
    towerAt(0, -S / 2, 4.5, smallH, false, [0, 2]);
    curtain([-cw / 2, -S / 2], [-4.5, -S / 2]); curtain([4.5, -S / 2], [cw / 2, -S / 2]);
    curtain([-cw / 2, -S / 2], [-cw / 2, -S / 2 + d]); curtain([cw / 2, -S / 2 + d], [cw / 2, -S / 2]);
    block('wing', [-cw / 2, -S / 2 + d, -cw / 2 + 10 * t, -S / 2 + 2 * d], 1, 2, [1]);
    block('wing', [cw / 2 - 10 * t, -S / 2 + d, cw / 2, -S / 2 + 2 * d], 1, 2, [3]);
    if (rng.chance(0.6)) block('chapel', [-6, -S / 2 + d + 4, 6, -S / 2 + 2 * d - 4], 1, 1, [0], 2);
    block('hall', [-cw / 2, -S / 2 + 2 * d + 2, cw / 2 * rng.range(0.4, 1), S / 2], 0, rng.int(1, 2), [0], rng.chance(0.4) ? 1 : null);
    towerAt(cw / 2 - 6, S / 2 - 6, rng.range(5, 6.5), greatH, true);
  } else {
    // A citadel: a ring of curtain walls with towers at its corners; inside a hall and a keep.
    const n = rng.int(6, 8), R = S / 2 * rng.range(0.85, 1.05), g = 5;
    const pts: P2[] = [[g, -R]];
    for (let i = 1; i < n - 1; i++) { const a = -Math.PI / 2 + 0.45 + ((i - 0.5) / (n - 2)) * (2 * Math.PI - 0.9), rr = R * rng.range(0.82, 1.08); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    pts.push([-g, -R]);
    for (let i = 1; i < pts.length; i++) curtain(pts[i - 1], pts[i]);
    // (Between the last corner and the first stands the gatehouse itself: no wall through it.)
    for (let i = 1; i < pts.length - 1; i++) towerAt(pts[i][0], pts[i][1], rng.range(3.2, 4.4), smallH, false);
    towerAt(0, -R, g, smallH * 1.15, false, [0, 2]);
    const hall: Box = rng.chance(0.5) ? [-R * 0.45, R * 0.05, R * 0.35, R * 0.05 + 16 * t] : [-R * 0.1, -R * 0.3, -R * 0.1 + 16 * t, R * 0.5];
    block('hall', hall, hall[2] - hall[0] > hall[3] - hall[1] ? 0 : 1, rng.int(1, 2), [hall[2] - hall[0] > hall[3] - hall[1] ? 0 : 3], null);
    towerAt(rng.chance(0.5) ? -R * 0.45 : R * 0.45, -R * 0.15, rng.range(5.5, 7), greatH, true);
  }
  // Sometimes a second great tower, its twin or a lesser one, across from the first.
  const first = towers.find((q) => q.great);
  if (first && rng.chance(0.3)) {
    const xs = first.pts.map((q) => q[0]), zs = first.pts.map((q) => q[1]), fx = (Math.min(...xs) + Math.max(...xs)) / 2, fz = (Math.min(...zs) + Math.max(...zs)) / 2;
    towerAt(-fx, fz + rng.range(-6, 6), rng.range(4.5, 6), greatH * rng.range(0.6, 1), true);
  }
  // A crypt's house: in a court, its door into the dark.
  const solid = [...blocks.map((q) => q.box), ...towers.map((q) => { const xs = q.pts.map((p) => p[0]), zs = q.pts.map((p) => p[1]); return [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] as Box; })];
  for (let i = 0; i < 40; i++) {
    const x = rng.range(-S * 0.3, S * 0.3), z = rng.range(-S * 0.25, S * 0.3), box: Box = [x - 2.6, z - 3, x + 2.6, z + 3];
    if (solid.some((q) => overlaps(q, box, 3)) || curtains.some((c) => segNear(c, x, z, 6))) continue;
    block('crypt', box, 1, 1, [0]);
    break;
  }
  // Terraces: one for a citadel (inside its ring), else bands along z at the land's levels.
  const all = [...blocks.map((q) => q.box), ...solid, ...curtains.map((c) => [Math.min(c.a[0], c.b[0]), Math.min(c.a[1], c.b[1]), Math.max(c.a[0], c.b[0]), Math.max(c.a[1], c.b[1])] as Box)];
  const bx0 = Math.min(...all.map((q) => q[0])) - 1.5, bz0 = Math.min(...all.map((q) => q[1])) - 1.5, bx1 = Math.max(...all.map((q) => q[2])) + 1.5, bz1 = Math.max(...all.map((q) => q[3])) + 1.5;
  // A terrace's level: a little over most of the land under it (a hump may come up through its floor, as earth over old flags).
  const maxOn = (pts: readonly P2[]) => {
    const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), ys: number[] = [];
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 3) for (let z = Math.min(...zs); z <= Math.max(...zs); z += 3) ys.push(ground(x, z));
    ys.sort((a, c) => a - c);
    return ys[Math.floor(ys.length * 0.7)] + 0.3;
  };
  const terraces: GreatRuinPlan['terraces'][number][] = [];
  const stairs: GreatRuinPlan['stairs'][number][] = [];
  if (layout === 'citadel') {
    const ringPts = [curtains[0].a, ...curtains.map((c) => c.b)].slice(0, curtains.length);
    terraces.push({ pts: inset(ringPts, curtains[0].thick), level: maxOn(ringPts), walled: false });
  } else {
    const rise = ground(0, bz1) - ground(0, bz0);
    const nb = layout === 'terraced' ? 3 : Math.max(1, Math.min(3, Math.round(Math.abs(rise) / 5)));
    const cuts = Array.from({ length: nb + 1 }, (_, i) => bz0 + ((bz1 - bz0) * i) / nb);
    // Bands break between blocks where they can: a cut moved off any block it would split.
    for (let i = 1; i < nb; i++) for (const q of blocks) {
      if (cuts[i] <= q.box[1] || cuts[i] >= q.box[3]) continue;
      // (Half a metre off the block's wall, so the terrace's wall never lies in its face.)
      const to = q.box[3] - cuts[i] < cuts[i] - q.box[1] ? q.box[3] + 0.5 : q.box[1] - 0.5;
      if (to - cuts[i - 1] > 8 && cuts[i + 1] - to > 8) cuts[i] = to;
    }
    for (let i = 0; i < nb; i++) { const pts = boxPts([bx0, cuts[i], bx1, cuts[i + 1]]); terraces.push({ pts, level: maxOn(pts), walled: true }); }
    // Steps up between bands, and up from the land to the gate.
    for (let i = 1; i < terraces.length; i++) {
      const lo = terraces[i - 1], hi = terraces[i], zb = lo.pts[2][1], dy = hi.level - lo.level;
      if (Math.abs(dy) < 0.4) continue;
      const run = Math.abs(dy) / 0.3 * 0.4, x = rng.range(bx0 * 0.3, bx1 * 0.3);
      if (dy > 0) stairs.push({ a: [x, zb - run], b: [x, zb], y0: lo.level, y1: hi.level, half: rng.range(1.5, 3), onGround: false });
      else stairs.push({ a: [x, zb + run], b: [x, zb], y0: hi.level, y1: lo.level, half: rng.range(1.5, 3), onGround: false });
    }
  }
  const levelAt = (_x: number, z: number) => {
    for (const tr of terraces) { const zs = tr.pts.map((p) => p[1]); if (z >= Math.min(...zs) - 0.01 && z <= Math.max(...zs) + 0.01) return tr.level; }
    return terraces[0].level;
  };
  const front = Math.min(...terraces[0].pts.map((p) => p[1]));
  const fl = levelAt(gate[0], gate[1] + 1);
  // The gate stair's foot stands on the land where it ends (down a slope that is further out than 2 m before the front).
  let run = 0, gy = ground(gate[0], front - 2);
  for (let i = 0; i < 4 && fl - gy > 0.5; i++) { run = Math.min(40, ((fl - gy) / 0.3) * 0.4); gy = ground(gate[0], front - run); }
  if (fl - gy > 0.5 && layout !== 'citadel') stairs.push({ a: [gate[0], front - run], b: [gate[0], front], y0: gy, y1: fl, half: 2.5, onGround: true });
  const adds = [...picks.holder.always, ...rng.sample(picks.holder.adds, rng.int(2, 3))];
  let low = Infinity;
  for (let x = bx0; x <= bx1; x += 4) for (let z = bz0; z <= bz1; z += 4) low = Math.min(low, ground(x, z));
  const high = Math.max(...towers.map((q) => levelAt(q.pts[0][0], q.pts[0][1]) + q.top * (1 - q.broken * 0.5) + (q.roof === 'spire' ? 6 : 0)));
  return {
    seed, picks, layout, blocks, towers: towers.map((q) => ({ ...q })), curtains, arcades, terraces, stairs, adds, gate: [gate[0], gate[1], fl],
    cx: (bx0 + bx1) / 2, cz: (bz0 + bz1) / 2, radius: Math.max(bx1 - bx0, bz1 - bz0, high - low) / 2 + 8, low, high, levelAt,
  };
}

/** Whether (x, z) is within d of a curtain's line. */
function segNear(c: Curtain, x: number, z: number, d: number): boolean {
  const dx = c.b[0] - c.a[0], dz = c.b[1] - c.a[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - c.a[0]) * dx + (z - c.a[1]) * dz) / l2));
  return Math.hypot(c.a[0] + dx * t - x, c.a[1] + dz * t - z) < d;
}

export const RUIN_WEIGHTS: Readonly<Record<string, number>> = { builder: 2, layout: 2, blocks: 1, towers: 1, terraces: 1, great: 1, greatShape: 1, twin: 1, size: 1, state: 1, apse: 0.5, ribs: 0.5, roofed: 0.5, arcade: 1, curtain: 1, moss: 0.5 };
export function ruinSignature(p: GreatRuinPlan): Signature {
  const great = p.towers.find((t) => t.great);
  return {
    builder: p.picks.builder.id, layout: p.layout, halls: p.blocks.filter((b) => b.kind === 'hall' || b.kind === 'chapel').length, blocks: p.blocks.filter((b) => b.kind !== 'crypt').length, towers: p.towers.length > 6 ? 7 : p.towers.length,
    greatShape: great ? (great.pts.length === 4 ? 'square' : great.pts.length === 8 ? 'octagon' : 'round') : 'none', twin: p.towers.filter((t) => t.great).length, roofed: p.blocks.some((b) => b.kind !== 'crypt' && b.roof === 'roof' && b.broken < 0.25) ? 1 : 0, moss: p.picks.moss > 0.5 ? 1 : 0,
    terraces: p.terraces.length, great: great ? Math.round(great.top * (1 - great.broken) / 8) : 0, size: Math.round(p.radius / 15), state: p.picks.state,
    apse: p.blocks.some((b) => b.apse !== null) ? 1 : 0, ribs: p.blocks.some((b) => b.roof === 'ribs') ? 1 : 0, arcade: p.arcades.length ? 1 : 0, curtain: p.curtains.length ? 1 : 0,   };
}
export const ruinsApart = (a: GreatRuinPlan, b: GreatRuinPlan): number => apart(ruinSignature(a), ruinSignature(b), RUIN_WEIGHTS);

const DARK: Tint = [12, 11, 10];

export function greatRuinMesh(p: GreatRuinPlan, ground: Ground): PlacedMesh {
  const k = new MeshKit(), rng = new Rng(deriveSeed(p.seed, 'ruin-mesh')), noise = new Noise(deriveSeed(p.seed, 'ruin-wear'));
  // A ruin is old whatever is left of it: its stone grimed and streaked, more so the further it has fallen.
  const site: Site = { k, rng, ground, moss: p.picks.moss, wear: 0.6 + fallen(p.picks.state) * 0.4 };
  const base = styleOf(p.picks.builder), style: Style = { ...base, floorTint: grimed(base.floorTint, site.wear!) }, fall = fallen(p.picks.state), arch: StructureArch = p.picks.arch === 'flat' ? 'segmental' : p.picks.arch;
  const floorMat = p.picks.moss > 0.6 ? WildMat.Grass : style.floor;
  const floorTint = p.picks.moss > 0.6 ? ([196, 206, 168] as Tint) : mixTint(style.floorTint, [120, 132, 96], p.picks.moss * 0.5);
  // Terraces: retaining walls to their level and their floor.
  for (const tr of p.terraces) {
    // (Its top 1 cm under the level: a sill or a floor standing on it at the level draws over it, not into it.)
    if (tr.walled) wallRing(tr.pts, 1.4, () => ({ base: null, top: () => tr.level - 0.01, mat: style.wall, tint: style.tint, trimMat: style.trimMat, trimTint: style.trim, capA: Infinity, capB: Infinity })).forEach((w) => wall(site, w));
    // (5 mm under its level: a sill or a step's top at the level draws over it, not into it.)
    floorOf(k, tr.walled ? inset(tr.pts, 1.4) : tr.pts, tr.level - 0.005, floorMat, floorTint);
    // Buttresses along a tall retaining wall's outer face, so a terrace reads as built, not as a slab.
    if (tr.walled) {
      const c = centroid(tr.pts);
      tr.pts.forEach((a, i) => {
        const b = tr.pts[(i + 1) % tr.pts.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]), tx = (b[0] - a[0]) / len, tz = (b[1] - a[1]) / len;
        const side = ((a[0] + b[0]) / 2 - c[0]) * -tz + ((a[1] + b[1]) / 2 - c[1]) * tx > 0 ? 1 : -1, nx = -tz * side, nz = tx * side;
        const n = Math.floor((len - 4) / 7), w = 0.55 * style.builder.thick, d = 0.9 * style.builder.thick;
        for (let j = 0; j <= n; j++) {
          const s = n === 0 ? len / 2 : 2 + (j * (len - 4)) / n, ex = a[0] + tx * s, ez = a[1] + tz * s;
          const top = tr.level - 0.55 - rng.range(0, 0.3);
          if (ground(ex + nx * d, ez + nz * d) > top - 1.2) continue;
          const q: P2[] = [[ex - tx * w, ez - tz * w], [ex + tx * w, ez + tz * w], [ex + tx * w * 0.8 + nx * d, ez + tz * w * 0.8 + nz * d], [ex - tx * w * 0.8 + nx * d, ez - tz * w * 0.8 + nz * d]];
          prism(site, q, null, top, style.wall, style.tint, { open: [0], topMat: style.trimMat, topTint: style.trim });
        }
      });
    }
  }
  const span = (pts: readonly P2[]) => { const ls = pts.map((q) => p.levelAt(q[0], q[1])); return [Math.min(...ls), Math.max(...ls)]; };
  // Wear: how far a wall has come down at a point, in courses.
  const worn = (broken: number, h: number, x: number, z: number) => (broken <= 0 ? 0 : Math.round(Math.max(0, broken * h * (0.15 + 0.85 * (noise.n2(x / 9, z / 9) * 0.5 + 0.5)) + (noise.n2(x / 2.2, z / 2.2) > 0.55 ? h * broken : 0)) / 0.45) * 0.45);
  const byTower = (x: number, z: number) => p.towers.some((t) => { const xs = t.pts.map((q) => q[0]), zs = t.pts.map((q) => q[1]); return x > Math.min(...xs) - 1.5 && x < Math.max(...xs) + 1.5 && z > Math.min(...zs) - 1.5 && z < Math.max(...zs) + 1.5; });
  for (const bl of p.blocks) buildBlock(site, style, bl, span(boxPts(bl.box)), arch, worn, fall, byTower);
  for (const t of p.towers) {
    const [lo, hi] = span(t.pts);
    tower(site, style, {
      pts: t.pts, base: null, floor: lo === hi ? hi : hi + 0.02, top: hi + t.top, roof: t.roof, thick: (t.great ? 1.6 : 1.2) * style.builder.thick, broken: t.broken, fallSide: t.fallSide, slits: style.builder.id === 'dwarves' || !t.great, merlon: style.builder.merlon,
      ways: t.ways ? { sides: t.ways, half: 1.8, spring: hi + 4.6 - archRise(arch, 3.6), arch, sill: lo === hi ? hi - 1 : hi } : undefined, noFloor: lo === hi,
    });
    if (t.broken > 0.15) { const c = t.pts[t.fallSide]; rubble(site, c[0] + rng.range(-2, 2), c[1] + rng.range(-2, 2), 5 + t.broken * 6, 10 + Math.round(t.broken * 16), style.wall, style.tint, 1.3); }
  }
  for (const c of p.curtains) curtainWall(site, style, p, c, arch);
  for (const a of p.arcades) {
    const len = Math.hypot(a.b[0] - a.a[0], a.b[1] - a.a[1]), lvl = p.levelAt((a.a[0] + a.b[0]) / 2, (a.a[1] + a.b[1]) / 2), bay = 3.4, n = Math.max(1, Math.floor(len / bay));
    const w = bay - 0.9, ops: Opening[] = [];
    for (let i = 0; i < n; i++) { const s = (len - n * bay) / 2 + i * bay + 0.45; ops.push({ s0: s, s1: s + w, y0: lvl - 1, y1: lvl + a.height - 1.3 - archRise(arch, w), arch }); }
    const brk = fall > 0 ? rng.range(0.2, 0.8) * fall : 0;
    wall(site, { ...line(a.a, a.b, 0.7, { base: lvl, top: (s) => lvl + a.height - worn(brk, a.height, a.a[0] + (a.b[0] - a.a[0]) * s / len, a.a[1] + (a.b[1] - a.a[1]) * s / len), stepped: true, openings: ops, mat: style.trimMat, tint: style.trim }) });
  }
  for (const s of p.stairs) steps(site, s.a, s.b, s.y0, s.y1, s.half, style.wall, style.trim, s.onGround ? null : Math.min(s.y0, s.y1));
  // Rubble in heaps where it fell.
  for (let i = 0; i < Math.round(6 + fall * 20); i++) {
    const bl = rng.pick(p.blocks), x = bl ? rng.range(bl.box[0], bl.box[2]) : 0, z = bl ? rng.range(bl.box[1], bl.box[3]) : 0;
    if (bl && bl.kind !== 'crypt') rubble(site, x, z, rng.range(1.5, 3.5), rng.int(4, 9), style.wall, style.tint, 1);
  }
  additions(site, style, p);
  return k.mesh();
}

/** A hall, wing, chapel or crypt house: its walls (gabled ends, broken tops), doors, windows, roof or ribs, columns. */
function buildBlock(site: Site, style: Style, bl: Block, [lo, hi]: number[], arch: StructureArch, worn: (b: number, h: number, x: number, z: number) => number, fall: number, byTower: (x: number, z: number) => boolean): void {
  // (A centimetre in from its box, so two blocks side by side never share a face's plane.)
  const { k, rng } = site, x0 = bl.box[0] + 0.01, z0 = bl.box[1] + 0.01, x1 = bl.box[2] - 0.01, z1 = bl.box[3] - 0.01, t = (bl.kind === 'hall' ? 1.2 : 0.9) * style.builder.thick;
  const crypt = bl.kind === 'crypt', floor = crypt ? hi + 0.6 : lo < hi ? hi + 0.02 : hi;
  const storey = 4.4 * style.builder.tall * (bl.kind === 'hall' ? 1.35 : bl.kind === 'chapel' ? 1.6 : 1), H = crypt ? 3.6 : storey * bl.storeys;
  const wallTop = floor + H, half = bl.axis === 0 ? (z1 - z0) / 2 : (x1 - x0) / 2, ridge = wallTop + half * 0.85 * style.builder.tall;
  let pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]] as P2[];
  // An apse: the end rounded out in a half polygon.
  if (bl.apse !== null) {
    const side = bl.apse, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, r = side % 2 === 0 ? (x1 - x0) / 2 : (z1 - z0) / 2, arc: P2[] = [];
    for (let i = 1; i < 6; i++) { const a = (i / 6) * Math.PI; arc.push(side === 0 ? [cx + Math.cos(a) * r, z0 - Math.sin(a) * r * 0.8] : side === 2 ? [cx + Math.cos(a) * r, z1 + Math.sin(a) * r * 0.8] : side === 1 ? [x1 + Math.sin(a) * r * 0.8, cz - Math.cos(a) * r] : [x0 - Math.sin(a) * r * 0.8, cz + Math.cos(a) * r]); }
    pts = side === 0 ? [[x0, z0], ...arc.reverse(), [x1, z0], [x1, z1], [x0, z1]] : side === 1 ? [[x0, z0], [x1, z0], ...arc, [x1, z1], [x0, z1]] : side === 2 ? [[x0, z0], [x1, z0], [x1, z1], ...arc, [x0, z1]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1], ...arc];
  }
  const roofed = bl.roof === 'roof' && bl.broken < 0.25;
  const brk = roofed ? 0 : bl.broken;
  const gableEnd = (a: P2, b: P2) => (bl.axis === 0 ? Math.abs(a[0] - b[0]) < 0.01 && (Math.abs(a[0] - x0) < 0.01 || Math.abs(a[0] - x1) < 0.01) : Math.abs(a[1] - b[1]) < 0.01 && (Math.abs(a[1] - z0) < 0.01 || Math.abs(a[1] - z1) < 0.01));
  wallRing(pts, t, (i, len) => {
    const a = pts[i], b = pts[(i + 1) % pts.length], ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const end = gableEnd(a, b) && bl.apse !== (bl.axis === 0 ? (Math.abs(a[0] - x1) < 0.01 ? 1 : 3) : Math.abs(a[1] - z1) < 0.01 ? 2 : 0);
    const top = (s: number) => {
      const x = a[0] + ux * s, z = a[1] + uz * s, g = end ? wallTop + (ridge - wallTop) * Math.max(0, 1 - Math.abs(s - len / 2) / (len / 2)) : wallTop;
      return Math.max(floor + 0.4, g - worn(brk * (end ? 0.6 : 1), g - floor, x, z));
    };
    const openings: Opening[] = [];
    const side = Math.abs(uz) < 0.01 ? (a[1] < (z0 + z1) / 2 ? 0 : 2) : Math.abs(ux) < 0.01 ? (a[0] > (x0 + x1) / 2 ? 1 : 3) : -1;
    const doorW = crypt ? 1.6 : bl.kind === 'hall' ? 3 : 2.2;
    if (bl.doors.includes(side) && len > doorW + 2) openings.push({ s0: len / 2 - doorW / 2, s1: len / 2 + doorW / 2, y0: floor - 0.6, y1: floor + (crypt ? 2.3 : 3.6) - archRise(arch, doorW) * 0.5, arch });
    if (!crypt && len > 5) {
      const tall = bl.kind !== 'wing', ww = tall ? 1.4 : 1, slits = style.builder.id === 'dwarves';
      for (let st = 0; st < (tall ? 1 : bl.storeys); st++) for (let s = 2.6; s < len - 2.2; s += tall ? 4.6 : 3.6) {
        // (No window where a tower stands against the wall: its jambs would lie in the tower's faces.)
        if (openings.some((o) => s + ww > o.s0 - 0.8 && s - ww < o.s1 + 0.8) || byTower(a[0] + ux * s, a[1] + uz * s)) continue;
        const y0 = floor + st * storey + (tall ? 2.4 : 1.3), y1 = tall ? floor + H - 2.2 - archRise(arch, ww) : y0 + 1.6;
        openings.push(slits ? { s0: s - 0.18, s1: s + 0.18, y0, y1: y0 + 1.4, arch: 'flat' } : { s0: s - ww / 2, s1: s + ww / 2, y0, y1, arch });
      }
    }
    return { base: null, top, stepped: brk > 0 || end, breaks: end ? [len / 2] : [], openings, mat: crypt ? style.trimMat : style.wall, tint: crypt ? style.trim : style.tint, trimMat: style.trimMat, trimTint: style.trim, capA: Infinity, capB: Infinity };
  }).forEach((w) => wall(site, w));
  if (crypt) {
    prism(site, inset(pts, -0.01).map((q) => q), lo, floor - 0.02, style.wall, style.tint);
    floorOf(k, inset(pts, t), floor, style.wall, DARK);
    steps(site, [(x0 + x1) / 2, z0 - 1.8], [(x0 + x1) / 2, z0], lo, floor, 1, style.wall, style.trim, lo);
    gable(k, (x0 + x1) / 2, (z0 + z1) / 2, (z1 - z0) / 2, (x1 - x0) / 2, Math.PI / 2, wallTop, ridge, style.trimMat, scaleTint(style.trim, 0.9), 0.35);
    return;
  }
  if (lo < hi) floorOf(k, inset(pts, t), floor, style.floor, style.floorTint);
  if (roofed) {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    gable(k, cx, cz, bl.axis === 0 ? (x1 - x0) / 2 : (z1 - z0) / 2, half, bl.axis === 0 ? 0 : Math.PI / 2, wallTop, ridge, style.roof, style.roofTint, 0.5);
  }
  // Transverse arches left standing where the roof fell, a few of them down.
  if (bl.roof === 'ribs' && !roofed) {
    const L = bl.axis === 0 ? x1 - x0 : z1 - z0, n = Math.floor(L / 5.5);
    for (let i = 1; i < n; i++) {
      if (rng.chance(0.25 + fall * 0.3)) continue;
      const u = (bl.axis === 0 ? x0 : z0) + (L * i) / n, a: P2 = bl.axis === 0 ? [u - 0.45, z0 + t] : [x0 + t, u - 0.45], b: P2 = bl.axis === 0 ? [u - 0.45, z1 - t] : [x1 - t, u - 0.45];
      const w = 2 * half - 2 * t, inner = w - 1.6, rib = Math.min(wallTop, floor + H * rng.range(0.85, 1));
      wall(site, line(a, b, 0.9, { base: floor, top: () => rib, openings: [{ s0: 0.8, s1: 0.8 + inner, y0: floor - 1, y1: rib - 0.9 - archRise(arch, inner), arch }], mat: style.trimMat, tint: style.trim, capA: Infinity, capB: Infinity }));
    }
  }
  // Rows of columns down a hall; some broken short, some lying where they fell.
  if (bl.columns) {
    const L = bl.axis === 0 ? x1 - x0 : z1 - z0, r = 0.45 * Math.sqrt(style.builder.thick);
    for (const off of [-half * 0.45, half * 0.45]) for (let u = 4; u < L - 3; u += 4.5) {
      const x = bl.axis === 0 ? x0 + u : (x0 + x1) / 2 + off, z = bl.axis === 0 ? (z0 + z1) / 2 + off : z0 + u;
      const whole = rng.chance(1 - fall * 0.6), h = whole ? H * 0.7 : rng.range(0.6, H * 0.35);
      prism(site, roundPts(x, z, r, 10), floor, floor + h, style.trimMat, style.trim);
      if (whole && !roofed) prism(site, roundPts(x, z, r * 1.35, 4, Math.PI / 4), floor + h, floor + h + 0.45, style.trimMat, style.trim);
      if (!whole && rng.chance(0.6)) {
        const a = rng.range(0, Math.PI * 2);
        for (let d = 0; d < 3; d++) k.stone(x + Math.cos(a) * (1.5 + d * 1.25), floor - 0.05, z + Math.sin(a) * (1.5 + d * 1.25), 2 * r, 2 * r, 1.15, a + Math.PI / 2, style.trimMat, style.trim, rng, 0.03, 0.85);
      }
    }
  }
}

/** A curtain wall: thick, a wall-walk on its top behind a crenellated parapet, breached where it has fallen, stairs up its inner face. */
function curtainWall(site: Site, style: Style, p: GreatRuinPlan, c: Curtain, arch: StructureArch): void {
  const { rng } = site, len = Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1]), ux = (c.b[0] - c.a[0]) / len, uz = (c.b[1] - c.a[1]) / len;
  const mid = p.levelAt((c.a[0] + c.b[0]) / 2, (c.a[1] + c.b[1]) / 2), H = mid + c.height;
  const breach = (s: number) => c.breaches.some(([a, b]) => s > a && s < b);
  const ops: Opening[] = c.gate !== null ? [{ s0: len * c.gate - 2, s1: len * c.gate + 2, y0: mid - 1, y1: mid + 4.8 - archRise(arch, 4), arch }] : [];
  const top = (s: number) => (breach(s) ? mid + rng.range(0.4, 2.2) : H);
  // (Its ends are in a tower or the next wall: no end faces.)
  const spec = line(c.a, c.b, c.thick, { base: null, top, stepped: true, openings: ops, mat: style.wall, tint: style.tint, trimMat: style.trimMat, trimTint: style.trim, topMat: style.floor, topTint: style.floorTint, capA: Infinity, capB: Infinity });
  // Which side is out: away from the ruin's middle.
  const nx = -uz, nz = ux, outSign = ((c.a[0] - p.cx) * nx + (c.a[1] - p.cz) * nz) > 0 ? 1 : -1;
  const flipped = outSign > 0 ? spec : { ...spec, a: spec.ia, b: spec.ib, ia: spec.a, ib: spec.b };
  wall(site, flipped);
  // What fell from a breach lies in a heap at its outer foot.
  for (const [a, b] of c.breaches) {
    const sm = (a + b) / 2, off = outSign * (c.thick / 2 + 1.2 + rng.range(0, 1.5));
    rubble(site, c.a[0] + ux * sm + nx * off, c.a[1] + uz * sm + nz * off, (b - a) * 0.45 + 1, 6 + Math.round((b - a) * 1.5), style.wall, style.tint, 1.2);
  }
  // The parapet on the outer edge, its crenels; none over a breach.
  const pa = flipped.a, pb = flipped.b, ia = [pa[0] + (flipped.ia[0] - pa[0]) * 0.25, pa[1] + (flipped.ia[1] - pa[1]) * 0.25] as P2, ib = [pb[0] + (flipped.ib[0] - pb[0]) * 0.25, pb[1] + (flipped.ib[1] - pb[1]) * 0.25] as P2;
  const m = 0.9 * style.builder.merlon, g = 0.75, breaks: number[] = [];
  for (let s = g / 2; s < len; s += m + g) breaks.push(s, s + m);
  for (const [a, b] of c.breaches) breaks.push(a, b);
  wall(site, { a: pa, b: pb, ia, ib, base: H, top: (s) => (breach(s) ? H : H + 1.1 + ((((s - g / 2) % (m + g)) + m + g) % (m + g) < m ? 0.9 : 0)), stepped: true, breaks, mat: style.wall, tint: style.trim, capA: Infinity, capB: Infinity });
  // A stair up the inside, along the wall.
  if (len > 20 && rng.chance(0.6)) {
    const s0 = rng.range(4, len - 16), run = (H - mid) / 0.3 * 0.35;
    if (s0 + run < len - 3) {
      const ix = flipped.ia[0] - flipped.a[0], iz = flipped.ia[1] - flipped.a[1], il = Math.hypot(ix, iz), off = c.thick + 1;
      const dir = outSign > 0 ? 1 : -1, start = outSign > 0 ? s0 : len - s0;
      const A: P2 = [c.a[0] + ux * start + (ix / il) * off, c.a[1] + uz * start + (iz / il) * off], B: P2 = [A[0] + ux * run * dir, A[1] + uz * run * dir];
      steps(site, A, B, mid, H, 0.9, style.wall, style.tint, mid);
    }
  }
}

/** The dead's goods: graves outside the walls, bones and coffins inside, tattered banners, cages, skulls on stakes. */
function additions(site: Site, style: Style, p: GreatRuinPlan): void {
  const { rng, ground, k } = site, cloth = p.picks.holder.cloth, floorAt = (x: number, z: number) => p.levelAt(x, z);
  const halls = p.blocks.filter((b) => b.kind !== 'crypt'), free = room();
  if (!halls.length) return;
  for (const add of p.adds) switch (add) {
    case 'graves': {
      const side = rng.sign(), gx = side * (p.radius - 4), gz = p.cz + rng.range(-p.radius * 0.4, p.radius * 0.4);
      for (let i = 0; i < 12; i++) { const x = gx + rng.range(-9, 9), z = gz + rng.range(-12, 12), yaw = Math.PI / 2 + rng.range(-0.2, 0.2); if (free(x, z, 1.3)) grave(site, x, z, ground, yaw, style.trim); }
      break;
    }
    case 'bones': for (let i = 0; i < 6; i++) { const b = rng.pick(halls), x = rng.range(b.box[0] + 2, b.box[2] - 2), z = rng.range(b.box[1] + 2, b.box[3] - 2); bones(site, x, z, floorAt); } break;
    case 'coffins': for (let i = 0; i < 5; i++) { const b = rng.pick(halls), x = rng.range(b.box[0] + 2.5, b.box[2] - 2.5), z = rng.range(b.box[1] + 2.5, b.box[3] - 2.5); if (free(x, z, 1.2)) coffin(site, x, z, floorAt(x, z), rng.range(0, Math.PI), style.timber); } break;
    case 'banners': for (const t of p.towers.filter((q) => q.ways || q.great)) { const c = t.pts[0]; banner(site, c[0], c[1] - 1.2, floorAt(c[0], c[1]), 5, rng.pick(cloth), 0, true); } break;
    case 'cages': for (const t of p.towers.filter((q) => q.great).slice(0, 1)) { const c = t.pts[0], y = floorAt(c[0], c[1]) + Math.min(10, t.top * 0.5); cage(site, c[0] - 1.5, y, c[1] - 1.5); } break;
    case 'skulls': for (let i = 0; i < 6; i++) { const x = p.gate[0] + rng.range(-8, 8), z = p.gate[1] - rng.range(4, 12), y = ground(x, z); k.footed(() => stake(site, x, z, y, 2.2, 0.1, style.timber)); skull(site, x, y + 2.2, z, 0.28); } break;
  }
}
