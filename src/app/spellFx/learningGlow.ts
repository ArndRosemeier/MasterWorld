/**
 * A potion of learning drunk (D61, rule 11): the hero drinks, and pale ward-blue light wells up round them,
 * winds up the body in a narrowing spiral and gathers at the brow, where it flares once and sinks in. Drawn
 * with the spells' own bits (particles.ts) and shaders, so it builds no shader of its own (F3). It follows the
 * hero; play never stops. Pure; the spell view draws it.
 */
import { smoothstep } from '@futuremagic/core';
import { lit, type PuffSpec, type SpellBits, type Vec3 } from './particles';
import { HeroFx } from './heroFx';

/** How long it plays (s). */
export const GLOW_TIME = 3.6;
/** Ward light, glowing (linear, over 1): the colour of the warded-brass lines' blue. */
const WARD: Vec3 = [0.9, 2.3, 3.2];
const DEEP: Vec3 = [0.3, 0.9, 2.4];
const UP: Vec3 = [0, 1, 0];
/**
 * The motes winding up in two strands: how many, how wide the spiral starts (m), where the brow is over the feet
 * (m), how long each takes to climb and how long the last waits to set off (s).
 */
const MOTES = 24;
const WIDE = 0.75;
const BROW = 1.62;
const CLIMB = 1.4;
const STAGGER = 1.1;
/** Turns of the spiral on the way up. */
const TURNS = 1.5;

/** The height of a person the lengths below are made for (m); a hero of another height scales them (`size`: their height over this). */
export const PERSON = 1.7;

/** Where mote `i` is `t` s in, over `feet`: all follow one spiral path (two strands), one after another; null before it sets off and after it is in. */
export function moteAt(i: number, t: number, feet: Vec3, size = 1): Vec3 | null {
  const p = (t - (i / MOTES) * STAGGER) / CLIMB;
  if (p <= 0 || p >= 1) return null;
  const e = smoothstep(0, 1, p), a = e * TURNS * Math.PI * 2 + (i % 2) * Math.PI, r = (WIDE * (1 - e) ** 1.2 + 0.08) * size;
  return [feet[0] + Math.cos(a) * r, feet[1] + (0.1 + (BROW - 0.1) * e) * size, feet[2] + Math.sin(a) * r];
}

/** Light welling up off the ground round the hero. */
const WELL = { sprite: 'wisp', life: [0.7, 1.2], size: [0.16, 0.05], spread: WIDE, ring: true, speed: [0, 0.2], up: [0.4, 0.9], drag: 1.5, color: lit(WARD, 0.8), to: DEEP, swirl: 2 } as const;
/** When the motes are in and the light flares at the brow (s). */
const FLARE_AT = STAGGER + CLIMB + 0.1;

export class LearningGlow extends HeroFx {
  constructor() { super(GLOW_TIME, { spec: WELL, count: 30 }); }

  protected sized(spec: PuffSpec, size: number): PuffSpec { return { ...spec, spread: WIDE * size }; }

  protected lightAt(b: SpellBits, feet: Vec3, t: number, dt: number, size: number): void {
    const fade = t > GLOW_TIME * 0.75 ? Math.max(0, 1 - (t - GLOW_TIME * 0.75) / (GLOW_TIME * 0.25)) : 1;
    const brow: Vec3 = [feet[0], feet[1] + BROW * size, feet[2]];
    // A faint pool of light on the ground while the motes leave it.
    const pool = Math.max(0, 1 - t / 1.2);
    if (pool > 0) b.hold('glow', [feet[0], feet[1] + 0.04, feet[2]], WIDE * 2.6 * size, lit(DEEP, 0.25 * pool), { flat: UP });
    // The motes wind up the body, each a little after the one before, narrowing to the brow.
    for (let i = 0; i < MOTES; i++) {
      const at = moteAt(i, t, feet, size);
      if (!at) continue;
      const up = (at[1] - feet[1]) / (BROW * size);
      b.hold('spark', at, (0.08 + 0.05 * (1 - up)) * size, lit(WARD, 1.6), { seed: i / MOTES });
      b.hold('glow', at, 0.26 * size, lit(DEEP, 0.4), {});
    }
    // At the brow the light gathers, flares once when the motes are in, and sinks in.
    const gather = smoothstep(0.5, STAGGER + CLIMB, t) * fade;
    if (gather > 0) {
      b.hold('glow', brow, (0.35 + 0.35 * gather) * size, lit(WARD, 0.55 * gather), {});
      b.hold('ring', brow, 0.5 * (1 - 0.4 * gather) * size, lit(WARD, 0.6 * gather), { flat: UP, rot: t * 2.2, seed: 0.41 });
    }
    if (t >= FLARE_AT && t - dt < FLARE_AT) {
      b.burst({ sprite: 'spark', life: [0.4, 0.8], size: [0.08 * size, 0.02 * size], spread: 0.08 * size, speed: [0.4 * size, 1.1 * size], cone: Math.PI, up: [0.1, 0.5], drag: 2, color: lit(WARD, 1.8), to: DEEP, stretch: 0.05 }, 40, brow);
    }
  }
}
