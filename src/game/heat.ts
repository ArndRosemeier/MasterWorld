/**
 * Lava (K7d): a hero standing in it burns, fast. Like drowning and falls, the land never kills outright: health goes to
 * the last point and no lower, so the way out is always there, and a hero who walked in is not stuck at the last
 * point (they walk out burnt). Pure.
 */

/** Health lost per second standing in lava, as a share of the most the hero has. */
export const LAVA_BURN = 0.3;
/** The lava's surface counts as under the feet when they are no higher over it than this (m): a step across a flow is a wade. */
export const LAVA_REACH = 0.6;

/** Whether feet at `y` stand in lava whose surface is at `lava` (null: no lava here). */
export function inLava(feet: number, lava: number | null): boolean {
  return lava !== null && feet < lava + LAVA_REACH;
}

/** The health lost in `dt` seconds in lava (0 out of it); `most` the hero's most health. */
export function lavaBurn(dt: number, burning: boolean, most: number): number {
  return burning ? dt * LAVA_BURN * most : 0;
}
