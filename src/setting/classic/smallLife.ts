/**
 * Small life in the classic setting (plan 9.3): finches and blackbirds on the woodland floor, sparrows
 * and pigeons at the edges of meadows, starlings and rooks wheeling over the open land and the fields,
 * red squirrels (now and then a black one) in the woods.
 */
import type { SmallLifeDef } from '../contract';

export const smallLife: SmallLifeDef = {
  birds: [
    // Chaffinch and blackbird (the cock black, the hen brown).
    { id: 'finch', size: 0.15, colours: [0x8a6a50, 0x7a6048, 0x6c6a58], habitat: 'wood', count: [2, 5], chance: 0.16, beat: 14 },
    { id: 'blackbird', size: 0.25, colours: [0x1a1714, 0x1a1714, 0x5a4232], habitat: 'wood', count: [1, 2], chance: 0.12, beat: 9 },
    { id: 'sparrow', size: 0.15, colours: [0x7a5e44, 0x86684a, 0x6e5a48], habitat: 'open', count: [3, 7], chance: 0.1, beat: 14 },
    { id: 'pigeon', size: 0.32, colours: [0x6e7078, 0x7a7c84, 0x63656c], habitat: 'open', count: [2, 4], chance: 0.05, beat: 7 },
    { id: 'starling', size: 0.21, colours: [0x24221f, 0x2a2622, 0x201e1c], habitat: 'flock', count: [18, 34], chance: 0.35, beat: 10 },
    { id: 'rook', size: 0.45, colours: [0x121214, 0x16161a], habitat: 'flock', count: [6, 12], chance: 0.2, beat: 4 },
  ],
  squirrels: ['red', 'red', 'red', 'red', 'black'],
  squirrelChance: 0.3,
};
