/**
 * Where a new game starts (plan section 6): the first place, spiralling out from the origin, that fits the
 * setting's start rules (biome, elevation, gentle ground). Deterministic per seed.
 */
import type { SettingModule } from '../setting/contract';
import { emptySample, type Skeleton } from './skeleton';

export interface StartPlace {
  x: number;
  z: number;
  elevation: number;
  biome: string;
}

const STEP = 2000;
const MAX_RINGS = 400;

/** The slope (rise per metre) at a point, from the skeleton's height over ±25 m. */
export function slopeAt(sk: Skeleton, x: number, z: number, d = 25): number {
  const dx = sk.elevation(x + d, z) - sk.elevation(x - d, z);
  const dz = sk.elevation(x, z + d) - sk.elevation(x, z - d);
  return Math.hypot(dx, dz) / (2 * d);
}

/** Height difference between the highest and lowest of 24 points within 6 km. */
export function vistaAt(sk: Skeleton, x: number, z: number): number {
  let lo = Infinity, hi = -Infinity;
  for (const r of [2000, 4000, 6000]) for (let a = 0; a < 8; a++) {
    const e = sk.elevation(x + Math.cos((a * Math.PI) / 4) * r, z + Math.sin((a * Math.PI) / 4) * r);
    lo = Math.min(lo, e);
    hi = Math.max(hi, e);
  }
  return hi - lo;
}

export function findStart(sk: Skeleton, setting: SettingModule): StartPlace {
  const want = setting.start;
  const ids = sk.shape.biomes.map((b) => b.id);
  const s = emptySample();
  // Square rings around the origin, each walked in a fixed order.
  for (let ring = 0; ring <= MAX_RINGS; ring++) {
    for (let i = -ring; i <= ring; i++) {
      for (const [gx, gz] of ring === 0 ? [[0, 0]] : [[i, -ring], [ring, i], [-i, ring], [-ring, -i]]) {
        const x = gx * STEP, z = gz * STEP;
        sk.sample(x, z, s);
        if (s.biome < 0 || !want.biomes.includes(ids[s.biome])) continue;
        if (s.elevation < want.elevation[0] || s.elevation > want.elevation[1]) continue;
        if (slopeAt(sk, x, z) > want.maxSlope) continue;
        if (vistaAt(sk, x, z) < want.vista) continue;
        return { x, z, elevation: s.elevation, biome: ids[s.biome] };
      }
    }
  }
  throw new Error(`no start place within ${(MAX_RINGS * STEP) / 1000} km for setting "${setting.id}"`);
}
