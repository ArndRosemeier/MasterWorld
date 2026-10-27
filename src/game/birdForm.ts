/**
 * Bird form (plan 10, D49): a taught ability by which the hero takes the shape of a bird and flies. Not a man
 * flying: the hero kneels, the change takes its time (the setting's `shape.change`, 15 s in the classic one) and
 * cannot be made or finished in a fight; turning back is shorter and needs the bird on the ground (using the
 * ability again in the air glides it down first). Pure: `Shapeshift` the steps of the change, `BirdFlight` how
 * the bird moves (walks, takes off, flaps, glides, dives, lands), both stepped by the game each frame.
 */
import type { AbilityDef, ShapeDef } from '../setting/contract';

/** Where the change stands: the hero as themself, changing, a bird, changing back. */
export type FormPhase = 'self' | 'changing' | 'bird' | 'returning';

/** What around the hero bears on the change this frame. */
export interface ShiftAround {
  /** Something fights the hero (or the hero fights). */
  readonly fighting: boolean;
  readonly riding?: boolean;
  readonly swimming?: boolean;
  /** Under a roof or below ground: no sky to fly in. */
  readonly roofed?: boolean;
  /** The bird stands on the ground (it can turn back). */
  readonly grounded?: boolean;
}

/** A step of the change the game shows or says. */
export type ShiftEvent = 'began' | 'became' | 'landing' | 'returning' | 'returned' | 'broken' | 'stopped';

export class Shapeshift {
  phase: FormPhase = 'self';
  /** Seconds into the change (or the change back). */
  t = 0;
  /** Seconds before it can be used again (after turning back). */
  cooling = 0;
  /** In the air, asked to turn back: the bird is gliding down to land. */
  landing = false;
  readonly shape: ShapeDef;

  constructor(readonly ability: AbilityDef) {
    if (!ability.shape) throw new Error(`${ability.id} is not a change of shape`);
    this.shape = ability.shape;
  }

  /** 0 as themself, 1 as the bird, between while changing either way. */
  get progress(): number {
    switch (this.phase) {
      case 'self': return 0;
      case 'bird': return 1;
      case 'changing': return Math.min(1, this.t / this.shape.change);
      case 'returning': return Math.max(0, 1 - this.t / this.shape.back);
    }
  }

  /** The hero's own body is not the one being played (changing, a bird, changing back). */
  get busy(): boolean { return this.phase !== 'self'; }

  /**
   * The ability asked for (from the bar): begin the change, call it off while it is under way, or turn back (landing
   * first). A line why not, or null; `events` gets what happened.
   */
  callOn(around: ShiftAround, events: ShiftEvent[] = []): string | null {
    switch (this.phase) {
      case 'self': {
        if (this.cooling > 0) return `${this.ability.name} is not ready yet.`;
        if (around.fighting) return 'Not while you fight.';
        if (around.riding) return 'Get off your horse first.';
        if (around.swimming) return 'Not in the water.';
        if (around.roofed) return 'There is no sky here to fly in.';
        this.phase = 'changing';
        this.t = 0;
        events.push('began');
        return null;
      }
      case 'changing':
        // Called off: back to themself at once (it had not taken hold yet).
        this.phase = 'self';
        this.t = 0;
        events.push('stopped');
        return null;
      case 'bird':
        if (around.grounded) this.turnBack(events);
        else if (!this.landing) { this.landing = true; events.push('landing'); }
        return null;
      case 'returning':
        return null;
    }
  }

  /** A frame: the change goes on (a fight breaks it), a landing bird turns back. */
  tickChange(dt: number, around: ShiftAround): ShiftEvent[] {
    const out: ShiftEvent[] = [];
    this.cooling = Math.max(0, this.cooling - dt);
    if (this.phase === 'changing') {
      if (around.fighting) { this.phase = 'self'; this.t = 0; out.push('broken'); return out; }
      this.t += dt;
      if (this.t >= this.shape.change) { this.phase = 'bird'; this.t = 0; this.landing = false; out.push('became'); }
    } else if (this.phase === 'bird') {
      if (this.landing && around.grounded) this.turnBack(out);
    } else if (this.phase === 'returning') {
      this.t += dt;
      if (this.t >= this.shape.back) { this.phase = 'self'; this.t = 0; this.cooling = this.ability.cooldown; out.push('returned'); }
    }
    return out;
  }

  private turnBack(out: ShiftEvent[]): void {
    this.phase = 'returning';
    this.t = 0;
    this.landing = false;
    out.push('returning');
  }
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** What the change shows at progress `p` (0 the hero, 1 the bird). */
export function changeLook(p: number): { hero: number; bird: number; glow: number; radius: number; height: number; pace: number; burst: number } {
  // The feathers gather, wheel ever faster and closer as the hero sinks into them, then burst outward and fade.
  const gather = smooth(0.02, 0.2, p), burst = smooth(0.86, 1, p);
  return {
    hero: 1 - smooth(0.15, 0.82, p) ** 1.5,
    bird: smooth(0.74, 0.97, p),
    glow: gather * (1 - burst),
    radius: (1.1 - 0.7 * smooth(0.2, 0.82, p)) + burst * 2.2,
    height: 2 - 1.4 * smooth(0.3, 0.85, p),
    pace: smooth(0.1, 0.85, p),
    burst,
  };
}

