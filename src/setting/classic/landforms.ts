/**
 * The classic setting's landforms (D55, plan 5.9): the small shapes of the land and each biome's mix of them.
 * Sizes in metres; the rules that shape them are in world/landforms.ts.
 */
import type { LandformDef, LandformMix, LandscapeKindDef } from '../contract';

export const landforms: readonly LandformDef[] = [
  { id: 'knoll', shape: 'knoll', size: [80, 260], height: [5, 16] },
  { id: 'tor', shape: 'tor', size: [80, 220], height: [10, 26], rock: 1 },
  { id: 'dell', shape: 'dell', size: [50, 160], height: [3, 8], pond: 0.35 },
  { id: 'sinkhole', shape: 'sinkhole', size: [16, 40], height: [4, 10], rock: 0.3 },
  // A doline: karst's broad round hollow, a sinkhole grown wide (L7).
  { id: 'doline', shape: 'sinkhole', size: [45, 100], height: [8, 16], rock: 0.25 },
  { id: 'gully', shape: 'gully', size: [150, 400], width: [20, 45], height: [3, 9], rock: 0.2 },
  { id: 'ravine', shape: 'ravine', size: [200, 480], width: [30, 60], height: [6, 14], rock: 0.6 },
  { id: 'ridge', shape: 'ridge', size: [220, 500], width: [60, 120], height: [10, 26], rock: 0.4 },
  { id: 'scarp', shape: 'scarp', size: [160, 450], width: [14, 30], height: [5, 14], rock: 0.5 },
  { id: 'dryValley', shape: 'dryValley', size: [300, 500], width: [60, 140], height: [5, 14] },
  { id: 'bank', shape: 'bank', size: [40, 160], width: [3, 5], height: [1, 2] },
  { id: 'sunkenLane', shape: 'sunkenLane', size: [100, 300], width: [3, 5], height: [1.5, 3] },
  { id: 'boulders', shape: 'boulders', size: [30, 90], height: [0, 0], rock: 1 },
  { id: 'erratic', shape: 'erratic', size: [6, 14], height: [0, 0], rock: 1 },
  // Volcanic country: cinder cones with a crater, black lava rock standing out, collapsed pits (a lava tube's roof fallen in).
  { id: 'cinderCone', shape: 'cone', size: [90, 240], height: [28, 70], rock: 0.5 },
  { id: 'lavaRock', shape: 'tor', size: [40, 120], height: [4, 12], rock: 1 },
  { id: 'collapse', shape: 'sinkhole', size: [14, 36], height: [4, 9], rock: 0.5 },
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

/**
 * The kinds of country (D55): open country (hills and plains with the biomes' own landforms), rolling downs, moor,
 * karst, badlands (L7: each its big shapes, landforms and bareness) and mesa country (plateaus 40-200 m high,
 * cliff walls with a bench or two, passes up ramps of fallen rock and gullies).
 */
export const landscapeKinds: readonly LandscapeKindDef[] = [
  // (The kinds before mesa country share what open country alone had, so the mesas stand where they stood.)
  { id: 'open', share: 0.3 },
  // Rolling downs: broad rounded hills of short grass, dry valleys between, old banks and lanes, few trees.
  {
    id: 'downs', share: 0.1, swell: { height: 38, size: 1300 }, bare: 0.99,
    wears: { color: 0x7c9c48, surface: 'grass', grass: { cover: 1, height: 0.12, dry: 0.2 }, layer: 'chalkTurf', share: 0.85 },
    landforms: { perKm2: 34, relief: 5, mix: { dryValley: 4, knoll: 3, bank: 2, sunkenLane: 2, dell: 2, scarp: 1 } },
  },
  // Moor: high, open and treeless, tors of grey rock on the crests, boulders strewn, boggy hollows with pools.
  {
    id: 'moor', share: 0.09, swell: { height: 26, size: 1800 }, bare: 0.995,
    wears: { color: 0x6a5a40, surface: 'grass', grass: { cover: 0.45, height: 0.2, dry: 0.55 }, layer: 'heather', share: 0.8 },
    landforms: { perKm2: 44, relief: 6, mix: { tor: 5, boulders: 4, erratic: 3, dell: 3, knoll: 2, ridge: 1 } },
  },
  // Karst: limestone country pitted with sinkholes and dolines, dry valleys and ravines where the water went under.
  {
    id: 'karst', share: 0.07, swell: { height: 22, size: 900 }, bare: 0.85,
    wears: { color: 0x8e9670, surface: 'grass', grass: { cover: 0.5, height: 0.12, dry: 0.5 }, layer: 'limestone', share: 0.6 },
    landforms: { perKm2: 72, relief: 6, mix: { doline: 6, sinkhole: 5, dell: 3, ravine: 2, dryValley: 2, tor: 2, knoll: 2, boulders: 1 } },
  },
  // Badlands: bare, crumbling ground cut into knife ridges by countless gullies, scarps and ravines.
  {
    id: 'badlands', share: 0.06, swell: { height: 40, size: 280, sharp: true }, bare: 1,
    wears: { color: 0x9a6a4a, surface: 'scree', grass: { cover: 0.05, height: 0.08, dry: 0.95 }, layer: 'clay', share: 1 },
    landforms: { perKm2: 62, relief: 10, mix: { gully: 6, ravine: 4, ridge: 3, scarp: 3, knoll: 1 } },
  },
  {
    id: 'mesa', share: 0.34,
    // Its valleys' floors: the biome's own ground, with gravel washed down from the walls in drifts.
    wears: { layer: 'gravel', share: 0.3 },
    mesa: { height: [40, 200], cover: 0.42, size: 2400, steep: [4.5, 6.5], passes: 0.2, climbable: 0.3, tiers: 2 },
    landforms: { perKm2: 40, relief: 4, mix: { boulders: 4, erratic: 3, gully: 3, dryValley: 2, scarp: 2, knoll: 2, sinkhole: 1, ravine: 1 } },
  },
  // Volcanic country (K7, D63): old cinder cones and lava fields of black rock, thin on plants, pits where a lava tube's
  // roof fell in. Last, and cut from mesa country's share, so every other kind's cells stay where they were.
  {
    id: 'volcanic', share: 0.04, swell: { height: 30, size: 700 }, bare: 0.93,
    wears: { color: 0x4a443e, surface: 'scree', grass: { cover: 0.15, height: 0.1, dry: 0.8 }, layer: 'basalt', share: 0.9 },
    landforms: { perKm2: 58, relief: 7, mix: { cinderCone: 4, lavaRock: 5, boulders: 4, collapse: 3, erratic: 2, knoll: 1 } },
  },
];
