/**
 * The memorable structures of the classic setting (D69, Z4): the hands that built them (each its own stone, colours,
 * proportions, arches and ornament), those who hold them now (each with what it adds) and the kinds, with which hands
 * and holders each can have. The grammar of each kind is its generator's (world/structures).
 */
import type { StructuresDef } from '../contract';

export const structures: StructuresDef = {
  builders: [
    {
      // Pale dressed limestone, round arches, tall and slender, string courses, pilasters, figures on the parapets.
      id: 'old-realm', name: 'the masons of the old realm', stone: 'ashlar', tint: [232, 224, 206], trim: [246, 240, 226], floor: 'flagstone',
      roof: 'slate', roofTint: [128, 134, 150], timber: [120, 96, 76], arches: ['round', 'round', 'segmental'], towers: ['square', 'round'],
      ornament: ['courses', 'pilasters', 'statues'], tall: 1.3, thick: 1, merlon: 1,
    },
    {
      // Dark granite in huge blocks, flat lintels and low arches, squat and massive, corbelled galleries, no timber.
      id: 'dwarves', name: 'the dwarves of the deep halls', stone: 'ashlar', tint: [128, 126, 136], trim: [104, 100, 108], floor: 'flagstone',
      roof: 'slate', roofTint: [78, 82, 94], timber: [70, 56, 46], arches: ['flat', 'segmental', 'segmental'], towers: ['octagon', 'square'],
      ornament: ['machicolations', 'buttresses', 'courses'], tall: 0.78, thick: 1.5, merlon: 2,
    },
    {
      // Warm field stone laid rough, pointed arches, round towers under shingle, timber galleries on the tops.
      id: 'valley', name: 'the men of the valley', stone: 'rubble', tint: [196, 178, 150], trim: [214, 202, 180], floor: 'flagstone',
      roof: 'shingle', roofTint: [132, 104, 82], timber: [118, 88, 64], arches: ['pointed', 'pointed', 'round'], towers: ['round', 'round', 'square'],
      ornament: ['hoardings', 'buttresses'], tall: 1, thick: 1.15, merlon: 1,
    },
    {
      // Red brick with pale stone dressings, pointed arches, tiled roofs, corbelled tops on slender towers.
      id: 'river', name: 'the brickmakers of the river towns', stone: 'brick', tint: [184, 104, 80], trim: [222, 208, 186], floor: 'flagstone',
      roof: 'tile', roofTint: [176, 92, 66], timber: [104, 78, 58], arches: ['pointed', 'segmental'], towers: ['square', 'octagon'],
      ornament: ['courses', 'machicolations'], tall: 1.2, thick: 0.9, merlon: 1,
    },
  ],
  holders: [
    {
      id: 'goblins', name: 'goblins', always: ['hides', 'spikes'], adds: ['skulls', 'totem', 'ropes', 'tents', 'cages', 'banners'],
      cloth: [[124, 94, 64], [98, 72, 52], [146, 122, 84], [146, 58, 44]],
    },
    {
      id: 'bandits', name: 'bandits', always: ['barricade', 'palisade'], adds: ['lookout', 'tents', 'cart', 'banners', 'ropes'],
      cloth: [[112, 106, 92], [74, 84, 100], [136, 64, 52], [150, 136, 104]],
    },
    {
      id: 'undead', name: 'the restless dead', always: ['graves', 'bones'], adds: ['coffins', 'banners', 'cages', 'skulls'],
      cloth: [[62, 64, 60], [92, 86, 72], [70, 52, 56]],
    },
  ],
  kinds: [
    { id: 'fortified-bridge', name: 'a fortified bridge', builders: { 'old-realm': 2, dwarves: 1.5, valley: 2, river: 2 }, holders: { bandits: 3, goblins: 2, undead: 1 } },
    { id: 'great-ruin', name: 'a great ruin of the old realm', builders: { 'old-realm': 2.5, dwarves: 1.5, valley: 1.2, river: 1.5 }, holders: { undead: 1 }, play: true },
  ],
};
