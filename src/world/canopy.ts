/**
 * The woods as seen from afar (pure, runs in workers): at any point, how much of the ground the tree crowns
 * cover, how tall the trees stand, how far apart they are and how many are conifers. The terrain carries it
 * per vertex; past the last trees drawn one by one, the ground rises into this canopy (docs/far-view.md,
 * after Solarpolis). It follows world/flora.ts: the same biome flora, woods field and places trees keep off.
 */
import { smoothstep } from '@futuremagic/core';
import { TREES, type FloraDef, type TreeName } from '../setting/contract';
import { NEAR_SPACING, coverNoise, woodsAt } from './flora';
import type { Terrain } from './terrain';

/**
 * Height and crown radius (m) of each species' models at scale 1 (@futuremagic/vegetation, mean of its
 * variants; test/canopy.test.ts keeps them in step), and whether it is a conifer.
 */
export const TREE_SHAPE: Readonly<Record<TreeName, { height: number; crown: number; conifer: boolean }>> = {
  oak: { height: 14.5, crown: 7.9, conifer: false },
  linden: { height: 15.5, crown: 4.6, conifer: false },
  maple: { height: 14, crown: 5.9, conifer: false },
  birch: { height: 15.7, crown: 3.4, conifer: false },
  chestnut: { height: 15.8, crown: 6.2, conifer: false },
  pine: { height: 15, crown: 4.4, conifer: true },
  cypress: { height: 13.4, crown: 1.1, conifer: true },
  plane: { height: 16.4, crown: 6.9, conifer: false },
};
/** Placed trees are this big on average (world/flora.ts scales them 0.8 .. 1.25). */
const MEAN_SCALE = 1.02;
/** Crowns overlap and leave gaps: covered share 1 − e^(−k · crown area · density). */
const CLOSE = 1.0;

/** A biome's mean tree: height, crown radius, conifer share (by its species mix). */
export function meanTree(flora: FloraDef): { height: number; crown: number; conifer: number } {
  let w = 0, height = 0, crown = 0, conifer = 0;
  for (const k of TREES) {
    const s = flora.mix[k] ?? 0, t = TREE_SHAPE[k];
    w += s; height += s * t.height; crown += s * t.crown * t.crown; conifer += s * (t.conifer ? 1 : 0);
  }
  if (w <= 0) return { height: 0, crown: 0, conifer: 0 };
  return { height: (height / w) * MEAN_SCALE, crown: Math.sqrt(crown / w) * MEAN_SCALE, conifer: conifer / w };
}

/** Canopy at a point: crown cover 0..1, tree height (m), spacing between trees (m), conifer share 0..1. */
export interface Canopy { cover: number; height: number; spacing: number; conifer: number }

/** A canopy sampler for one terrain (caches the woods field and each biome's mean tree). */
export function canopySampler(t: Terrain): (x: number, z: number, out: Canopy) => Canopy {
  const cover = coverNoise(t.seed);
  const trees = t.biomes.map((b) => (b.flora ? meanTree(b.flora) : null));
  const w = { river: 0, lake: 0 };
  return (x, z, out) => {
    out.cover = out.height = out.conifer = 0;
    out.spacing = 50;
    const bi = t.biomeAt(x, z);
    const flora = bi >= 0 ? t.biomes[bi].flora : undefined, tree = bi >= 0 ? trees[bi] : null;
    if (!flora || !tree || flora.trees <= 0) return out;
    const h = t.height(x, z);
    // Where trees keep off (world/flora.ts), softened: beaches, water and its banks, cliffs, rock.
    let keep = smoothstep(1.2, 2.5, h);
    if (keep <= 0) return out;
    t.clearOfWater(x, z, h, w);
    keep *= smoothstep(2, 6, w.river) * smoothstep(0.2, 1, w.lake);
    const slope = Math.hypot(t.height(x + 3, z) - h, t.height(x, z + 3) - h) / 3;
    keep *= 1 - smoothstep(0.6, 0.85, slope);
    if (keep <= 0 || t.rockAt(x, z, h)) return out;
    // Trees per square metre as world/flora.ts places them (at most one in two near candidates).
    const woods = woodsAt(cover, flora, x, z);
    const density = Math.min((flora.trees / 10000) * (0.08 + 0.92 * woods), 0.5 / NEAR_SPACING ** 2) * keep;
    out.cover = 1 - Math.exp(-CLOSE * Math.PI * tree.crown * tree.crown * density);
    out.height = tree.height;
    out.spacing = Math.min(50, 1 / Math.sqrt(Math.max(density, 1e-4)));
    out.conifer = tree.conifer;
    return out;
  };
}
