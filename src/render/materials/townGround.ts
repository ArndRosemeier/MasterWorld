/**
 * What the shaders know of the town: its texture arrays (groundTextures.ts TOWN_LAYERS: the buildings'
 * materials and the streets') and a mask of its ground for the terrain (R street, G market, B yard,
 * A under a building; world/town.ts), one texel a square metre, filtered so edges blend over a metre.
 */
import { ClampToEdgeWrapping, DataArrayTexture, DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector2 } from 'three/webgpu';
import { uniform } from 'three/tsl';
import type { GroundTextures } from '../terrain/groundTextures';
import { TOWN_TILE_METERS } from '../terrain/groundTextures';

let town: GroundTextures | null = null;
/** The town's texture arrays; set at load, before the warm-up builds the terrain and building shaders. */
export function useTownTextures(t: GroundTextures): void { town = t; }
/** The town's texture arrays (a blank array if they were never loaded). */
export function townTextures(): GroundTextures {
  return town ?? (town = { albedo: blankArray(), normal: blankArray() });
}
function blankArray(): DataArrayTexture {
  const t = new DataArrayTexture(new Uint8Array(TOWN_TILE_METERS.length * 4).fill(128), 1, 1, TOWN_TILE_METERS.length);
  t.needsUpdate = true;
  return t;
}

function maskTexture(data: Uint8Array, w: number, h: number): DataTexture {
  const t = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.magFilter = t.minFilter = LinearFilter;
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export const TOWN_GROUND = {
  mask: maskTexture(new Uint8Array(4), 1, 1) as DataTexture,
  /** World xz of the mask's corner, and its size in metres. */
  origin: uniform(new Vector2(0, 0)),
  size: uniform(new Vector2(1, 1)),
};

/** The ground mask of a town: `at(i, j)` gives TownGround per cell (1 yard, 2 street, 3 market, 4 building). */
export function useTownGround(x0: number, z0: number, nx: number, nz: number, cell: number, at: (i: number, j: number) => number): void {
  const data = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const g = at(i, j), o = (i + j * nx) * 4;
    if (g === 2) data[o] = 255; else if (g === 3) data[o + 1] = 255; else if (g === 1) data[o + 2] = 255; else if (g === 4) data[o + 3] = 255;
  }
  // A new texture (set before the warm-up builds the terrain shader, which samples it).
  TOWN_GROUND.mask = maskTexture(data, nx, nz);
  TOWN_GROUND.origin.value.set(x0, z0);
  TOWN_GROUND.size.value.set(nx * cell, nz * cell);
}

/**
 * The town's farmland for the terrain shader: one texel a square metre, R a track (trodden earth),
 * G a field, B its crop (index into CROPS, times CROP_STEP / 255), A the way its rows run (0..π as
 * 0..1). Crop and rows reach two metres past each field, so filtering at its edge mixes nothing in.
 */
export const FIELD_GROUND = {
  mask: maskTexture(new Uint8Array(4), 1, 1) as DataTexture,
  origin: uniform(new Vector2(0, 0)),
  size: uniform(new Vector2(1, 1)),
};

/** The crop index's step in the mask's blue channel. */
export const CROP_STEP = 20;

/** `at(i, j)`: per cell, whether it is a track, and the field there (crop index, rows), if any. */
export function useFieldGround(x0: number, z0: number, nx: number, nz: number, cell: number, at: (i: number, j: number) => { path: boolean; crop: number; rows: number } | null): void {
  const data = new Uint8Array(nx * nz * 4);
  const has = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const g = at(i, j), o = (i + j * nx) * 4;
    if (!g) continue;
    if (g.path) data[o] = 255;
    if (g.crop >= 0) {
      data[o + 1] = 255;
      data[o + 2] = g.crop * CROP_STEP;
      data[o + 3] = Math.round((((g.rows % Math.PI) + Math.PI) % Math.PI) / Math.PI * 255);
      has[i + j * nx] = 1;
    }
  }
  // Spread crop and rows two cells out from every field.
  for (let pass = 0; pass < 2; pass++) {
    const was = has.slice();
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (was[i + j * nx]) continue;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= nx || b >= nz || !was[a + b * nx]) continue;
        const o = (i + j * nx) * 4, q = (a + b * nx) * 4;
        data[o + 2] = data[q + 2]; data[o + 3] = data[q + 3];
        has[i + j * nx] = 1;
        break;
      }
    }
  }
  FIELD_GROUND.mask = maskTexture(data, nx, nz);
  FIELD_GROUND.origin.value.set(x0, z0);
  FIELD_GROUND.size.value.set(nx * cell, nz * cell);
}

/**
 * How each crop looks from above (CROPS order), two rows of a texture: row 0 its colour (sRGB) and
 * how much of the soil its plants cover; row 1 the row spacing (m, over 2), clumps (cabbages) or lines,
 * how deep the furrows run and how plain the rows are.
 */
const CROP_LOOKS: readonly [number, number, number, number, number, number, number, number][] = [
  // r, g, b, cover, spacing, clumps, furrows, rows
  [196, 162, 84, 0.9, 0.25, 0, 0.15, 0.25], // wheat
  [172, 150, 96, 0.9, 0.25, 0, 0.15, 0.25], // rye
  [208, 186, 114, 0.88, 0.22, 0, 0.15, 0.25], // barley
  [178, 176, 104, 0.85, 0.25, 0, 0.15, 0.25], // oats
  [66, 98, 42, 0.55, 0.7, 0.4, 0.45, 1], // beans
  [104, 128, 132, 0.8, 0.25, 0, 0.2, 0.4], // flax (in flower)
  [86, 124, 88, 0.45, 0.75, 1, 0.5, 1], // cabbage
  [0, 0, 0, 0, 0.9, 0, 1, 1], // ploughed
  [118, 126, 66, 0.85, 0.9, 0, 0.25, 0.2], // fallow (stubble and weeds over old furrows)
  [104, 136, 58, 1, 1, 0, 0, 0], // meadow
  [96, 134, 54, 1, 1, 0, 0, 0], // pasture
];

export const CROP_LOOK = (() => {
  const n = CROP_LOOKS.length, data = new Uint8Array(n * 2 * 4);
  CROP_LOOKS.forEach(([r, g, b, cover, spacing, clumps, furrows, rows], i) => {
    data.set([r, g, b, cover * 255], i * 4);
    data.set([(spacing / 2) * 255, clumps * 255, furrows * 255, rows * 255], (n + i) * 4);
  });
  const t = new DataTexture(data, n, 2, RGBAFormat, UnsignedByteType);
  t.needsUpdate = true;
  return { texture: t, count: n };
})();
