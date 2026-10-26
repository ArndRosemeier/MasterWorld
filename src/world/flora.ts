/**
 * Where trees and shrubs grow (pure, runs in workers): seeded positions over a square of land, from the
 * biome's flora (setting contract) thinned by a woods-cover field, kept off water, beaches and cliffs.
 * Positions depend on world position only, so squares of any size agree where they overlap.
 *
 * Record (FLORA_STRIDE floats): x, y, z, scale, yaw, kind (index into FLORA_KINDS).
 */
import { Noise, deriveSeed, hash2f, smoothstep } from '@futuremagic/core';
import { TREES, type FloraDef, type TreeName } from '../setting/contract';
import type { Terrain } from './terrain';
import { TownGround } from './town';

export const FLORA_STRIDE = 6;

/** The models trees are drawn with: species and variant (@futuremagic/vegetation). */
export interface FloraKind {
  readonly species: TreeName | 'shrub';
  readonly variant: number;
  readonly conifer: boolean;
  /** Trunk radius at the foot (m, at scale 1) that bodies walk round (world/trunks.ts); 0: passable (shrubs). */
  readonly trunk: number;
}

/**
 * Trunk radius at the foot by species (m): the vegetation package's trunk radius with a little of its
 * root flare. Kept here since the package's species settings come with its three.js geometry.
 */
const TRUNK: Readonly<Record<TreeName, number>> = { oak: 0.55, linden: 0.36, maple: 0.36, birch: 0.2, chestnut: 0.5, pine: 0.34, cypress: 0.28, plane: 0.42 };

const VARIANTS = 2;
export const FLORA_KINDS: readonly FloraKind[] = [
  ...TREES.flatMap((species) => Array.from({ length: VARIANTS }, (_, variant) => ({ species, variant, conifer: species === 'pine' || species === 'cypress', trunk: TRUNK[species] }))),
  { species: 'shrub', variant: 0, conifer: false, trunk: 0 },
  { species: 'shrub', variant: 1, conifer: false, trunk: 0 },
];
const SHRUB = FLORA_KINDS.length - VARIANTS;

export interface FloraJob {
  seed: number;
  setting: string;
  /** The square's minimum corner and side, metres (multiples of `spacing`). */
  x0: number;
  z0: number;
  size: number;
  /** Candidate spacing, metres: 4 near (every tree), more far away (fewer, bigger: each stands for a few). */
  spacing: number;
}

/** Spacing of the full-density candidate grid: at most 625 plants a hectare. */
export const NEAR_SPACING = 4;
/** Highest share of candidates with a plant (far candidates in thick woods). */
const MAX_P = 0.9;

