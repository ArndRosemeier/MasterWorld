/**
 * Good days in the classic setting's towns (C11): a feast for the one who helped them, and market days.
 */
import type { FestivityDef } from '../contract';

export const festivities: readonly FestivityDef[] = [
  {
    id: 'feast', kind: 'feast', hours: [18, 22],
    words: {
      title: 'A feast in {town}',
      news: '{town} holds a feast at the market this evening, for the one who cleared {place}.',
      told: 'there is a feast at the market this evening, for the one who cleared {place}',
      done: 'we feasted the one who cleared {place}; the whole town was out',
    },
  },
  {
    id: 'market-day', kind: 'market', hours: [9, 13], every: 6,
    words: {
      title: 'Market day in {town}',
      news: 'It is market day in {town}: the whole town is out at the market this morning.',
      told: 'it is market day, the whole town comes to the market in the morning',
      done: 'the last market day was a good one',
    },
  },
];
