/**
 * Breath under water (S5, plan 10, D60): the hero holds it while their head is under, and wins it back at the air.
 * Out of it they drown: health goes, and they come up whatever is pressed (the body is seen rising, rule 11) until
 * they catch their breath. Water breathing (a spell, a draught: an effect with gills) lets them stay under while it
 * lasts. Pure.
 */

/** How long a breath lasts under water (s), and how fast it comes back at the air (s of breath per s). */
export const BREATH = 40, CATCH = 8;
/** A drowning hero's health lost per second, as a share of the most they have; never below the last point. */
export const DROWN = 0.06;

export class Breath {
  /** Seconds of breath left. */
  left = BREATH;

  /** Out of breath (drowning): they come up. */
  get gasping(): boolean {
    return this.left <= 0;
  }

  /** How full (0..1). */
  get share(): number {
    return this.left / BREATH;
  }

  /** One step: `under` (the head is under water), `gills` (breathing water), `most` (the hero's most health). The health lost. */
  breathe(dt: number, under: boolean, gills: boolean, most: number): number {
    if (!under || gills) {
      this.left = Math.min(BREATH, this.left + CATCH * dt);
      return 0;
    }
    const was = this.left;
    this.left = Math.max(0, this.left - dt);
    // Only the time spent with none left drowns.
    return Math.max(0, dt - was) * DROWN * most;
  }
}
