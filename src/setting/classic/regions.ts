/**
 * What the land beyond the start holds in the classic setting (plan 5.5, 12.1): mostly plain country, now
 * and then a hamlet of a few farms, a camp in the woods, the ruins of the old realm from before the
 * Fading, or a field of sealed barrows. Places lie farther out the bigger they are.
 */
import type { RegionsDef } from '../contract';

const FARMLAND = ['meadow', 'forest', 'steppe', 'heath'];

export const regions: RegionsDef = {
  country: 'country',
  fills: [
    { id: 'country', name: 'open country', level: 2, weight: 6, place: 'none' },
    { id: 'hamlet', name: 'a hamlet', level: 1, weight: 2, place: 'hamlet', radius: 34, biomes: FARMLAND, ring: [1500], apart: 2500 },
    { id: 'camp', name: 'a camp', level: 0, weight: 2, place: 'camp', radius: 14, biomes: ['meadow', 'forest', 'taiga', 'heath', 'steppe'], ring: [900], apart: 1500 },
    { id: 'ruin', name: 'ruins of the old realm', level: 0, weight: 2, place: 'ruin', radius: 22, ring: [1100], apart: 1400 },
    { id: 'barrows', name: 'a barrow field', level: 1, weight: 1.2, place: 'barrows', radius: 45, biomes: ['meadow', 'heath', 'steppe', 'tundra', 'forest'], ring: [1800], apart: 3000 },
  ],
};
