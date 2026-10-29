/**
 * How a hero of the classic world may look (plan 11.4, D30): Actors' character creator with the clothes,
 * hair and peoples of a medieval fantasy. Antique and Norse pieces fit a fantasy world too; today's and
 * tomorrow's clothes, and real-world religious symbols, do not.
 */
import type { HeroLooksDef } from '../contract';

export const hero: HeroLooksDef = {
  // Read by tools/packs/actors.mjs (which garments and hairstyles to ship): keep these plain quoted lists.
  themes: ['medieval', 'nordic', 'antique', 'fantasy'],
  without: ['real-faith'],
  races: ['human', 'dwarf', 'halfling', 'elf'],
  outfits: ['med-traveller', 'med-peasant', 'peasant', 'med-archer'],
  // A hero sets out young to prime, fit and lean (Arnd: no overweight grandma as the first hero).
  // Dwarves and halflings stay stocky and short, as Actors makes them; nobody gets a belly or wide hips.
  build: {
    ageYears: [19, 38], weight: [0.1, 0.35], muscle: [0.5, 0.9], proportions: [0.5, 1], height: [0.45, 1], cupSize: [0.2, 0.6],
    details: Object.fromEntries([
      'stomach/stomach-pregnant-decr-incr', 'hip/hip-scale-depth-decr-incr', 'hip/hip-scale-horiz-decr-incr', 'torso/measure-hips-circ-decr-incr',
      'torso/measure-waist-circ-decr-incr', 'torso/torso-scale-depth-decr-incr', 'buttocks/buttocks-volume-decr-incr',
    ].map((id) => [id, [-0.4, 0.1] as const])),
  },
};
