/**
 * The classic setting's situations (D52, C10): what the hero walks into and sees. A cry is the rare urgent
 * line in a speech bubble, called out once the hero can see what it is about.
 */
import type { SituationDef } from '../contract';

export const situations: readonly SituationDef[] = [
  { id: 'hurt-traveller', kind: 'hurt-traveller', chance: 0.5, seen: 30, cry: 'Help! Over here, please!', tend: { topic: 'Let me see to that.', line: 'My ankle. I went over on a stone, and I cannot put weight on it.' } },
  { id: 'paddock-wolves', kind: 'paddock-wolves', encounter: 'wolves', hours: [18.5, 21], every: 4, seen: 50, cry: 'Wolves! Wolves at the paddock!' },
  { id: 'raid-smoke', kind: 'raid-smoke', lasts: 10, seen: 50, cry: 'They fired the barn and drove off the beasts!' },
  // No cry: a farmer after a beast is no emergency; the hero sees them run.
  { id: 'refugees', kind: 'refugees', seen: 30, cry: 'They took our home! We got out with nothing!' },
  { id: 'stray-beast', kind: 'stray-beast', hours: [8, 17], every: 3, lasts: 1.5, seen: 40 },
];
