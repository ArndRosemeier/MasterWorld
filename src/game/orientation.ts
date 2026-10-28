/**
 * Orientation (plan 11.7, D35): how exactly the hero knows where they are on their map. A novice sees a
 * vague area that holds them somewhere inside it; it shrinks as the skill grows, an arrow for the way they
 * face appears and steadies, and at mastery the map shows the exact arrow. The skill is taught at the
 * Wayfarers' Lodge (D54: nothing rises by use). Pure: the guess drifts with seeded noise over the land, so it
 * stays put while the hero stands still and does not change by opening the map again.
 */
import { Noise, clamp, deriveSeed } from '@futuremagic/core';
import type { Character } from './character';

/** Where the map shows the hero. */
export interface Bearing {
  /** The middle of the area the hero believes they are in. */
  readonly x: number;
  readonly z: number;
  /** Its radius in metres (0: the exact place). The hero is always inside it. */
  readonly radius: number;
  /** The way they believe they face (yaw as the walker's), or null while they cannot tell. */
  readonly yaw: number | null;
}

/** The skill the guess starts from (a fresh hero) and where it is exact. */
export const NOVICE = 10;
export const MASTER = 80;
/** The area's radius for a novice (m), and the arrow's error when it first appears (radians). */
const WIDEST = 90;
const ARROW_FROM = 0.3;
const TURN = 0.7;
/** How far the guess drifts over the land: one swing every this many metres. */
const DRIFT = 140;

/** 0 for a novice, 1 at mastery. */
export function mastery(skill: number): number {
  return clamp((skill - NOVICE) / (MASTER - NOVICE), 0, 1);
}

export class Orientation {
  private readonly noise: Noise;

  constructor(seed: number, private readonly hero: Character) {
    this.noise = new Noise(deriveSeed(seed, 'orientation'));
  }

  /** Where the map shows the hero, standing at (x, z) facing `yaw`. */
  bearing(x: number, z: number, yaw: number): Bearing {
    const m = mastery(this.hero.skill('orientation'));
    const radius = WIDEST * (1 - m) ** 1.5;
    if (radius < 1.5) return { x, z, radius: 0, yaw };
    // The guess sits off the truth by at most 0.7 of the radius, so the truth is always inside it.
    const nx = this.noise.n2(x / DRIFT, z / DRIFT), nz = this.noise.n2(x / DRIFT + 31.7, z / DRIFT - 17.3);
    const off = radius * 0.7 / Math.max(1, Math.hypot(nx, nz));
    const facing = m < ARROW_FROM ? null : yaw + TURN * (1 - m) / (1 - ARROW_FROM) * this.noise.n2(x / DRIFT - 9.1, z / DRIFT + 5.3);
    return { x: x + nx * off, z: z + nz * off, radius, yaw: facing };
  }
}
