/**
 * A light that plays once round the hero for a while (the level ring, G3; a potion of learning's glow, D61):
 * kindled at their feet with a first burst of sparks off the ground, then drawn every frame from there (they
 * may walk or fight on: play never stops) until its time is up. Each kind draws its own look with the spells'
 * bits (particles.ts). Pure.
 */
import type { PuffSpec, SpellBits, Vec3 } from './particles';

/** What it throws off the ground when it begins: the bits and how many. */
export interface HeroFxStart { readonly spec: PuffSpec; readonly count: number }

export abstract class HeroFx {
  private age: number;

  constructor(private readonly time: number, private readonly start: HeroFxStart) { this.age = time; }

  /** Playing now. */
  get on(): boolean { return this.age < this.time; }

  /** Begin it (again, if it was still playing: two at once play one). `size`: how big the hero is, as a share of a person 1.7 m tall (a kind that ignores it keeps its own size). */
  kindle(b: SpellBits, feet: Vec3, size = 1): void {
    this.age = 0;
    b.burst(this.sized(this.start.spec, size), this.start.count, [feet[0], feet[1] + 0.05, feet[2]]);
  }

  /** What it throws at the start, made for a hero of this size (as given). */
  protected sized(spec: PuffSpec, _size: number): PuffSpec { return spec; }

  /** Every frame while it plays: drawn round `feet`. */
  rise(b: SpellBits, feet: Vec3, dt: number, size = 1): void {
    if (!this.on) return;
    this.age = Math.min(this.time, this.age + dt);
    this.lightAt(b, feet, this.age, dt, size);
  }

  /** This frame's look, `t` s after it began (`dt`: since the last frame). */
  protected abstract lightAt(b: SpellBits, feet: Vec3, t: number, dt: number, size: number): void;
}
