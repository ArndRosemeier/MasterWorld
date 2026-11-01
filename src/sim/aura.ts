/**
 * The aura round a creature in a fight (replaces the health bars): its colour tells its health, a faint one for
 * everything close, a strong one for the hero's target. Pure: the look of it (render/aura/AuraView.ts) draws
 * what this works out.
 */
import type { CreatureDef } from '../setting/contract';

/** Every living creature within this many metres (m) of the hero wears a faint aura while a fight is on. */
export const AURA_RANGE = 30;
/** Past this (m) the faint aura thins out to nothing at AURA_RANGE. */
const AURA_THIN = 24;
/** Faint and strong strength (0..1, what the shader scales its light by). */
export const FAINT = 0.5;
export const STRONG = 1;

/** Linear light by the share of health left: green, yellow-green, amber, orange, red. */
const RAMP: readonly (readonly [number, number, number, number])[] = [
  [1, 0.22, 1, 0.28],
  [0.7, 0.6, 0.95, 0.15],
  [0.5, 1, 0.72, 0.08],
  [0.3, 1, 0.38, 0.05],
  [0.12, 1, 0.03, 0.02],
];

/**
 * The aura's colour at `frac` of health (0..1), and how bright it burns: a weaker creature is dimmer too, so
 * the health reads without the hue alone (green and red are hard to tell apart for some eyes).
 */
export function healthLook(frac: number): { readonly r: number; readonly g: number; readonly b: number; readonly dim: number } {
  const f = Math.min(1, Math.max(0, frac));
  let i = 0;
  while (i < RAMP.length - 2 && f < RAMP[i + 1]![0]) i++;
  const a = RAMP[i]!, b = RAMP[i + 1]!;
  const t = Math.min(1, Math.max(0, (a[0] - f) / (a[0] - b[0])));
  return { r: a[1] + (b[1] - a[1]) * t, g: a[2] + (b[2] - a[2]) * t, b: a[3] + (b[3] - a[3]) * t, dim: 0.55 + 0.45 * f };
}

/** The ellipse of light behind a creature: half width, half height, and how high its middle stands (m). */
export function auraSize(def: CreatureDef): { readonly halfW: number; readonly halfH: number; readonly lift: number } {
  const b = def.body;
  if (b.kind === 'humanoid') return { halfW: b.height * 0.55, halfH: b.height * 0.66, lift: b.height * 0.5 };
  // Animals are seen from the side: long, low.
  const l = Math.max(0.25, b.length);
  return { halfW: Math.max(0.3, l * 0.75), halfH: Math.max(0.25, l * 0.5), lift: Math.max(0.12, l * 0.28) };
}

/** How much of the faint aura shows at `d` metres from the hero (1 close, thinning past AURA_THIN, none at AURA_RANGE). */
export function auraReach(d: number): number {
  return d <= AURA_THIN ? 1 : d >= AURA_RANGE ? 0 : (AURA_RANGE - d) / (AURA_RANGE - AURA_THIN);
}
