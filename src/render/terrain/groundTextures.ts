/**
 * The ground's texture layers: generated at load by @futuremagic/texgen in workers, uploaded as two
 * texture arrays (albedo + roughness, normal + height + AO), one layer per natural surface.
 */
import { DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RGBAFormat, RepeatWrapping, SRGBColorSpace, UnsignedByteType } from 'three/webgpu';
import { NATURAL_LAYER_COUNT } from '@futuremagic/texgen';
import type { TexturePool } from '../../workers/pool';

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

export async function loadGroundTextures(pool: TexturePool, size = 512): Promise<GroundTextures> {
  const layers = await Promise.all(Array.from({ length: NATURAL_LAYER_COUNT }, (_, layer) => pool.run({ layer, size })));
  const px = size * size * 4;
  const albedo = new Uint8Array(px * layers.length), normal = new Uint8Array(px * layers.length);
  layers.forEach((l, i) => { albedo.set(l.albedo, i * px); normal.set(l.normal, i * px); });
  return { albedo: arrayTexture(albedo, size, layers.length, true), normal: arrayTexture(normal, size, layers.length, false) };
}
