/**
 * Story events in the classic setting (plan 4.2, C6): what the world does when the hero leaves it be.
 */
import type { StoryEventDef } from '../contract';

export const events: readonly StoryEventDef[] = [
  {
    id: 'dwellers-out', kind: 'spill', after: 30, cooldown: 48, count: [2, 3], gather: 1.5,
    words: {
      title: 'Out of {place}',
      cry: '{creatures} came up out of {place}! They are loose {dir} of town!',
      note: 'Nobody went down after them, so the {creatures} came up out of {place}. They roam {dir} of the town now, and folk want them gone.',
      done: 'The {creatures} that came out of {place} are dead. {town} will sleep easier.',
      told: '{creatures} came up out of {place} and roam the land {dir} of the town',
      faded: 'The {creatures} went back down into {place} in the end. Nobody has seen them since, but nobody goes near it either.',
    },
    fades: 72,
  },
  {
    id: 'farm-raid', kind: 'raid', by: 'bandits', after: 36, cooldown: 48, count: [2, 3], gather: 1.5,
    words: {
      title: 'The {animals} of {place}',
      cry: '{creatures} hit {place} in the night! They fired the barn and took the {animals}!',
      note: 'Nobody went after the {creatures} by the road, so they raided {place} and drove off its {animals}. They hold the beasts {dir} of the town. Beat them and the {animals} can go home.',
      done: 'The {creatures} who raided {place} are beaten, and its {animals} are home again.',
      told: '{creatures} came down on {place} in the night, fired the barn and drove off the {animals}; they hold them {dir} of here',
      faded: 'The {creatures} moved on with the {animals} of {place}. Nobody went after them, and the beasts are gone for good.',
    },
    fades: 60,
  },
  {
    id: 'waystation-taken', kind: 'take', by: 'bandits', takes: 'waystation', reach: 3500, lair: 'hideout', after: 48, cooldown: 48, count: [2, 3], gather: 1.5,
    words: {
      title: '{place}',
      cry: '{creatures} took {place}! Its folk came running with nothing!',
      note: 'Nobody went after the {creatures} by the road, so they took {place}. They hold it now and its folk have fled. Beat them and the folk can go home; the rest of the band lies up somewhere near it.',
      done: 'The {creatures} who held {place} are beaten. Its folk can go home.',
      told: '{creatures} took {place} on the road {dir} of here, and its folk ran for their lives',
    },
  },
];
