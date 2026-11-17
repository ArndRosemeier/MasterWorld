/**
 * What every structure kind shares (D69, Z4; pure): the hand that built it as surfaces and colours of the building
 * shader (its `Style`), how far it has fallen, who holds it, and its **signature**: the parts a player tells two of a
 * kind apart by (count and arrangement of the main parts, height and footprint, builder, state). Two of a kind whose
 * signatures are close look alike; `apart` measures how far.
 */
import { Rng } from '@futuremagic/core';
import type { Rgb, StructureArch, StructureBuilderDef, StructureHolderDef, StructureKindDef, StructureRoof, StructureStone, StructureTower, StructuresDef } from '../../setting/contract';
import { BuildingMat, CellarMat, type Tint } from '../dungeon/meshKit';

export const stoneMat = (s: StructureStone): number => ({ ashlar: BuildingMat.Ashlar, rubble: BuildingMat.Rubble, brick: CellarMat.Brick, flagstone: CellarMat.Flagstone })[s];
export const roofMat = (r: StructureRoof): number => ({ slate: BuildingMat.Slate, tile: BuildingMat.Tile, shingle: BuildingMat.Shingle, thatch: BuildingMat.Thatch })[r];
const tint = (c: Rgb): Tint => [c[0], c[1], c[2]];

/** A builder's hand as the shader draws it. */
export interface Style {
  readonly builder: StructureBuilderDef;
  readonly wall: number;
  readonly tint: Tint;
  readonly trimMat: number;
  readonly trim: Tint;
  readonly floor: number;
  readonly floorTint: Tint;
  readonly roof: number;
  readonly roofTint: Tint;
  readonly timber: Tint;
}

export function styleOf(b: StructureBuilderDef): Style {
  return {
    builder: b, wall: stoneMat(b.stone), tint: tint(b.tint), trimMat: b.stone === 'ashlar' ? stoneMat('ashlar') : BuildingMat.Ashlar, trim: tint(b.trim),
    floor: stoneMat(b.floor), floorTint: b.floor === b.stone ? tint(b.tint) : tint(b.trim).map((c) => Math.round(c * 0.85)) as unknown as Tint,
    roof: roofMat(b.roof), roofTint: tint(b.roofTint), timber: tint(b.timber),
  };
}

/** How far it has fallen: whole (kept up), weathered, broken (tops and parapets gone, a span or a tower down), ruinous. */
export const STATES = ['whole', 'weathered', 'broken', 'ruinous'] as const;
export type State = (typeof STATES)[number];

/** A structure's first picks, made the same way for every kind from its seed and the setting's weights. */
export interface Picks {
  readonly kind: StructureKindDef;
  readonly builder: StructureBuilderDef;
  readonly holder: StructureHolderDef;
  readonly arch: StructureArch;
  readonly tower: StructureTower;
  readonly state: State;
  /** 0 bare stone .. 1 grown over. */
  readonly moss: number;
}

export function pickStructure(defs: StructuresDef, kindId: string, rng: Rng): Picks {
  const kind = defs.kinds.find((k) => k.id === kindId);
  if (!kind) throw new Error(`no structure kind ${kindId}`);
  const byWeight = <T extends { id: string }>(list: readonly T[], w: Readonly<Record<string, number>>): T => {
    const ok = list.filter((d) => (w[d.id] ?? 0) > 0);
    return rng.weighted(ok, (d) => w[d.id]);
  };
  const builder = byWeight(defs.builders, kind.builders), holder = byWeight(defs.holders, kind.holders);
  const state = rng.weighted(STATES, (_, i) => [1, 3, 3, 2][i]);
  return { kind, builder, holder, arch: rng.pick(builder.arches), tower: rng.pick(builder.towers), state, moss: rng.chance(0.4) ? rng.range(0.5, 1) : rng.range(0, 0.3) };
}

/** How broken a state is, 0 whole .. 1 ruinous. */
export const fallen = (s: State): number => STATES.indexOf(s) / 3;

/**
 * The parts a player tells two of a kind apart by, each a short value; and their weights. Two of a kind are
 * `apart` by the sum of the weights where they differ: the gallery and the zones hold them apart by at least
 * DISTINCT (D39 against formula, Arnd 2026-11-17: "2 fortified bridges look very distinct").
 */
export type Signature = Readonly<Record<string, string | number>>;
export const DISTINCT = 4;

export function apart(a: Signature, b: Signature, weights: Readonly<Record<string, number>>): number {
  let d = 0;
  for (const key of Object.keys(weights)) if (a[key] !== b[key]) d += weights[key];
  return d;
}

/**
 * A structure's silhouette as seen from far off looking along (dx, dz) (unit, in plan): the cells of a grid `cell`
 * metres square, across the view and up, that its triangles cover, centred across on its middle and standing on its
 * lowest point. Two of a kind whose silhouettes share most cells (`shared`) read alike from 300 m.
 */
export function silhouette(position: ArrayLike<number>, index: ArrayLike<number>, dx: number, dz: number, cell = 1): Set<number> {
  const n = position.length / 3, u = new Float32Array(n), v = new Float32Array(n);
  let umin = Infinity, umax = -Infinity, vmin = Infinity;
  for (let i = 0; i < n; i++) {
    u[i] = position[3 * i] * dz - position[3 * i + 2] * dx; v[i] = position[3 * i + 1];
    umin = Math.min(umin, u[i]); umax = Math.max(umax, u[i]); vmin = Math.min(vmin, v[i]);
  }
  const mid = (umin + umax) / 2, out = new Set<number>(), W = 4096;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    const ax = (u[a] - mid) / cell, ay = (v[a] - vmin) / cell, bx = (u[b] - mid) / cell, by = (v[b] - vmin) / cell, cx = (u[c] - mid) / cell, cy = (v[c] - vmin) / cell;
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(d) < 1e-9) continue;
    for (let y = Math.floor(Math.min(ay, by, cy)); y <= Math.ceil(Math.max(ay, by, cy)); y++) for (let x = Math.floor(Math.min(ax, bx, cx)); x <= Math.ceil(Math.max(ax, bx, cx)); x++) {
      const px = x + 0.5, py = y + 0.5, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
      if (l1 >= 0 && l2 >= 0 && l1 + l2 <= 1 && y >= 0) out.add(y * W + x + W / 2);
    }
  }
  return out;
}

/** How much two silhouettes share: the cells in both over the cells in either (0 nothing alike .. 1 the same). */
export function shared(a: Set<number>, b: Set<number>): number {
  let both = 0;
  for (const c of a) if (b.has(c)) both++;
  return both / (a.size + b.size - both || 1);
}
