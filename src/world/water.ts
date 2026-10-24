/**
 * Where the water is and how deep (pure, runs in workers): depth masks around the camera that the water
 * shader reads for colour, foam and waves. The sea lies at level 0; lakes and rivers come later.
 */
import type { Terrain } from './terrain';

export const SEA_LEVEL = 0;
/** Samples per side of a depth mask. */
export const MASK_RES = 256;
/** Encoded depth range: one byte per channel, half-metre steps from -16 m (dry land) to 111.5 m. */
const MIN = -16, STEP = 0.5;

export const encodeDepth = (d: number): number => Math.max(0, Math.min(255, Math.round((d - MIN) / STEP)));
export const decodeDepth = (b: number): number => b * STEP + MIN;

export interface DepthJob {
  seed: number;
  setting: string;
  /** World position of the mask's minimum corner and its side, metres. */
  x0: number;
  z0: number;
  size: number;
  res: number;
}

/** RGBA bytes, row-major from (x0, z0): R = sea depth (encoded), G, B, A spare (lakes, flow later). */
export function depthMask(t: Terrain, job: DepthJob): Uint8Array {
  const { x0, z0, size, res } = job;
  const out = new Uint8Array(res * res * 4);
  const step = size / res;
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const h = t.height(x0 + (i + 0.5) * step, z0 + (j + 0.5) * step);
    out[(j * res + i) * 4] = encodeDepth(SEA_LEVEL - h);
    out[(j * res + i) * 4 + 3] = 255;
  }
  return out;
}
