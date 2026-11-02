/**
 * Things the townsfolk do on the spot that the pack has no clip for, cut out of the CMU motion-capture takes by
 * `npm run packs` (tools/packs/actors.mjs with findStill in tools/packs/cutLoop.mjs): the busiest stretch of `secs`
 * seconds whose ends meet within `seam` and that keeps within `travel` hip heights of where it began, turned to
 * face +z, on the spot, the seam closed. `upright` keeps out squats, sits and tumbles (a squatting dance floats
 * once its feet are set on the ground). Keep each entry on one line with plain quoted `clip` and `take` (the pack
 * step reads them).
 */
export interface MoveCut {
  clip: string;
  take: string;
  secs: readonly [number, number];
  seam: number;
  travel: number;
  /** Only stretches that keep upright: hips at most `hips` hip heights below standing, the chest within `tilt` radians. */
  upright: { hips: number; tilt: number };
}

export const MOVE_CUTS: readonly MoveCut[] = [
  // A village round dance (the chicken dance: flap, wiggle, clap), danced by two people, so a ring is not all in step.
  { clip: 'dance folk', take: 'cmu 20_01', secs: [1.5, 4], seam: 0.12, travel: 1.2, upright: { hips: 0.1, tilt: 0.4 } },
  { clip: 'dance folk 2', take: 'cmu 21_01', secs: [1.5, 4], seam: 0.2, travel: 1.2, upright: { hips: 0.1, tilt: 0.4 } },
  // A good laugh, and a happy bounce (played through once).
  { clip: 'laugh', take: 'cmu 13_15', secs: [1.5, 4], seam: 0.2, travel: 1, upright: { hips: 0.1, tilt: 0.4 } },
  { clip: 'cheer', take: 'cmu 80_43', secs: [1.5, 4], seam: 0.08, travel: 1, upright: { hips: 0.1, tilt: 0.4 } },
  // A sailor on a line: leaning back against its pull, and coiling a rope down (S3, the crew at work).
  { clip: 'haul line', take: 'cmu 19_03', secs: [1.2, 3], seam: 0.2, travel: 1, upright: { hips: 0.5, tilt: 1 } },
  { clip: 'coil rope', take: 'cmu 62_21', secs: [1.2, 3], seam: 0.2, travel: 1, upright: { hips: 0.25, tilt: 0.6 } },
];

/** The cut clips' names (shipped beside PACK_CLIPS). */
export const MOVE_CLIPS = MOVE_CUTS.map((m) => m.clip);
