/**
 * What the shaders know of the town: its texture arrays (groundTextures.ts TOWN_LAYERS: the buildings'
 * materials and the streets') and a mask of its ground for the terrain (R street, G market, B yard,
 * A under a building; world/town.ts), one texel a square metre, filtered so edges blend over a metre.
 */
import { ClampToEdgeWrapping, DataArrayTexture, DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector2, Vector4 } from 'three/webgpu';
import { uniform, uniformArray } from 'three/tsl';
import type { GroundTextures } from '../terrain/groundTextures';
import { TOWN_TILE_METERS } from '../terrain/groundTextures';
import { TOWN_RASTER, type Town } from '../../world/town';
import { townMaskData } from '../../world/townMask';

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

/**
 * The town's two ground masks in one texture, side by side (one texture unit: the land's shader is near
 * WebGL 2's 16). Left half, the ground (R street, G market, B yard, A under a building); right half,
 * the farmland (R a track, i.e. trodden earth; G a field; B its crop, an index into CROPS times
 * CROP_STEP / 255; A the way its rows run, 0..π as 0..1). Crop and rows reach two metres past each
 * field, so filtering at its edge mixes nothing in.
 */
export const TOWN_MASKS = {
  mask: maskTexture(new Uint8Array(8), 2, 1) as DataTexture,
  /** World xz of the masks' corner, and their size in metres. */
  origin: uniform(new Vector2(0, 0)),
  size: uniform(new Vector2(1, 1)),
  /** Half a texel of one mask, as a share of it (reads are kept inside their own half). */
  half: uniform(new Vector2(0.5, 0.5)),
  /** How wholly its streets and market are paved: 0, a village's stones laid where the traffic is; 1, a city's wall to wall. */
  paved: uniform(0),
};

export { CROP_STEP } from '../../world/townMask';

/**
 * The town's masks (world/townMask.ts): set before the warm-up builds the terrain shader, which samples them.
 * Their texture keeps the start town's size.
 */
export function useTownMasks(town: Town): void {
  const { x0, z0, nx, nz } = town, cell = TOWN_RASTER;
  const data = townMaskData(town, nx, nz);
  TOWN_MASKS.mask = maskTexture(data, nx * 2, nz);
  TOWN_MASKS.origin.value.set(x0, z0);
  TOWN_MASKS.size.value.set(nx * cell, nz * cell);
  TOWN_MASKS.half.value.set(0.5 / nx, 0.5 / nz);
}

/**
 * The masks move to another settlement (the one the hero is nearest): its masks (townMaskData, baked in a
 * worker at townMaskSize) go into the same texture, so the shader keeps reading it and nothing compiles. `paved`:
 * how wholly its streets are paved (TOWN_MASKS.paved; a uniform, so nothing compiles either).
 */
export function moveTownMasks(x0: number, z0: number, data: Uint8Array, paved = 0): void {
  const img = TOWN_MASKS.mask.image as { data: Uint8Array; width: number; height: number };
  img.data.set(data);
  TOWN_MASKS.mask.needsUpdate = true;
  TOWN_MASKS.origin.value.set(x0, z0);
  TOWN_MASKS.size.value.set((img.width / 2) * TOWN_RASTER, img.height * TOWN_RASTER);
  TOWN_MASKS.paved.value = paved;
}

/** The masks' texels a side (one mask): a settlement's masks are baked at this size to move in. */
export function townMaskSize(): [number, number] {
  const img = TOWN_MASKS.mask.image as { width: number; height: number };
  return [img.width / 2, img.height];
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
  [92, 122, 74, 0.8, 0.25, 0, 0.2, 0.4], // flax (green stems; its pale blue flowers read as water from the ground)
  [86, 124, 88, 0.45, 0.75, 1, 0.5, 1], // cabbage
  [0, 0, 0, 0, 0.9, 0, 1, 1], // ploughed
  [118, 126, 66, 0.85, 0.9, 0, 0.25, 0.2], // fallow (stubble and weeds over old furrows)
  [104, 136, 58, 1, 1, 0, 0, 0], // meadow
  [96, 134, 54, 1, 1, 0, 0, 0], // pasture
];

export const CROP_LOOK = (() => {
  const n = CROP_LOOKS.length;
  const looks = CROP_LOOKS.map(([r, g, b, cover]) => new Vector4(r / 255, g / 255, b / 255, cover));
  const shapes = CROP_LOOKS.map(([, , , , spacing, clumps, furrows, rows]) => new Vector4(spacing / 2, clumps, furrows, rows));
  // A uniform array, not a texture: the land's shader has no texture unit to spare.
  return { table: uniformArray([...looks, ...shapes], 'vec4'), count: n };
})();
