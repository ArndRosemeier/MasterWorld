/**
 * The ground's texture layers: generated at load by @futuremagic/texgen in workers, uploaded as two
 * texture arrays (albedo + roughness, normal + height + AO), one layer per natural surface.
 */
import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType } from 'three/webgpu';
import { FACADE_TILE_METERS, GROUND_TILE_METERS, MEDIEVAL_NAMES, MEDIEVAL_TILE_METERS, NATURAL_LAYER_COUNT, NATURAL_NAMES, NATURAL_TILE_METERS } from '@futuremagic/texgen';
import type { TexturePool } from '../../workers/pool';
import type { TextureSet } from '../../workers/texture.worker';

export interface GroundTextures {
  /** RGB = albedo (sRGB), A = roughness. */
  albedo: DataArrayTexture;
  /** RG = tangent normal, B = height, A = ambient occlusion. */
  normal: DataArrayTexture;
}

function arrayTexture(data: Uint8Array, size: number, layers: number, srgb: boolean): DataArrayTexture {
  const t = new DataArrayTexture(data, size, size, layers);
  t.format = RGBAFormat;
  t.type = UnsignedByteType;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Generate layers in the texture workers and pack them into the two arrays. */
async function loadLayers(pool: TexturePool, jobs: readonly { set: TextureSet; layer: number }[], size: number): Promise<GroundTextures> {
  const layers = await Promise.all(jobs.map((j) => pool.run({ ...j, size })));
  const px = size * size * 4;
  const albedo = new Uint8Array(px * layers.length), normal = new Uint8Array(px * layers.length);
  layers.forEach((l, i) => { albedo.set(l.albedo, i * px); normal.set(l.normal, i * px); });
  return { albedo: arrayTexture(albedo, size, layers.length, true), normal: arrayTexture(normal, size, layers.length, false) };
}

export function loadGroundTextures(pool: TexturePool, size = 512): Promise<GroundTextures> {
  return loadLayers(pool, Array.from({ length: NATURAL_LAYER_COUNT }, (_, layer) => ({ set: 'natural' as const, layer })), size);
}

/** A texgen layer of a named set (medieval, natural) by its name. */
const named = (set: 'medieval' | 'natural', names: readonly string[]) => (name: string): { set: TextureSet; layer: number } => {
  const layer = names.indexOf(name);
  if (layer < 0) throw new Error(`texgen has no ${set} layer "${name}"`);
  return { set, layer };
};
const MED = named('medieval', MEDIEVAL_NAMES), NAT = named('natural', NATURAL_NAMES);
/** texgen facade layers used in towns (FACADE_WALLS then ROOFS order). */
const FACADE = { limestone: 4, plaster: 6, clayTile: 17, slate: 18 };
/** texgen ground layers used in towns (GROUNDS order). */
const GROUND = { dirt: 11 };

/**
 * The town's layers: first one per BuildingMat (@futuremagic/settlement, in its order), then the town's
 * ground (TOWN_GROUND_LAYER), then the cellars' surfaces (CellarMat), then the land's (WildMat).
 */
export const TOWN_LAYERS: readonly { set: TextureSet; layer: number }[] = [
  { set: 'facade', layer: FACADE.plaster }, MED('rubble'), { set: 'facade', layer: FACADE.limestone }, MED('oak'), MED('thatch'),
  { set: 'facade', layer: FACADE.clayTile }, { set: 'facade', layer: FACADE.slate }, MED('shingle'), MED('leaded'),
  MED('cobbles'), { set: 'ground', layer: GROUND.dirt },
  // The cellars' (world/dungeon/meshKit.ts CellarMat).
  MED('flagstone'), MED('brick'), MED('boards'), MED('limewash'),
  // The land's rock and grass, for what stands out on it (meshKit.ts WildMat: a barrow's stones and turf).
  NAT('rockFace'), NAT('wildGrass'),
];
/** Where the town's ground layers sit in TOWN_LAYERS: cobbles (streets and market) and trodden earth (yards). */
export const TOWN_GROUND_LAYER = { cobble: 9, dirt: 10 };

const TILE: Record<TextureSet, readonly number[]> = { facade: FACADE_TILE_METERS, ground: GROUND_TILE_METERS, medieval: MEDIEVAL_TILE_METERS, natural: NATURAL_TILE_METERS };
/** Metres one tile of each TOWN_LAYERS layer covers. */
export const TOWN_TILE_METERS: readonly number[] = TOWN_LAYERS.map((l) => TILE[l.set][l.layer]);

export function loadTownTextures(pool: TexturePool, size = 512): Promise<GroundTextures> {
  return loadLayers(pool, TOWN_LAYERS, size);
}
