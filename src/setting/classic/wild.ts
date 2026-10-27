/**
 * The land around the town in the classic setting (plan 9.3, 12.1): deer in the meadows, boar under the
 * oaks, a wolf pack deeper in the woods, a few bandits by a road out. Near the town, so nothing is too
 * strong for a fresh hero (D29): farther lands hold more.
 */
import type { WildDef } from '../contract';

export const wild: readonly WildDef[] = [
  { id: 'deer', encounter: 'deer', habitat: 'open', ring: [250, 1400], range: 60, groups: 3 },
  { id: 'boar', encounter: 'boar', habitat: 'wood', ring: [350, 1200], range: 45, groups: 2 },
  { id: 'wolves', encounter: 'wolves', habitat: 'wood', ring: [700, 1600], range: 80, groups: 1 },
  { id: 'bandits', encounter: 'highwaymen', habitat: 'road', ring: [450, 1000], range: 30, groups: 1 },
];
