/**
 * Caves that form (D63, phase K; docs/design/caves.md): the classic setting's rock, sizes and shares. Every number
 * of a formed cave is here, so a size or a share is changed in one place. The three rock settings give the three
 * patterns the water leaves in limestone: a branchwork (few sinks, one winner), a network maze (dense joints, many
 * sinks, little winning) and braids (a thin soluble bed, many near-equal paths).
 */
import type { CavesDef } from '../contract';

/** Limestone's wall colours: buff, grey-brown, cream and a rust-stained brown. */
// Limestone beds: mostly greys (pale, mid, dark, blue-grey, a greenish one), some buff and a brown, so no cave is one colour.
const LIME = [0x9a9da0, 0x777b80, 0xb4b6b2, 0x5e6368, 0x868a8e, 0xa5a79c, 0x6a7078, 0xa89c88, 0x8a7a66, 0x4f5459] as const;

export const caves: CavesDef = {
  // The land's kind holds the rock: karst and downs are limestone and chalk, open country sometimes, the mesas' foot hills now and then.
  // (Volcanic country, with lava tubes, comes with K7; moor and badlands hold no solution cave.)
  geology: [
    { kind: 'karst', rocks: { massive: 3, jointed: 2, 'thin-bedded': 2 } },
    { kind: 'downs', rocks: { 'thin-bedded': 3, massive: 1 } },
    { kind: 'open', rocks: { massive: 2, jointed: 1, 'thin-bedded': 1 } },
    { kind: 'mesa', rocks: { massive: 1, jointed: 2 } },
  ],
  rocks: [
    {
      id: 'massive', name: 'Massive limestone',
      bedding: { thickness: [3, 9], dip: [0, 6], soluble: 0.5, parting: 0.8, colors: LIME },
      resistance: { size: 30, contrast: 3 },
      joints: { sets: 2, spacing: [20, 40], between: [55, 90], strength: 1 },
      faults: { count: [0, 1], strength: 1.5 },
      water: { sinks: [5, 9], springs: [1, 2], stages: [2, 4], drop: [6, 12], loop: 14 },
      former: { rounds: 8, samples: 1, feedback: 2.4, growth: 0.7, reuse: 0.15, noise: 0.35, keep: 0.04 },
      collapse: { junction: 0.35, span: 5.5, most: 4 },
    },
    {
      id: 'jointed', name: 'Jointed limestone',
      bedding: { thickness: [1.5, 4], dip: [0, 4], soluble: 0.7, parting: 0.5, colors: LIME },
      resistance: { size: 20, contrast: 2.4 },
      joints: { sets: 2, spacing: [7, 14], between: [70, 90], strength: 3 },
      faults: { count: [1, 2], strength: 2 },
      water: { sinks: [10, 18], springs: [2, 3], stages: [1, 2], drop: [5, 9], loop: 8 },
      former: { rounds: 6, samples: 1, feedback: 1, growth: 0.3, reuse: 0.2, noise: 0.35, keep: 0.012 },
      collapse: { junction: 0.15, span: 4.5, most: 3 },
    },
    {
      id: 'thin-bedded', name: 'Thin-bedded limestone',
      bedding: { thickness: [0.6, 2.2], dip: [2, 8], soluble: 0.35, parting: 3.5, colors: LIME },
      resistance: { size: 24, contrast: 3 },
      joints: { sets: 2, spacing: [18, 30], between: [60, 90], strength: 0.6 },
      faults: { count: [0, 1], strength: 1 },
      water: { sinks: [3, 6], springs: [2, 3], stages: [2, 3], drop: [4, 8], loop: 6 },
      former: { rounds: 3, samples: 2, feedback: 1.3, growth: 0.35, reuse: 0.15, noise: 0.6, keep: 0.02 },
      collapse: { junction: 0.2, span: 5, most: 3 },
    },
  ],
  // The big cave is about 300 m across and 60 m deep (Arnd, D63).
  sizes: [
    { id: 'small', across: 80, deep: 32, weight: 4, scale: 0.7, step: 2.5, field: 0.5 },
    { id: 'medium', across: 160, deep: 48, weight: 3, scale: 1, step: 3, field: 0.65 },
    { id: 'big', across: 300, deep: 60, weight: 1, scale: 1.4, step: 5, field: 0.8 },
  ],
  // Pure caves are the norm; a mixed one usually has two shares and the third at zero (Arnd, 2026-11-01).
  shares: { pure: 0.6, two: 0.32, three: 0.08, weight: { built: 1, water: 2.2, lava: 1 }, lavaOn: ['volcanic'] },
  // No squeezing (D63): a way is 2 m wide and 2.8 m high at the least, for a hero up to 2.1 m tall.
  way: { minWidth: 2, minHeight: 2.8, maxRadius: 5.5, maxCut: 14 },
  walls: { rough: 0.7 },
  // The dresser (K3): silt and fallen rock, a stream with pools, drips along the roof's cracks with their formations.
  dress: {
    floor: { silt: [0.08, 0.32], relief: 0.14 },
    rocks: { along: 16, perHall: [8, 16], size: [0.35, 1.5] },
    water: { width: [0.5, 1.5], bed: 0.28, pools: 4, poolDepth: 0.4 },
    drips: { chance: 0.55, live: 0.55, spacing: 1.7, scatter: 18 },
    stones: { per100: 520, size: [0.06, 0.7], heaps: 0.3, most: 4500 },
    crystals: { per100: 9, count: [3, 9], len: [0.1, 0.5], oreTries: 5000 },
    formations: { length: [0.2, 2.6], age: 0.5, column: 7, straws: 0.12, most: 3000 },
  },
  // Ore is for show (no mining, ever): veins on faults and joints, seams along a bed, pockets.
  ore: {
    bodies: [1, 4],
    kinds: { vein: 5, seam: 2, pocket: 2 },
    ores: [
      { id: 'iron', name: 'iron', color: 0x8a4a2a, weight: 3 },
      { id: 'copper', name: 'copper', color: 0x3f8f6a, weight: 2.5 },
      { id: 'silver', name: 'silver', color: 0xc8ccd0, weight: 1.2 },
      { id: 'gold', name: 'gold', color: 0xe0b840, weight: 0.6 },
      { id: 'gems', name: 'gems', color: 0x7a4fc0, weight: 0.4 },
    ],
  },
};
