/**
 * The classic setting's landforms (D55, plan 5.9): the small shapes of the land and each biome's mix of them.
 * Sizes in metres; the rules that shape them are in world/landforms.ts.
 */
import type { LandformDef, LandformMix } from '../contract';

export const landforms: readonly LandformDef[] = [
  { id: 'knoll', shape: 'knoll', size: [80, 260], height: [5, 16] },
  { id: 'tor', shape: 'tor', size: [80, 220], height: [10, 26], rock: 1 },
  { id: 'dell', shape: 'dell', size: [50, 160], height: [3, 8], pond: 0.35 },
  { id: 'sinkhole', shape: 'sinkhole', size: [16, 40], height: [4, 10], rock: 0.3 },
  { id: 'gully', shape: 'gully', size: [150, 400], width: [20, 45], height: [3, 9], rock: 0.2 },
  { id: 'ravine', shape: 'ravine', size: [200, 480], width: [30, 60], height: [6, 14], rock: 0.6 },
  { id: 'ridge', shape: 'ridge', size: [220, 500], width: [60, 120], height: [10, 26], rock: 0.4 },
  { id: 'scarp', shape: 'scarp', size: [160, 450], width: [14, 30], height: [5, 14], rock: 0.5 },
  { id: 'dryValley', shape: 'dryValley', size: [300, 500], width: [60, 140], height: [5, 14] },
  { id: 'bank', shape: 'bank', size: [40, 160], width: [3, 5], height: [1, 2] },
  { id: 'sunkenLane', shape: 'sunkenLane', size: [100, 300], width: [3, 5], height: [1.5, 3] },
  { id: 'boulders', shape: 'boulders', size: [30, 90], height: [0, 0], rock: 1 },
  { id: 'erratic', shape: 'erratic', size: [6, 14], height: [0, 0], rock: 1 },
];

/** Each biome's mix (by biome id). */
export const landformMix: Readonly<Record<string, LandformMix>> = {
  tundra: { perKm2: 38, relief: 5, mix: { knoll: 3, tor: 2, dell: 3, boulders: 3, erratic: 3, ridge: 1 } },
  taiga: { perKm2: 42, relief: 8, mix: { knoll: 3, tor: 2, dell: 2, gully: 3, ravine: 1, ridge: 2, boulders: 2, erratic: 2, scarp: 1 } },
  steppe: { perKm2: 38, relief: 6, mix: { knoll: 3, dell: 2, gully: 3, dryValley: 3, scarp: 2, ridge: 1, erratic: 1, sinkhole: 1 } },
  meadow: { perKm2: 46, relief: 7, mix: { knoll: 4, dell: 3, gully: 2, dryValley: 2, bank: 2, sunkenLane: 2, scarp: 1, tor: 1, erratic: 1, sinkhole: 1 } },
  forest: { perKm2: 46, relief: 9, mix: { knoll: 3, dell: 3, gully: 3, ravine: 1, ridge: 1, scarp: 1, boulders: 2, tor: 1, sinkhole: 1, sunkenLane: 1 } },
  heath: { perKm2: 44, relief: 7, mix: { knoll: 3, tor: 3, dell: 2, boulders: 2, erratic: 2, gully: 1, bank: 1, ridge: 1 } },
  desert: { perKm2: 36, relief: 10, mix: { ridge: 3, scarp: 3, dryValley: 3, ravine: 2, knoll: 2, boulders: 2, tor: 1 } },
  jungle: { perKm2: 42, relief: 9, mix: { knoll: 3, gully: 3, ravine: 2, dell: 2, sinkhole: 2, ridge: 1 } },
};
