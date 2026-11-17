/**
 * Squeezes (D63: no squeezing, ever; pure, runs in a worker): a mouth in the rock the hero sees from where they can go, with air
 * going on behind it that they cannot get into: a low slot over rubble, a crawl under a slab, a space beyond a hole too small for
 * them. The air the hero's body can take (the reading's reached cells, their column up to the roof and a metre round) is "covered";
 * water (swum), the sinks' shafts (the land's water coming in, out of reach on purpose) and the ladders' winzes are covered too.
 * What air is left is cut into lumps; a lump that opens onto covered air and goes on at least `DEEP` metres behind its mouth is a
 * squeeze: `low` when there is no standing ground in it to speak of (fewer than `STAND_LEAST` cells), `beyond` when there is (a part the
 * concession could not join).
 * `sealSqueezes` closes them with rock (the concession's last word: a slot it cannot open, or a nook not worth a way, is shut).
 */
import { BRICK, brickIndex, setSample, type BrickField } from '../dungeon/rockMesh';
import type { Dressing } from './dress';
import type { Reading } from './reader';
import type { Skeleton } from './skeleton';

/** A squeeze: its mouth (the middle of where it meets covered air), its air (m3) and how far it goes on behind its mouth (m). */
export interface Squeeze {
  readonly kind: 'low' | 'beyond';
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly volume: number;
  readonly deep: number;
  /** The reader's cells (standing ground) in it. */
  readonly stands: number;
  /** Its samples (indices i + nx * (j + ny * k)). */
  readonly samples: readonly number[];
}

/** Standing ground of fewer cells than this is a niche, not a place to go (about a square metre): the concession joins lumps from this size on. */
export const STAND_LEAST = 4;
/** Lumps of less air than this (m3) are niches. */
const LEAST = 4;
/** A lump going on less far than this behind its mouth (m) is a niche in the wall. */
const DEEP = 1.5;
/** How far round a standing body the air counts as the hero's (m). */
const ROUND = 1;

const AIR = 1, COVERED = 2, SEEN = 4;

/** The column of samples nearest a point (i, k); outside the field they are out of range. */
const column = (f: BrickField, x: number, z: number): [number, number] => [Math.round((x - f.ox) / f.step), Math.round((z - f.oz) / f.step)];

/** The sample of the air just over a floor point (index i + nx * (j + ny * k)), or -1 outside the field. */
export function floorSample(f: BrickField, x: number, y: number, z: number): number {
  const [i, k] = column(f, x, z), j = Math.floor((y - f.oy) / f.step) + 1;
  return i >= 0 && k >= 0 && j >= 0 && i < f.nx && k < f.nz && j < f.ny ? i + f.nx * (j + f.ny * k) : -1;
}

