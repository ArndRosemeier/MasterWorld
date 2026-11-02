/**
 * A random hero in the setting's build (HeroBuildDef): the first hero and every roll of the dice start young
 * and fit, while the player may still pick any look by hand.
 */
import type { CharacterConfig } from '@actors/generator';
import type { HeroBuildDef } from '../../setting/contract';

/** Draws of the whole look before the age is set by hand (each draw fits with odds of about a third). */
const TRIES = 24;
/** The body values a build bounds besides the age. */
const SHAPE = ['weight', 'muscle', 'proportions'] as const;

/**
 * `roll` draws a whole random look from `random`. It is drawn again until the age fits (so hair and the like
 * still suit the age), then any shape value outside its range is drawn again inside it.
 */
export function inBuild(roll: () => CharacterConfig, build: HeroBuildDef | undefined, random: () => number): CharacterConfig {
  let look = roll();
  if (!build) return look;
  const age = build.ageYears;
  for (let i = 1; age && i < TRIES && !within(look.body.ageYears, age); i++) look = roll();
  const body = { ...look.body };
  if (age && !within(body.ageYears, age)) body.ageYears = Math.round(draw(age, random));
  for (const k of SHAPE) {
    const range = build[k];
    if (range && !within(body[k], range)) body[k] = draw(range, random);
  }
  // Only a plain human's height slider is free: the other peoples' comes from their lore height.
  if (build.height && look.race === 'human' && !look.race2 && !within(body.height, build.height)) body.height = draw(build.height, random);
  if (build.cupSize && body.gender < 0.5 && !within(body.cupSize, build.cupSize)) body.cupSize = draw(build.cupSize, random);
  const details = { ...look.details };
  for (const id in build.details) {
    const range = build.details[id];
    if (!within(details[id] ?? 0, range)) details[id] = draw(range, random);
  }
  return { ...look, body, details };
}

const within = (v: number, [lo, hi]: readonly [number, number]) => v >= lo && v <= hi;
const draw = ([lo, hi]: readonly [number, number], random: () => number) => lo + (hi - lo) * random();

/** Actors' height slider gives `scale * (lerp(1.03, 1.17, gender) + 1.08 * slider)` metres (its random heroes invert this). */
const SLIDER_SPAN = 1.08;
const sliderBase = (gender: number) => 1.03 + 0.14 * gender;

/** Whether a body of `height` is taller than the setting lets a hero stand. */
export const tooTall = (height: number, max: number | undefined): boolean => max !== undefined && height > max + 0.005;

/**
 * The body values that bring a hero `height` metres tall (config `body`) down to `max`, or null when it fits.
 * Estimated from Actors' height law (the people's scale follows from the measured height); call again with
 * the measured result until it fits.
 */
export function shorter(body: { height: number; gender: number }, height: number, max: number | undefined): { height: number } | null {
  if (max === undefined || !tooTall(height, max)) return null;
  const base = sliderBase(body.gender), scale = height / (base + SLIDER_SPAN * body.height);
  // A little under the limit, so rounding does not leave it over.
  const slider = (max - 0.01) / scale / SLIDER_SPAN - base / SLIDER_SPAN;
  return { height: Math.max(0, Math.min(body.height - 0.005, slider)) };
}
