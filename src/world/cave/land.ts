/**
 * A made-up land over a cave block (pure, seeded), for looking at caves before they stand under the game's real land
 * (K5 gives the block the terrain's own heights): a plateau of rolling ground dropping into a valley on one side,
 * pitted with dolines where the water gathers (none on volcanic ground: `lava`).
 */
import { Noise, Rng, deriveSeed, smoothstep } from '@futuremagic/core';
import type { CaveLand } from './block';

export function previewLand(seed: number, across: number, deep: number, lava = false): CaveLand {
  const rng = new Rng(deriveSeed(seed, 'cave', 'land')), noise = new Noise(deriveSeed(seed, 'cave', 'ground'));
  const dir = rng.int(0, 3), floor = deep * rng.range(0.16, 0.3), plateau = deep + rng.range(10, 22);
  // (Volcanic country has no dolines: its ground is a lava field, a flow's crust.)
  const dolines = Array.from({ length: lava ? 0 : rng.int(3, 7) }, () => ({ x: rng.range(0.1, 0.9) * across, z: rng.range(0.1, 0.9) * across, r: rng.range(12, 34), d: rng.range(8, 22) }));
  return {
    surface(x, z) {
      // Distance from the valley side, 0 at it and 1 across the block.
      const t = (dir === 0 ? x : dir === 1 ? across - x : dir === 2 ? z : across - z) / across;
      let h = floor + (plateau - floor) * smoothstep(0, 0.42, t) + noise.fbm2(x / 70, z / 70, 3) * 6;
      for (const d of dolines) h -= d.d * Math.exp(-((x - d.x) ** 2 + (z - d.z) ** 2) / (d.r * d.r));
      return h;
    },
  };
}
