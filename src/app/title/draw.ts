/**
 * What this start's title shows: the hour, the weather, the painted still, the fly-over route and the
 * order of the rumours, all drawn from a seed (the date plus a start counter), so each start differs and
 * the same date and counter always look the same (plan D46, no Math.random). Pure: no DOM, no three.js.
 */
import { Rng, deriveSeed, hashString } from '@futuremagic/core';

/** The painted stills in public/title/ (one per mood). */
export type Still = 'dawn' | 'evening' | 'storm';

export interface TitleDraw {
  readonly seed: number;
  /** Game hour, 0..24. */
  readonly hour: number;
  /** A weather kind (world/weather WEATHER_KINDS). */
  readonly weather: 'clear' | 'fair' | 'rain' | 'storm';
  readonly still: Still;
  /** Orbit direction (+1 or -1) and where on the orbit the flight starts (radians). */
  readonly turn: 1 | -1;
  readonly angle: number;
  /** The painted still mirrored (more variety from three pictures). */
  readonly mirror: boolean;
  /** A giant strides past the town in this fly-over (now and then; the rumour is true). */
  readonly giant: boolean;
}

interface Mood {
  readonly weight: number;
  readonly hours: readonly [number, number];
  readonly weathers: readonly TitleDraw['weather'][];
  readonly still: Still;
}

const MOODS: readonly Mood[] = [
  { weight: 0.35, hours: [7, 8.2], weathers: ['clear', 'fair'], still: 'dawn' },
  { weight: 0.15, hours: [9, 11.5], weathers: ['fair', 'clear'], still: 'dawn' },
  { weight: 0.3, hours: [16.8, 18], weathers: ['clear', 'fair'], still: 'evening' },
  { weight: 0.2, hours: [12.5, 16], weathers: ['storm', 'rain'], still: 'storm' },
];

/** How often a fly-over has the giant. */
export const GIANT_CHANCE = 0.3;

/** The seed of a start: the day plus how many times the title has been shown before. */
export function titleSeed(day: string, counter: number): number {
  return deriveSeed(hashString(day), 'title', counter);
}

export function drawTitle(seed: number): TitleDraw {
  const rng = new Rng(deriveSeed(seed, 'mood'));
  const mood = rng.weighted(MOODS, (m) => m.weight);
  return {
    seed,
    hour: rng.range(mood.hours[0], mood.hours[1]),
    weather: rng.pick(mood.weathers),
    still: mood.still,
    turn: rng.chance(0.5) ? 1 : -1,
    angle: rng.range(0, Math.PI * 2),
    mirror: rng.chance(0.5),
    // Its own stream, so the rest of a start's draw stays as it was.
    giant: new Rng(deriveSeed(seed, 'giant')).chance(GIANT_CHANCE),
  };
}

/** The day as `YYYY-MM-DD` (local time). */
export function dayOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A seeded shuffle, leaving `list` as it is. */
export function shuffled<T>(list: readonly T[], seed: number): T[] {
  return new Rng(seed).shuffle([...list]);
}
