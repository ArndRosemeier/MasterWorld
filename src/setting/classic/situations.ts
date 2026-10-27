/**
 * The classic setting's situations (D52, C10): what the hero walks into and sees. A cry is the rare urgent
 * line in a speech bubble, called out once the hero can see what it is about.
 */
import type { SituationDef } from '../contract';

export const situations: readonly SituationDef[] = [
  { id: 'hurt-traveller', kind: 'hurt-traveller', chance: 0.5, seen: 30, cry: 'Help! Over here, please!' },
  { id: 'paddock-wolves', kind: 'paddock-wolves', encounter: 'wolves', hours: [18.5, 21], every: 4, seen: 50, cry: 'Wolves! Wolves at the paddock!' },
];
