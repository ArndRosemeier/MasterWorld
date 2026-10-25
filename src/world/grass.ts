/**
 * Where grass grows and how (pure, runs in workers): a mask around the camera that the grass shader reads
 * blade by blade. From the biome's grass (setting contract), thinned in patches, under thick woods, on
 * steep ground (rock), at the shore (sand), in water and up in the snow. Every value depends on world
 * position only, so masks agree where they overlap.
 */
import { Noise, deriveSeed, lerp, smoothstep } from '@futuremagic/core';
import { coverNoise, woodsAt } from './flora';
import type { MaskJob } from './water';
import type { Terrain } from './terrain';
import { TownGround } from './town';

/** Biome grass is read on a world-aligned lattice this far apart (m) and blended between. */
const LATTICE = 16;
/** Snow lies from about here up (the terrain material's snow line, less its spread). */
const SNOW = 1650;

/**
 * Float RGBA per sample, row-major from (x0, z0), at pixel centres: R = ground height, G = grass density
 * 0..1, B = blade height (m), A = dryness 0..1.
 */
export function grassMask(t: Terrain, job: MaskJob): Float32Array {
  const { x0, z0, size, res } = job;
  const step = size / res;
  const out = new Float32Array(res * res * 4);
  const biomes = t.biomes;
  const cover = coverNoise(t.seed);
  const patch = new Noise(deriveSeed(t.seed, 'grass', 'patch'));
  const w = { river: 0, lake: 0 };

  // Biome grass (cover, height, dry) on the lattice around the mask, with woods shade folded into cover.
  const li0 = Math.floor(x0 / LATTICE), lj0 = Math.floor(z0 / LATTICE);
  const ln = Math.ceil(size / LATTICE) + 2;
  const lat = new Float32Array(ln * ln * 3);
  for (let j = 0; j < ln; j++) for (let i = 0; i < ln; i++) {
    const x = (li0 + i) * LATTICE, z = (lj0 + j) * LATTICE;
    const bi = t.biomeAt(x, z);
    const b = bi >= 0 ? biomes[bi] : undefined;
    const g = b?.grass;
    if (!g) continue;
    // Thick woods shade the floor: grass thins there (more so the denser the trees).
    const shade = b.flora ? woodsAt(cover, b.flora, x, z) * Math.min(1, b.flora.trees / 150) : 0;
    const k = (j * ln + i) * 3;
    lat[k] = g.cover * (1 - 0.5 * shade);
    lat[k + 1] = g.height * (1 - 0.3 * shade);
    lat[k + 2] = g.dry;
  }
  const at = (x: number, z: number, c: number): number => {
    const fx = x / LATTICE - li0, fz = z / LATTICE - lj0;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const q = (a: number, b: number) => lat[((j + b) * ln + i + a) * 3 + c];
    return lerp(lerp(q(0, 0), q(1, 0), u), lerp(q(0, 1), q(1, 1), u), v);
  };

  // Heights with one extra ring, so slopes on the edge match the neighbouring mask's.
  const m = res + 2, ground = new Float32Array(m * m);
  for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) ground[j * m + i] = t.height(x0 + (i - 0.5) * step, z0 + (j - 0.5) * step);
  const gh = (i: number, j: number) => ground[(j + 1) * m + i + 1];

  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const p = j * res + i, x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step, h = gh(i, j);
    out[p * 4] = h;
    let dens = at(x, z, 0);
    if (dens <= 0) continue;
    // Patches: meadows and bare spots a few metres across, and thicker and thinner stretches.
    const n = patch.fbm2(x / 11, z / 11, 3);
    dens *= smoothstep(-0.55, 0.2, n);
    // Steep ground is rock, the shore sand, high ground snow.
    const hx = gh(i + 1, j) - gh(i - 1, j), hz = gh(i, j + 1) - gh(i, j - 1);
    const slope = Math.hypot(hx, hz) / (2 * step);
    dens *= 1 - smoothstep(0.42, 0.68, slope);
    dens *= smoothstep(2.3, 4.2, h) * (1 - smoothstep(SNOW - 150, SNOW + 100, h));
    if (dens <= 0.01 || t.rockAt(x, z, h) || t.townGround(x, z) >= TownGround.Street) continue;
    // Not in water; reeds-to-be along the banks keep their place.
    t.clearOfWater(x, z, h, w);
    dens *= smoothstep(0.3, 1.5, w.river) * smoothstep(0.1, 0.6, w.lake);
    out[p * 4 + 1] = dens;
    out[p * 4 + 2] = at(x, z, 1) * (0.75 + 0.5 * smoothstep(-0.5, 0.6, patch.fbm2(x / 37 + 13.7, z / 37 - 5.1, 2)));
    out[p * 4 + 3] = at(x, z, 2);
  }
  return out;
}
