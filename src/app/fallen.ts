/**
 * The hero's fall, seen through to its end (game/death.ts): the wards go dark, and some seconds on the hero wakes
 * (classic) or stays down for good (roguelike). It watches the hero, not any one fight, so a blow dealt by an
 * encounter that is not the one playing, a second fall while the first is still being carried off, and a fall
 * with no fight in play are all met the same way: no fall is left with the hero at no health and nobody to wake them.
 */
import type { Character } from '../game/character';
import type { FightCue, FightHost } from './encounter';
import type { FightHud } from './fightHud';
import type { Notes } from './notes';

/** Seconds the hero lies fallen before they wake. */
export const LIE_FOR = 3.2;

export class Fallen {
  /** Seconds since the fall (-1: on their feet). */
  private down = -1;
  /** The tale ended: they stay down. */
  private ended = false;

  constructor(
    private readonly host: Pick<FightHost, 'wake' | 'still'>,
    private readonly hud: Pick<FightHud, 'fallen'>,
    private readonly notes: Pick<Notes, 'say'>,
    private readonly cue: (c: FightCue) => void,
  ) {}

  /** Lying fallen now. */
  get lying(): boolean { return this.down >= 0 || this.ended; }

  /** Every frame: the hero seen to, fallen or not. */
  seeTo(dt: number, hero: Pick<Character, 'alive'>): void {
    if (this.ended) return;
    if (hero.alive) {
      // Up by other means: the stillness and the dark wards lift.
      if (this.down >= 0) this.rise();
      return;
    }
    if (this.down < 0) {
      this.down = 0;
      this.hud.fallen(true, 'You fall.');
      this.host.still(true);
    }
    this.down += dt;
    if (this.down <= LIE_FOR) return;
    const woke = this.host.wake();
    if (woke === null) { this.ended = true; return; }
    this.rise();
    this.cue({ kind: 'woke' });
    this.notes.say(woke, 8);
  }

  private rise(): void {
    this.down = -1;
    this.hud.fallen(false);
    this.host.still(false);
  }
}
