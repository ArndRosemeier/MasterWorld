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
