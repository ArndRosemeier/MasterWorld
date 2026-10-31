/**
 * Everyone the hero can meet in groups in the classic setting (C6b, docs/design/vgm.md 3): the dwellers of
 * the places below, the wild round the towns and the bands the story events put out on the land are these.
 * The VGM picks and fills them (vgm/encounters.ts encounterFor). Fresh encounters are data here.
 */
import type { EncounterDef } from '../contract';

export const encounters: readonly EncounterDef[] = [
  { id: 'rats', creatures: ['giant rat', 'rat'], count: [3, 6], where: ['below'], need: 'challenge' },
  { id: 'smugglers', creatures: ['bandit'], count: [2, 4], where: ['below', 'open', 'shore'], need: 'challenge' },
  { id: 'spiders', creatures: ['giant spider'], count: [1, 2], where: ['below', 'wood'], need: 'challenge' },
  { id: 'goblins', creatures: ['goblin'], count: [2, 5], where: ['below', 'wood', 'open'], need: 'challenge' },
  { id: 'ghoul-and-bones', creatures: ['ghoul', 'skeleton'], count: [1, 3], where: ['below'], need: 'challenge' },
  { id: 'ghoul', creatures: ['ghoul'], count: [1, 1], where: ['below'], need: 'challenge' },
  { id: 'the-dead', creatures: ['skeleton'], count: [2, 4], where: ['below', 'open'], need: 'challenge' },
  { id: 'wolves', creatures: ['wolf'], count: [3, 4], where: ['below', 'wood'], need: 'challenge' },
  { id: 'highwaymen', creatures: ['highwayman'], count: [2, 3], where: ['below', 'road', 'open'], need: 'challenge' },
  { id: 'boar', creatures: ['boar'], count: [1, 2], where: ['wood'], need: 'challenge' },
  { id: 'deer', creatures: ['deer'], count: [3, 6], where: ['open'], need: 'discovery' },
  { id: 'crabs', creatures: ['giant crab'], count: [2, 4], where: ['shore'], need: 'challenge' },
];

/** A dweller's who: the encounter's id and its creatures (spread into a DwellerDef). */
export function who(id: string): { readonly encounter: string; readonly creatures: readonly string[] } {
  const e = encounters.find((x) => x.id === id);
  if (!e) throw new Error(`no encounter "${id}"`);
  return { encounter: id, creatures: e.creatures };
}
