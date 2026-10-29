/**
 * When the hero gains a level (plan G3, D58): the ring of light always rises and the chime sounds; the hero makes
 * a short gesture (hands raised to the light) only when not fighting, and nothing ever stops play. Watches the
 * level each frame, so every way of earning experience (a fight, a deed, a find) is celebrated the same. Pure.
 */

/** What to play for a level gained. */
export interface LevelCheer {
  /** The new level, and how many came at once (one ring for all). */
  readonly level: number;
  readonly gained: number;
  /** The hero's gesture: only out of a fight (and not while riding, swimming or already acting). */
  readonly gesture: boolean;
}

/** The gesture's action id and length (s): ACTION_CLIPS plays it. */
export const CHEER = { id: 'level_up', dur: 1.6 } as const;

export class LevelWatch {
  constructor(private level: number) {}

  /** Each frame: the level now, and whether the hero is free to gesture. A level gained gives what to play. */
  see(level: number, free: boolean): LevelCheer | null {
    if (level <= this.level) { this.level = level; return null; }
    const gained = level - this.level;
    this.level = level;
    return { level, gained, gesture: free };
  }
}
