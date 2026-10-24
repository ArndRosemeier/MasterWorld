/**
 * Where the water is, how high its surface lies and how it flows (pure, runs in workers): masks around the
 * camera that the water and terrain shaders read. One surface for everything: the sea at level 0, lakes at
 * their spill level, rivers at their sloping level (hydro.ts).
 */
import { emptyWater } from './hydro';
import type { Terrain } from './terrain';

export const SEA_LEVEL = 0;
/** Flow speed of rivers, m/s (for ripples and foam drifting downstream). */
const RIVER_SPEED = 0.9;
/** Pixels a water level is carried onto dry land, so the surface mesh interpolates cleanly to the shore. */
const DILATE = 3;
/** Depth written where no water is near (the surface hides below the ground). */
export const DRY = -3;

export interface MaskJob {
  seed: number;
  setting: string;
  /** World position of the mask's minimum corner and its side, metres; samples per side. */
  x0: number;
  z0: number;
  size: number;
  res: number;
}

/**
 * Float RGBA per sample, row-major from (x0, z0), sampled at pixel centres: R = water surface level,
 * G = water depth (level - ground; negative on land), B, A = flow velocity x, z (m/s).
 */
export function waterMask(t: Terrain, job: MaskJob): Float32Array {
  const { x0, z0, size, res } = job;
  const out = new Float32Array(res * res * 4);
  const wet = new Uint8Array(res * res);
  const ground = new Float32Array(res * res);
  const step = size / res;
  const w = emptyWater();
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
    const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step, p = j * res + i;
    const h = t.height(x, z);
    ground[p] = h;
    let level = NaN, fx = 0, fz = 0;
    t.hydro.query(x, z, w);
    // A river shows in a mask only where it is at least a pixel wide (finer masks draw the narrow ones), and only
    // where its surface is above the ground: a coarse pixel smeared over the banks would float a sheet of water.
    if (w.river && w.dist < w.half + step / 2 && 2 * w.half >= step && h < w.level + 0.3) { level = w.level; fx = w.fx * RIVER_SPEED; fz = w.fz * RIVER_SPEED; }
    else if (!Number.isNaN(w.lake) && h < w.lake) level = w.lake;
    else if (h < SEA_LEVEL) level = SEA_LEVEL;
    if (!Number.isNaN(level)) {
      wet[p] = 1;
      out[p * 4] = level; out[p * 4 + 1] = level - h; out[p * 4 + 2] = fx; out[p * 4 + 3] = fz;
    } else {
      out[p * 4] = h + DRY; out[p * 4 + 1] = DRY;
    }
  }
  // Carry levels a few pixels onto the land (depth stays negative there).
  for (let pass = 0; pass < DILATE; pass++) {
    const next = wet.slice();
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const p = j * res + i;
      if (wet[p]) continue;
      let sum = 0, cnt = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= res || b >= res) continue;
        const q = b * res + a;
        if (wet[q]) { sum += out[q * 4]; cnt++; }
      }
      if (!cnt) continue;
      const level = sum / cnt;
      out[p * 4] = level; out[p * 4 + 1] = Math.min(DRY / 3, level - ground[p]);
      next[p] = 2;
    }
    wet.set(next);
  }
  return out;
}