export function floraPlacement(t: Terrain, job: FloraJob): Float32Array {
  const { x0, z0, size, spacing } = job;
  const biomes = t.biomes;
  const seed = deriveSeed(t.seed, 'flora');
  const cover = coverNoise(t.seed);
  const w = { river: 0, lake: 0 };
  const out: number[] = [];
  const thin = (spacing / NEAR_SPACING) ** 2; // candidates far away each stand for this many near ones
  const n = Math.round(size / spacing);
  const gi0 = Math.round(x0 / spacing), gj0 = Math.round(z0 / spacing);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gi = gi0 + i, gj = gj0 + j;
    const roll = hash2f(seed, gi * 7 + spacing, gj);
    if (roll > MAX_P) continue; // a quick out before any sampling
    // Where it will stand (the output holds 32-bit floats): checked there, so a plant on a field's edge stays off it.
    const x = Math.fround((gi + hash2f(seed + 1, gi, gj)) * spacing), z = Math.fround((gj + hash2f(seed + 2, gi, gj)) * spacing);
    const bi = t.biomeAt(x, z);
    const flora = bi >= 0 ? biomes[bi].flora : undefined;
    if (!flora) continue;
    const woods = woodsAt(cover, flora, x, z);
    const pTree = (flora.trees / 10000) * NEAR_SPACING ** 2 * (0.08 + 0.92 * woods);
    const pShrub = (flora.shrubs / 10000) * NEAR_SPACING ** 2 * (0.4 + 0.6 * woods);
    const near = spacing === NEAR_SPACING;
    // Far away a candidate stands for `thin` near ones: a tree there as often as one would be among them
    // (up to MAX_P), shrubs not at all.
    const pT = near ? Math.min(0.5, pTree) : Math.min(MAX_P, pTree * thin * 0.6);
    const p = near ? Math.min(0.5, pTree + pShrub) : pT;
    if (roll >= p) continue;
    const shrub = roll >= pT;
    // Not in water, on beaches or on cliffs; trees keep a little off river banks.
    const h = t.height(x, z);
    if (h < 1.5) continue;
    t.clearOfWater(x, z, h, w);
    if (w.river < (shrub ? 1.5 : 4) || w.lake < 0.5) continue;
    const slope = Math.hypot(t.height(x + 1.5, z) - h, t.height(x, z + 1.5) - h) / 1.5;
    if (slope > 0.75 || t.rockAt(x, z, h)) continue;
    // Nothing on streets and under houses; in yards and gardens a fruit tree now and then, and bushes.
    const built = t.townGround(x, z);
    if (built >= TownGround.Street || (built === TownGround.Yard && !shrub && hash2f(seed + 8, gi, gj) < 0.85)) continue;
    // Roads keep a lane clear: no trunk within crown's reach of the edge, no bush on it.
    if (!t.roads.empty && t.roads.fromEdge(x, z) < (shrub ? 0.8 : 3)) continue;
    const kind = shrub ? SHRUB + (hash2f(seed + 3, gi, gj) < 0.5 ? 0 : 1) : pickTree(flora.mix, hash2f(seed + 4, gi, gj), hash2f(seed + 5, gi, gj));
    if (kind < 0) continue;
    const size0 = 0.8 + 0.45 * hash2f(seed + 6, gi, gj);
    // A far stand-in is bigger, to cover about the canopy its near trees would (up to half again as big).
    const scale = near ? size0 : size0 * Math.min(1.5, Math.max(1, Math.sqrt((pTree * thin * 0.7) / pT)));
    out.push(x, h - 0.15 * scale, z, scale, hash2f(seed + 7, gi, gj) * Math.PI * 2, kind);
  }
  return Float32Array.from(out);
}

/** The field that says where the woods stand (`woodsAt`). */
export const coverNoise = (seed: number): Noise => new Noise(deriveSeed(seed, 'flora', 'cover'));

/** How wooded the land is here, 0 (open) .. 1 (thick woods): a cover field at a few hundred metres, shifted by the biome. */
export function woodsAt(cover: Noise, flora: FloraDef, x: number, z: number): number {
  return smoothstep(-0.15, 0.25, cover.fbm2(x / 260, z / 260, 3) + flora.cover);
}

/** How wooded the land is at a point, 0 (open) .. 1 (closed wood): biomes with few trees count as open. */
export function woodsOf(t: Terrain): (x: number, z: number) => number {
  const cover = coverNoise(t.seed);
  return (x, z) => {
    const b = t.biomeAt(x, z);
    const f: FloraDef | undefined = b >= 0 ? t.setting.world.biomes[b]?.flora : undefined;
    return f && f.trees > 20 ? woodsAt(cover, f, x, z) : 0;
  };
}

/** A species by weight, then one of its variants: an index into FLORA_KINDS (-1: no species). */
function pickTree(mix: Readonly<Partial<Record<TreeName, number>>>, r: number, rv: number): number {
  let total = 0;
  for (const k of TREES) total += mix[k] ?? 0;
  if (total <= 0) return -1;
  let acc = 0;
  for (let i = 0; i < TREES.length; i++) {
    acc += (mix[TREES[i]] ?? 0) / total;
    if (r < acc) return i * VARIANTS + Math.min(VARIANTS - 1, Math.floor(rv * VARIANTS));
  }
  return (TREES.length - 1) * VARIANTS;
}
