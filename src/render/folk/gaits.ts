/**
 * How the townsfolk walk (Arnd 2026-10-30: more walking styles). Besides the pack's own walk, loops cut out of the
 * CMU motion-capture takes in the Actors pack (`npm run packs`: tools/packs/actors.mjs with tools/packs/cutLoop.mjs):
 * the old shuffle or stoop, a heavy tread, an upright stride, a stroll, a child's quick step. `GAIT_CUTS` is what the
 * pack step cuts: keep each entry on one line with plain quoted `clip` and `take`. `pace` is the ground speed (m/s)
 * the loop shows at its own speed, as the pack step measures it (it says when one is off).
 */
import { Rng, deriveSeed } from '@futuremagic/core';
import { OLD_AGE, type Person } from '../../sim/people';
import { PACE } from '../hero/clips';

export interface GaitCut {
  /** The clip's name in the game. */
  clip: string;
  /** The CMU take it is cut from (Actors' clip library name). */
  take: string;
  /** Ground speed at the loop's own speed (m/s). */
  pace: number;
}

export const GAIT_CUTS: readonly GaitCut[] = [
  { clip: 'walk old', take: 'cmu 105_21', pace: 0.68 },
  { clip: 'walk hobble', take: 'cmu 17_05', pace: 0.98 },
  { clip: 'walk stooped', take: 'cmu 136_01', pace: 1.33 },
  { clip: 'walk heavy', take: 'cmu 17_08', pace: 0.88 },
  { clip: 'walk proud', take: 'cmu 82_09', pace: 1.25 },
  { clip: 'walk stroll', take: 'cmu 104_35', pace: 1.23 },
  { clip: 'walk easy', take: 'cmu 105_29', pace: 1.32 },
  { clip: 'walk quick', take: 'cmu 105_22', pace: 1.73 },
];

/** The cut clips' names (shipped beside PACK_CLIPS). */
export const GAIT_CLIPS = GAIT_CUTS.map((g) => g.clip);

/** Ground speed (m/s) of every walk at its own speed: the pack's walk and the cuts. */
export const GAIT_PACE: Readonly<Record<string, number>> = { walk: PACE.walk, ...Object.fromEntries(GAIT_CUTS.map((g) => [g.clip, g.pace])) };

/** Who walks which ways (each person one of them, from their seed). */
const OLD = ['walk old', 'walk hobble', 'walk stooped'];
const CHILD = ['walk quick', 'walk'];
const UPRIGHT = ['walk proud', 'walk easy'];
const HEAVY = ['walk heavy', 'walk'];
const ANYONE = ['walk', 'walk easy', 'walk stroll', 'walk proud'];

/** The walk `p` is seen with. */
export function gaitOf(p: Person): string {
  const r = new Rng(deriveSeed(p.seed, 'gait'));
  if (p.race !== 'elf' && p.age >= OLD_AGE && p.role !== 'child') return r.pick(OLD);
  if (p.role === 'child') return r.pick(CHILD);
  if (p.dress === 'fighter' || p.role === 'trader' || p.role === 'keeper') return r.pick(UPRIGHT);
  if (p.race === 'dwarf' || p.trade === 'smith') return r.pick(HEAVY);
  return r.pick(ANYONE);
}

/** How much faster than its own a walk plays for someone walking at `speed` m/s (kept in bounds, so it never looks frantic). */
export function gaitScale(clip: string, speed: number): number {
  const pace = GAIT_PACE[clip];
  return pace ? Math.min(1.35, Math.max(0.7, speed / pace)) : 1;
}
