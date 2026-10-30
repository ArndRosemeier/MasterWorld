/**
 * Things the townsfolk do on the spot that the pack has no clip for, cut out of the CMU motion-capture takes by
 * `npm run packs` (tools/packs/actors.mjs with findStill in tools/packs/cutLoop.mjs): the busiest stretch of `secs`
 * seconds whose ends meet within `seam` and that keeps within `travel` hip heights of where it began, turned to
 * face +z, on the spot, the seam closed. Keep each entry on one line with plain quoted `clip` and `take` (the pack
 * step reads them).
 */
export interface MoveCut {
  clip: string;
  take: string;
  secs: readonly [number, number];
  seam: number;
  travel: number;
}

export const MOVE_CUTS: readonly MoveCut[] = [
  // A folk dance with high kicks and stamps (two takes of it, so a ring is not all in step).
  { clip: 'dance folk', take: 'cmu 90_30', secs: [1.5, 4], seam: 0.12, travel: 1.5 },
  { clip: 'dance stamp', take: 'cmu 90_31', secs: [1.5, 4], seam: 0.12, travel: 1.5 },
  // A good laugh, and arms up for joy (played through once).
  { clip: 'laugh', take: 'cmu 80_44', secs: [1.5, 4], seam: 0.25, travel: 1 },
  { clip: 'cheer', take: 'cmu 79_69', secs: [1.5, 4], seam: 0.25, travel: 1 },
];

/** The cut clips' names (shipped beside PACK_CLIPS). */
export const MOVE_CLIPS = MOVE_CUTS.map((m) => m.clip);
