/**
 * Where grass grows and how (pure, runs in workers): a mask around the camera that the grass shader reads
 * blade by blade. From the biome's grass (setting contract), thinned in patches, under thick woods, on
 * steep ground (rock), at the shore (sand), in water and up in the snow. Every value depends on world
 * position only, so masks agree where they overlap.
 */
import { Noise, deriveSeed, lerp, smoothstep } from '@futuremagic/core';
import { coverNoise, thinnedWoods } from './flora';
import type { MaskJob } from './water';
import type { Terrain } from './terrain';
import type { CropKind } from '@futuremagic/settlement';
import { TownGround } from './town';
import { WAYS, emptyRoad } from './roads';
import { drawnOf } from './drawnGround';

const TRACK = WAYS.indexOf('track');

/** Town ground where no grass grows: streets, the market, under buildings, tracks. */
const BARE = new Set<number>([TownGround.Street, TownGround.Market, TownGround.Building, TownGround.Path]);
/** How much of the land's grass grows within a city's wall (the capital stood in a meadow between its houses). */
const URBAN = 0.15;

/** The blades of each crop: density, height (m), dryness. Zero density: the ground's own look shows (rows, furrows). */
const CROP_GRASS: Readonly<Record<CropKind, [number, number, number]>> = {
  wheat: [1, 0.95, 0.95], rye: [1, 1.15, 0.85], barley: [1, 0.75, 0.8], oats: [0.95, 0.85, 0.65],
  flax: [0.9, 0.7, 0.12], beans: [0, 0, 0], cabbage: [0, 0, 0], ploughed: [0, 0, 0],
  fallow: [0.75, 0.35, 0.45], meadow: [1, 0.6, 0.3], pasture: [0.95, 0.14, 0.25],
};

/** Biome grass is read on a world-aligned lattice this far apart (m) and blended between. */
const LATTICE = 16;
/** Snow lies from about here up (the terrain material's snow line, less its spread). */
const SNOW = 1650;

/**
 * Float RGBA per sample, row-major from (x0, z0), at pixel centres: R = ground height, G = grass density
 * 0..1, B = blade height (m), A = dryness 0..1. The ground is the ground as drawn (world/drawnGround.ts), like the
 * hero's, the trees' and the rocks': blades rooted on the land's own height sank into the mesh, or stood over it,
 * where the mesh steps over relief finer than its grid (up to 0.8 m at a gully's lip).
 */
