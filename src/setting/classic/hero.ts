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
};
