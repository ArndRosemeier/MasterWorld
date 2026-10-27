/**
 * Sitting down to rest: the hero sits on the ground (the rest key, X by default, or the bar's rest socket) and
 * health, mana and stamina come back faster (Character.recover). Never in a fight, never swimming, riding or
 * flying; moving, a fight or a wound stands the hero up again. Pure: main.ts feeds it what the hero does.
 */
import type { Character } from './character';

/** What the hero is doing this frame, as far as resting cares. */
export interface RestWatch {
  /** Walking, running, jumping, falling or swimming (anything but standing still on the ground). */
  readonly moving: boolean;
  /** Something fights the hero. */
  readonly fighting: boolean;
  /** On their own feet on the ground: not riding, not flying, not a bird, not in the water. */
  readonly afoot: boolean;
}

/** Why resting ended (null: it goes on). */
export type RestEnd = 'moved' | 'fight' | 'hurt' | 'fallen' | null;

export class Rest {
  /** Health when last looked at: less means a wound. */
  private health = 0;

  constructor(private readonly hero: Character) {}

  get sitting(): boolean { return this.hero.resting; }

  /** Sit down (or stand up when sitting). A line why not, or null. */
  toggle(w: RestWatch): string | null {
    if (this.sitting) { this.stand(); return null; }
    if (!this.hero.alive) return null;
    if (w.fighting) return 'There is no rest in a fight.';
    if (!w.afoot) return 'You cannot rest here.';
    this.hero.resting = true;
    this.health = this.hero.health;
    return null;
  }

  stand(): void { this.hero.resting = false; }

  /** One frame while sitting: stands up and says why when the hero moves, is attacked, hurt or falls. */
  watch(w: RestWatch): RestEnd {
    if (!this.sitting) return null;
    const hero = this.hero;
    const end: RestEnd = !hero.alive ? 'fallen' : w.fighting ? 'fight' : hero.health < this.health ? 'hurt' : w.moving || !w.afoot ? 'moved' : null;
    this.health = hero.health;
    if (end) this.stand();
    return end;
  }
}