export function grassMask(t: Terrain, job: MaskJob): Float32Array {
  const { x0, z0, size, res } = job;
  const step = size / res;
  const out = new Float32Array(res * res * 4);
  const biomes = t.biomes;
  const cover = coverNoise(t.seed);
  const patch = new Noise(deriveSeed(t.seed, 'grass', 'patch'));
  const w = { river: 0, lake: 0 };
  const road = emptyRoad(), roads = !t.roads.empty ? t.roads : null;
  // Nothing grows in water (a brook runs through fields too); reeds-to-be along the banks keep their place.
  const dry = (x: number, z: number, h: number): number => {
    t.clearOfWater(x, z, h, w);
    return smoothstep(0.3, 1.5, w.river) * smoothstep(0.1, 0.6, w.lake);
  };

  // Biome grass (cover, height, dry) on the lattice around the mask, with woods shade folded into cover.
  const li0 = Math.floor(x0 / LATTICE), lj0 = Math.floor(z0 / LATTICE);
  const ln = Math.ceil(size / LATTICE) + 2;
  const lat = new Float32Array(ln * ln * 3);
  const kinds = t.skeleton.kinds, wears = kinds.some((k) => k.wears);
  for (let j = 0; j < ln; j++) for (let i = 0; i < ln; i++) {
    const x = (li0 + i) * LATTICE, z = (lj0 + j) * LATTICE;
    const bi = t.biomeAt(x, z);
    const b = bi >= 0 ? biomes[bi] : undefined;
    const g = b?.grass;
    if (!g) continue;
    // Thick woods shade the floor: grass thins there (more so the denser the trees); a bare kind of country has few.
    const shade = b.flora ? thinnedWoods(t, cover, b.flora, x, z) * Math.min(1, b.flora.trees / 150) : 0;
    const k = (j * ln + i) * 3;
    lat[k] = g.cover * (1 - 0.5 * shade);
    lat[k + 1] = g.height * (1 - 0.3 * shade);
    lat[k + 2] = g.dry;
    // A kind of country's own grass (downs' short turf, a moor's heather) over the biome's, by how much of it is here.
    if (wears) {
      const w = t.skeleton.kindWeights(x, z);
      for (let q = 0; q < w.length; q++) {
        const o = kinds[q].wears?.grass;
        if (!o || w[q] <= 0) continue;
        lat[k] = lerp(lat[k], o.cover, w[q]); lat[k + 1] = lerp(lat[k + 1], o.height, w[q]); lat[k + 2] = lerp(lat[k + 2], o.dry, w[q]);
      }
    }
  }
  const at = (x: number, z: number, c: number): number => {
    const fx = x / LATTICE - li0, fz = z / LATTICE - lj0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const q = (a: number, b: number) => lat[((j + b) * ln + i + a) * 3 + c];
    return lerp(lerp(q(0, 0), q(1, 0), u), lerp(q(0, 1), q(1, 1), u), v);
  };

  // Heights of the drawn ground with one extra ring, so slopes on the edge match the neighbouring mask's.
  const drawn = drawnOf(t), m = res + 2, ground = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) ground[j * m + i] = drawn.footing(x0 + (i - 0.5) * step, z0 + (j - 0.5) * step);
  const gh = (i: number, j: number) => ground[(j + 1) * m + i + 1];

  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const p = j * res + i, x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step, h = gh(i, j);
    out[p * 4] = h;
    const built = t.townGround(x, z);
    if (built === TownGround.Field) {
      // A field grows its crop (tall corn, short pasture) or nothing the blades could show (rows, furrows).
      const f = t.fieldAt(x, z), c = f ? CROP_GRASS[f.crop] : null;
      if (c && c[0] > 0) {
        const n = patch.fbm2(x / 5, z / 5, 2);
        out[p * 4 + 1] = c[0] * smoothstep(-0.8, -0.2, n) * dry(x, z, h);
        out[p * 4 + 2] = c[1] * (0.9 + 0.2 * n);
        out[p * 4 + 3] = c[2];
      }
      continue;
    }
    if (BARE.has(built)) continue;
    let dens = at(x, z, 0);
    if (dens <= 0) continue;
    // Within a city's wall the yards and gaps are trodden and kept: a little short grass, no meadow.
    let short = 1;
    if (t.townWalled(x, z)) { dens *= URBAN; short = 0.4; }
    // Roads are bare earth, but for the grass between a cart track's ruts; their verges are thin and short.
    const rd = roads?.nearest(x, z, road);
    if (rd && rd.edge < 1.5) {
      if (rd.edge < 0) {
        if (rd.way !== TRACK || Math.abs(rd.across) > 0.4) continue;
        dens *= 0.8; short = Math.min(short, 0.45);
      } else {
        dens *= smoothstep(-0.2, 1.5, rd.edge); short = Math.min(short, 0.6 + 0.4 * smoothstep(0, 1.5, rd.edge));
      }
    }
    // Patches: meadows and bare spots a few metres across, and thicker and thinner stretches.
    const n = patch.fbm2(x / 11, z / 11, 3);
    dens *= smoothstep(-0.55, 0.2, n);
    // Steep ground is rock, the shore sand, high ground snow.
    const hx = gh(i + 1, j) - gh(i - 1, j), hz = gh(i, j + 1) - gh(i, j - 1);
    const slope = Math.hypot(hx, hz) / (2 * step);
    dens *= 1 - smoothstep(0.42, 0.68, slope);
    dens *= smoothstep(2.3, 4.2, h) * (1 - smoothstep(SNOW - 150, SNOW + 100, h));
    if (dens <= 0.01 || t.rockAt(x, z, h)) continue;
    dens *= dry(x, z, h);
    out[p * 4 + 1] = dens;
    out[p * 4 + 2] = short * at(x, z, 1) * (0.75 + 0.5 * smoothstep(-0.5, 0.6, patch.fbm2(x / 37 + 13.7, z / 37 - 5.1, 2)));
    out[p * 4 + 3] = at(x, z, 2);
  }
  return out;
}
