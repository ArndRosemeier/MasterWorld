/**
 * Land to fit a structure to when it is drawn on its own (the Z4 galleries and tests; pure): for a bridge, a gap a
 * road crosses along x (a deep gorge, a narrow cleft, a wide shallow valley, banks of two heights, a river with an
 * island); for a ruin, a hilltop, a hillside, a hollow or a spur. Each from its seed; in play the land is the world's.
 */
import { Noise, Rng, deriveSeed, smoothstep, type Ground } from '@futuremagic/core';

export const BRIDGE_LANDS = ['gorge', 'cleft', 'valley', 'banks', 'island'] as const;
export const RUIN_LANDS = ['hilltop', 'hillside', 'hollow', 'spur', 'plain'] as const;
export type LandKind = (typeof BRIDGE_LANDS)[number] | (typeof RUIN_LANDS)[number];

export interface Land {
  readonly kind: LandKind;
  readonly ground: Ground;
  /** The water's level, if water runs or stands there. */
  readonly water: number | null;
  /** How far the land reaches round the middle, m (what a picture shows of it). */
  readonly reach: number;
}

/** A gap for a bridge: the road along x, the river along z through x = 0. `kind` picks it, else the seed does. */
export function bridgeLand(seed: number, kind?: (typeof BRIDGE_LANDS)[number]): Land {
  const rng = new Rng(deriveSeed(seed, 'bridge-land')), noise = new Noise(deriveSeed(seed, 'bridge-noise'));
  const k = kind ?? rng.pick(BRIDGE_LANDS);
  const [w, depth] = ({ gorge: [rng.range(36, 60), rng.range(26, 42)], cleft: [rng.range(16, 26), rng.range(12, 22)], valley: [rng.range(80, 130), rng.range(6, 11)], banks: [rng.range(50, 80), rng.range(9, 15)], island: [rng.range(70, 100), rng.range(7, 12)] } as const)[k];
  const bankB = k === 'banks' ? rng.sign() * rng.range(4, 8) : rng.range(-1.2, 1.2);
  const wander = rng.range(4, 12), wave = rng.range(90, 160), skew = k === 'banks' ? rng.range(0.25, 0.4) : rng.range(-0.08, 0.08);
  const dry = (k === 'gorge' || k === 'cleft') && rng.chance(0.3);
  const ground: Ground = (x, z) => {
    const u = x - wander * Math.sin(z / wave), t = Math.abs(u) / (w / 2), side = u < 0 ? -1 : 1;
    const plateau = smoothstep(-w * 0.6, w * 0.6, x) * bankB;
    // How the sides fall: steep walls, a cleft's sheer sides, a valley's long slopes; banks: one steep, one gentle.
    const sides = k === 'gorge' ? smoothstep(0.62, 1, t) : k === 'cleft' ? smoothstep(0.8, 1, t) : k === 'banks' ? (side < 0 ? smoothstep(0.75, 1, t) : smoothstep(0.1 + skew, 1, t)) : smoothstep(0.05, 1, t) ** 0.8;
    let h = -depth * (1 - Math.min(1, sides));
    // The island: a long rock ridge in the river's middle.
    if (k === 'island' && Math.abs(u) < w * 0.12) h += depth * 0.75 * (1 - smoothstep(0.02, 0.12, Math.abs(u) / w)) * (1 - smoothstep(30, 60, Math.abs(z)));
    const rough = k === 'gorge' || k === 'cleft' ? 2.2 * (1 - Math.abs(2 * sides - 1)) : 0.6;
    const calm = 0.35 + 0.65 * smoothstep(5, 16, Math.abs(z));
    return h + plateau + noise.n2(x / 40, z / 40) * 1.4 * calm + noise.n2(x / 9, z / 9) * rough + noise.n2(x / 140, z / 140) * 3 * smoothstep(60, 120, Math.abs(x));
  };
  return { kind: k, ground, water: dry ? null : -depth + (k === 'valley' || k === 'island' ? 2.4 : 1.4), reach: Math.max(110, w * 1.3) };
}

/** A site for a ruin round (0, 0): its front (the way in) faces −z, downhill on a hillside. */
export function ruinLand(seed: number, kind?: (typeof RUIN_LANDS)[number]): Land {
  const rng = new Rng(deriveSeed(seed, 'ruin-land')), noise = new Noise(deriveSeed(seed, 'ruin-noise'));
  const k = kind ?? rng.pick(RUIN_LANDS);
  const height = rng.range(10, 26), r = rng.range(90, 150), lean = rng.range(0.12, 0.22);
  const ground: Ground = (x, z) => {
    const d = Math.hypot(x, z);
    let h: number;
    switch (k) {
      case 'hilltop': h = height * Math.exp(-(d * d) / (r * r)); break;
      case 'hillside': h = z * lean + 3 * Math.sin(x / 60); break;
      case 'hollow': h = -height * 0.4 * Math.exp(-(d * d) / (r * r * 0.5)) + d * 0.04; break;
      case 'spur': h = height * Math.exp(-(x * x) / (r * r * 0.25)) * smoothstep(-r * 1.3, 0, z) + z * 0.03; break;
      default: h = 0;
    }
    return h + noise.n2(x / 50, z / 50) * 1.6 + noise.n2(x / 12, z / 12) * 0.35;
  };
  return { kind: k, ground, water: null, reach: 160 };
}
