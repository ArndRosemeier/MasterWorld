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
