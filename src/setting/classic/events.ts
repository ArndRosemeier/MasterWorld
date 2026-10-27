/**
 * Story events in the classic setting (plan 4.2, C6): what the world does when the hero leaves it be.
 */
import type { StoryEventDef } from '../contract';

export const events: readonly StoryEventDef[] = [
  {
    id: 'dwellers-out', kind: 'spill', after: 30, cooldown: 48, count: [2, 3], gather: 1.5,
    words: {
      title: 'Out of {place}',
      news: 'Word runs through {town}: {creatures} have come up out of {place} and roam the land {dir} of the town.',
      note: 'Nobody went down after them, so the {creatures} came up out of {place}. They roam {dir} of the town now, and folk want them gone.',
      done: 'The {creatures} that came out of {place} are dead. {town} will sleep easier.',
    },
  },
];
