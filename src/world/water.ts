/**
 * Where the water is, how high its surface lies and how it flows (pure, runs in workers): masks around the
 * camera that the water and terrain shaders read. One surface for everything: the sea at level 0, lakes at
 * their spill level, rivers at their sloping level (hydro.ts).
 */
import { smoothstep } from '@futuremagic/core';
import { emptyWater, inChannel } from './hydro';
import { LAKE_GRID, type Lake } from './lakes';
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
/** How far above a river's level its flow is carried onto the bank (m). */
const FLOW_BANK = 2;
/** Depth written where no water is near (the surface hides below the ground). */
export const DRY = -3;

/** How still a river's water is at (x, z) by lake `l`: 1 from the water's edge in, 0 a cell out from it. */
const stillBy = (l: Lake | null, x: number, z: number): number => (l ? 1 - smoothstep(LAKE_GRID / 2, LAKE_GRID, l.shore(x, z)) : 0);

export interface MaskJob {
  seed: number;
  setting: string;
  /** World position of the mask's minimum corner and its side, metres; samples per side. */
  x0: number;
  z0: number;
  size: number;
  res: number;
  /** A piece of a mask (maskPieces): samples across and down from (x0, z0), at the mask's spacing (size / res). */
  cols?: number;
  rows?: number;
}

/** One piece of a mask made apart (in its own worker): the samples it makes, and the part of them the mask keeps. */
export interface MaskPiece {
  /** Its first sample's corner, and how many samples it makes across and down. */
  readonly x0: number;
  readonly z0: number;
  readonly cols: number;
  readonly rows: number;
  /** Where its kept part starts in its own samples, and in the whole mask's; how big that part is. */
  readonly ci: number;
  readonly cj: number;
  readonly i0: number;
  readonly j0: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A mask cut into `k` × `k` pieces, so several workers make it side by side. Each piece makes MARGIN samples more
 * on each side inside the mask: the levels carried onto the land (DILATE passes) reach that far, so the part it keeps
 * comes out exactly as in the mask made whole.
 */
export function maskPieces(x0: number, z0: number, size: number, res: number, k: number): MaskPiece[] {
  const step = size / res, m = DILATE + HIDDEN_DILATE, out: MaskPiece[] = [];
  const edge = (n: number) => Math.round((n * res) / k);
  for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) {
    const i0 = edge(a), j0 = edge(b), w = edge(a + 1) - i0, h = edge(b + 1) - j0;
    const s0 = Math.max(0, i0 - m), t0 = Math.max(0, j0 - m), s1 = Math.min(res, i0 + w + m), t1 = Math.min(res, j0 + h + m);
    out.push({ x0: x0 + s0 * step, z0: z0 + t0 * step, cols: s1 - s0, rows: t1 - t0, ci: i0 - s0, cj: j0 - t0, i0, j0, w, h });
  }
  return out;
}

/** The whole mask (`res` samples a side) from its pieces' samples, in maskPieces' order. */
export function joinPieces(res: number, pieces: readonly MaskPiece[], made: readonly Float32Array[]): Float32Array {
  const out = new Float32Array(res * res * 4);
  pieces.forEach((p, n) => {
    const d = made[n];
    for (let j = 0; j < p.h; j++) out.set(d.subarray(((p.cj + j) * p.cols + p.ci) * 4, ((p.cj + j) * p.cols + p.ci + p.w) * 4), ((p.j0 + j) * res + p.i0) * 4);
  });
  return out;
}

/**
 * Float RGBA per sample, row-major from (x0, z0), sampled at pixel centres: R = water surface level,
 * G = water depth (level - ground; negative on land), B, A = flow velocity x, z (m/s).
 */
export function waterMask(t: Terrain, job: MaskJob): Float32Array {
  const { x0, z0, size, res } = job;
  const cols = job.cols ?? res, rows = job.rows ?? res;
  const out = new Float32Array(cols * rows * 4);
  const wet = new Uint8Array(cols * rows);
  const ground = new Float32Array(cols * rows);
  const step = size / res;
  const w = emptyWater();
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + (i + 0.5) * step, z = z0 + (j + 0.5) * step, p = j * cols + i;
    const h = t.height(x, z);
    ground[p] = h;
    let level = NaN, fx = 0, fz = 0;
    t.hydro.query(x, z, w);
    // A river shows in a mask only where it is at least a pixel wide (finer masks draw the narrow ones), and only
    // where its surface is above the ground: a coarse pixel smeared over the banks would float a sheet of water.
    // Where a river meets a lake at the lake's level, its current dies away towards the shore and the lake's still
    // water takes over at the water's edge (its channel, as wide as the river, reaches past its end there).
    const still = !Number.isNaN(w.lake) && h < w.lake && w.river && w.level <= w.lake + 0.3 ? stillBy(t.hydro.lakeNear(x, z), x, z) : 0;
    if (still < 1 && inChannel(w, step / 2) && 2 * w.half >= step && h < w.level + 0.3) {
      // Rivers rush over a fall's lip and away from its foot.
      const v = (flowSpeed(w.slope) + (w.fallAt > -15 ? 2.7 * Math.exp(-Math.max(0, w.fallAt) / 25) : 0)) * (1 - still);
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
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const p = j * cols + i;
      if (wet[p]) continue;
      let sum = 0, cnt = 0, fx = 0, fz = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const a = i + di, b = j + dj;
        if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
        const q = b * cols + a;
        if (wet[q]) { sum += out[q * 4]; fx += out[q * 4 + 2]; fz += out[q * 4 + 3]; cnt++; }
      }
      if (!cnt) continue;
      const level = sum / cnt;
      // The true (negative) depth where the ground stands above the carried level, so the surface runs out
      // right at the waterline on a gentle beach instead of a pixel short of it. Where the ground lies below it
      // (beside a river's bed, a dip by a brook) the surface sinks under that ground, so no sheet of still
      // water floats over the land there. Its flow comes along by the waterline, so a river's edge runs with it;
      // not further from it, above it or below: there the level runs steeply up or down to the next dry ground
      // (a mesa's wall by a river, D56), and running water on a steep level is drawn as a fall, a white sheet.
      const d = level - ground[p];
      if (pass >= DILATE && d > 0) continue;
      out[p * 4] = d <= 0 ? level : ground[p] + DRY / 3; out[p * 4 + 1] = d <= 0 ? d : DRY / 3;
      const runs = d <= 0 && d > -FLOW_BANK;
      out[p * 4 + 2] = runs ? fx / cnt : 0; out[p * 4 + 3] = runs ? fz / cnt : 0;
      if (d <= 0) next[p] = 2;
    }
    wet.set(next);
  }
  return out;
}