/** The squeezes of a read cave. */
export function findSqueezes(f: BrickField, r: Reading, sk: Skeleton, dressing?: Dressing): Squeeze[] {
  const { nx, ny, nz, step } = f, at = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const flag = new Uint8Array(nx * ny * nz);
  // Air: brick by brick (a missing brick is solid).
  for (let bk = 0; bk < f.bz; bk++) for (let bj = 0; bj < f.by; bj++) for (let bi = 0; bi < f.bx; bi++) {
    const brick = f.bricks[brickIndex(f, bi * BRICK, bj * BRICK, bk * BRICK)];
    if (!brick) continue;
    for (let kk = 0; kk < BRICK; kk++) for (let jj = 0; jj < BRICK; jj++) for (let ii = 0; ii < BRICK; ii++) {
      const i = bi * BRICK + ii, j = bj * BRICK + jj, k = bk * BRICK + kk;
      if (i < nx && j < ny && k < nz && brick[ii + BRICK * (jj + BRICK * kk)] > 0) flag[at(i, j, k)] = AIR;
    }
  }
  const cover = (i: number, j: number, k: number): void => { if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) { const s = at(i, j, k); if (flag[s] & AIR) flag[s] |= COVERED; } };
  const coverBall = (x: number, y0: number, y1: number, z: number, rad: number): void => {
    const [ci, ck] = column(f, x, z), R = Math.ceil(rad / step), j0 = Math.floor((y0 - f.oy) / step), j1 = Math.ceil((y1 - f.oy) / step);
    for (let dk = -R; dk <= R; dk++) for (let di = -R; di <= R; di++) if (di * di + dk * dk <= R * R) for (let j = j0; j <= j1; j++) cover(ci + di, j, ck + dk);
  };
  // The hero's air: over each reached cell, up to its roof.
  for (let c = 0; c < r.count; c++) if (r.depth[c] < Infinity) coverBall(r.x[c], r.y[c] - 0.3, r.y[c] + r.room[c], r.z[c], ROUND);
  // Water is swum (a sump's way under its lid too), the sinks' shafts are the land's water coming in, a winze is climbed by its ladder.
  for (const p of dressing?.pools ?? []) coverBall(p.x, p.y - (p.depth ?? 1) - 4, p.y + 0.6, p.z, p.r + 3);
  for (const c of sk.conduits) if (c.kind === 'shaft') { const p = c.points[0], top = c.points[c.points.length - 1]; coverBall(p.x, p.y, top.y + top.B + 2, p.z, Math.max(p.A, top.A) * 1.6 + 1); }
  for (const l of dressing?.ladders ?? []) for (let t = 0; t <= 1; t += 0.05) coverBall(l.x0 + (l.x1 - l.x0) * t, l.y0 + (l.y1 - l.y0) * t - 0.3, l.y0 + (l.y1 - l.y0) * t + 2.5, l.z0 + (l.z1 - l.z0) * t, 1.5);

  // Cells by sample, to tell standing ground in a lump.
  const cellAt = new Set<number>();
  for (let c = 0; c < r.count; c++) { const s = floorSample(f, r.x[c], r.y[c], r.z[c]); if (s >= 0) cellAt.add(s); }

  const out: Squeeze[] = [], nb = [1, -1, nx, -nx, nx * ny, -nx * ny];
  for (let s0 = 0; s0 < flag.length; s0++) {
    if (flag[s0] !== AIR) continue;
    const lump = [s0];
    flag[s0] |= SEEN;
    let mouth = 0, mx = 0, my = 0, mz = 0, sx = 0, sy = 0, sz = 0, stands = 0;
    for (let n = 0; n < lump.length; n++) {
      const s = lump[n], i = s % nx, j = Math.floor(s / nx) % ny, k = Math.floor(s / (nx * ny));
      sx += i; sy += j; sz += k;
      if (cellAt.has(s)) stands++;
      let open = false;
      for (let d = 0; d < 6; d++) {
        if ((d === 0 && i === nx - 1) || (d === 1 && i === 0) || (d === 2 && j === ny - 1) || (d === 3 && j === 0) || (d === 4 && k === nz - 1) || (d === 5 && k === 0)) continue;
        const t = s + nb[d], fl = flag[t];
        if (!(fl & AIR)) continue;
        if (fl & COVERED) { open = true; continue; }
        if (!(fl & SEEN)) { flag[t] |= SEEN; lump.push(t); }
      }
      if (open) { mouth++; mx += i; my += j; mz += k; }
    }
    const volume = lump.length * step ** 3;
    if (!mouth || volume < LEAST) continue;
    const n = lump.length, deep = Math.hypot(sx / n - mx / mouth, sz / n - mz / mouth) * step;
    if (deep < DEEP) continue;
    out.push({ kind: stands >= STAND_LEAST ? 'beyond' : 'low', x: f.ox + (mx / mouth) * step, y: f.oy + (my / mouth) * step, z: f.oz + (mz / mouth) * step, volume, deep, stands, samples: lump });
  }
  return out;
}

/** Close squeezes with rock: their air becomes rock just inside the skin (the covered air beside them keeps its own). */
export function sealSqueezes(f: BrickField, squeezes: readonly Squeeze[]): void {
  const { nx, ny } = f;
  for (const q of squeezes) for (const s of q.samples) setSample(f, s % nx, Math.floor(s / nx) % ny, Math.floor(s / (nx * ny)), -0.5);
}

/** A dressing without what lay in the squeezes that were sealed (the loose things there are in the rock now). */
export function clearSealed(d: Dressing, f: BrickField, sealed: readonly Squeeze[]): Dressing {
  if (!sealed.length) return d;
  const shut = new Set<number>();
  for (const q of sealed) for (const s of q.samples) shut.add(s);
  const { nx, ny, nz, step } = f;
  const inShut = (x: number, y: number, z: number): boolean => {
    const [i, k] = column(f, x, z), j0 = Math.floor((y - f.oy) / step);
    if (i < 0 || k < 0 || i >= nx || k >= nz) return false;
    for (let j = Math.max(0, j0); j <= Math.min(ny - 1, j0 + 1); j++) if (shut.has(i + nx * (j + ny * k))) return true;
    return false;
  };
  return {
    ...d,
    speleos: d.speleos.filter((s) => !(inShut(s.x, s.y0, s.z) || inShut(s.x, s.y1, s.z) || inShut(s.x, (s.y0 + s.y1) / 2, s.z))),
    stones: d.stones.filter((s) => s.ore >= 0 || !inShut(s.x, s.y, s.z)),
    crystals: d.crystals.filter((c) => !inShut(c.x, c.y, c.z)),
    rocks: d.rocks.filter((k) => !inShut(k.x, k.y, k.z)),
    drips: d.drips.filter((p) => !(inShut(p.x, p.y, p.z) || inShut(p.x, p.floor, p.z))),
    fittings: d.fittings.filter((k) => !inShut(k.x, k.y, k.z)),
  };
}
