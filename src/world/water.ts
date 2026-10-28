/**
 * Where the water is, how high its surface lies and how it flows (pure, runs in workers): masks around the
 * camera that the water and terrain shaders read. One surface for everything: the sea at level 0, lakes at
 * their spill level, rivers at their sloping level (hydro.ts).
 */
import { emptyWater, inChannel } from './hydro';
import type { Terrain } from './terrain';

export const SEA_LEVEL = 0;
/**
 * Flow speed of running water, m/s, by its slope (for ripples and foam drifting downstream, white water where it
 * rushes): a lowland river glides at about 1 m/s, a steep brook tumbles at 3.
 */
export const flowSpeed = (slope: number): number => Math.min(3.5, 0.5 + 9 * Math.sqrt(slope));
/** Pixels a water level is carried onto dry land, so the surface mesh interpolates cleanly to the shore. */
const DILATE = 3;
/**
 * Further pixels it is carried where the ground stands above it (the surface stays hidden there): the water mesh's
 * vertices lie ~10-20 m apart a few hundred metres out, and a brook a pixel wide must not fall between them.
 */
const HIDDEN_DILATE = 6;
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
    if (inChannel(w, step / 2) && 2 * w.half >= step && h < w.level + 0.3) {
      // Rivers rush over a fall's lip and away from its foot.
      const v = flowSpeed(w.slope) + (w.fallAt > -15 ? 2.7 * Math.exp(-Math.max(0, w.fallAt) / 25) : 0);
      level = w.level; fx = w.fx * v; fz = w.fz * v;
    }
    else if (!Number.isNaN(w.lake) && h < w.lake) level = w.lake;
    else if (h < t.landforms.pondAt(x, z)) level = t.landforms.pondAt(x, z);
    else if (h < SEA_LEVEL) level = SEA_LEVEL;
    if (!Number.isNaN(level)) {
      wet[p] = 1;
      out[p * 4] = level; out[p * 4 + 1] = level - h; out[p * 4 + 2] = fx; out[p * 4 + 3] = fz;
    } else {
      out[p * 4] = h + DRY; out[p * 4 + 1] = DRY;
    }
  }
  // Carry levels a few pixels onto the land (depth stays negative there).
  for (let pass = 0; pass < DILATE + HIDDEN_DILATE; pass++) {
    const next = wet.slice();
    for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) {
      const p = j * res + i;
      if (wet[p]) continue;
      let sum = 0, cnt = 0, fx = 0, fz = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= res || b >= res) continue;
        const q = b * res + a;
        if (wet[q]) { sum += out[q * 4]; fx += out[q * 4 + 2]; fz += out[q * 4 + 3]; cnt++; }
      }
      if (!cnt) continue;
      const level = sum / cnt;
      // The true (negative) depth where the ground stands above the carried level, so the surface runs out
      // right at the waterline on a gentle beach instead of a pixel short of it. Where the ground lies below it
      // (beside a river's bed, a dip by a brook) the surface sinks under that ground, so no sheet of still
      // water floats over the land there. Its flow comes along, so a river's edge runs with it.
      const d = level - ground[p];
      if (pass >= DILATE && d > 0) continue;
      out[p * 4] = d <= 0 ? level : ground[p] + DRY / 3; out[p * 4 + 1] = d <= 0 ? d : DRY / 3;
      out[p * 4 + 2] = fx / cnt; out[p * 4 + 3] = fz / cnt;
      if (d <= 0) next[p] = 2;
    }
    wet.set(next);
  }
  return out;
}
