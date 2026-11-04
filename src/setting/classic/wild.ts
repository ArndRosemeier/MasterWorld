/**
 * The land around the town in the classic setting (plan 9.3, 12.1): deer in the meadows, boar under the
 * oaks, a wolf pack deeper in the woods, a few bandits by a road out, cutthroats far out; giant crabs on the strands and smugglers in a cove
 * by the sea, sharks out in deep water. Near the town, so nothing is too
 * strong for a fresh hero (D29): farther lands hold more.
 */
import type { WildDef } from '../contract';

export const wild: readonly WildDef[] = [
  // Every group's ground starts past the distance a group wakes at (sim/wild.ts WAKE, 260 m) from the town's middle.
  { id: 'deer', encounter: 'deer', habitat: 'open', ring: [330, 1400], range: 60, groups: 3, lore: { told: 'deer graze the meadows to the {dir}, and they are gone before you can nock an arrow', by: { pursuits: ['hunting', 'rambling'], trades: ['farmer'] } } },
  { id: 'boar', encounter: 'boar', habitat: 'wood', ring: [350, 1200], range: 45, groups: 2, lore: { told: 'a boar sow roots under the oaks to the {dir}, and she does not care for company', by: { pursuits: ['hunting'], trades: ['farmer', 'carpenter'] } } },
  { id: 'wolves', encounter: 'wolves', habitat: 'wood', ring: [700, 1600], range: 80, groups: 1, lore: { told: 'wolves lie up deep in the woods to the {dir}, and you can hear them when the wind is right', by: { pursuits: ['hunting'], trades: ['farmer', 'carter'], watch: true } } },
  { id: 'bandits', encounter: 'highwaymen', habitat: 'road', ring: [450, 1000], range: 30, groups: 1, lore: { told: 'highwaymen lurk by the road to the {dir}, and carters have turned back from it', by: { trades: ['carter', 'warehouse'], watch: true } } },
  // Far out (R8, D29: the farther, the worse): cutthroats, past where any bandits lurk, who attack at once with a war cry.
  { id: 'cutthroats', encounter: 'cutthroats', habitat: 'open', ring: [1800, 2600], range: 30, groups: 1, count: [2, 2], lore: { told: 'cutthroats hold the open country far to the {dir}, past where the bandits lurk', by: { watch: true } } },
  // The giants (D67, phase M). Two are peaceful and near, a promise to the player: an elk as big as a barn on the open land, a turtle at the water's edge (a pond, a river, a lake or the sea).
  { id: 'giant-elk', encounter: 'giant-elk', habitat: 'open', ring: [450, 1500], range: 70, groups: 1, lore: { told: 'an elk as big as a barn grazes the open land to the {dir}, and it lets you look but not come near', by: { pursuits: ['hunting', 'rambling'], trades: ['farmer'] } } },
  { id: 'giant-turtle', encounter: 'giant-turtle', habitat: 'water', ring: [350, 1500], range: 24, groups: 1, lore: { told: 'a turtle big as a cart sits at the water to the {dir}, and it has been there longer than the town', by: { pursuits: ['fishing', 'net_mending'], trades: ['harbourmaster'] } } },
  // Two hunt, and live where the land's danger allows them (D29: dangerAt, 40 from 4.7 km, 45 from 5.5 km): a giant wolf with its pack in the deep woods, a boar farther.
  { id: 'giant-boar', encounter: 'giant-boar', habitat: 'wood', ring: [5500, 6300], range: 50, groups: 1, lore: { told: 'a boar big as an ox is said to root in the deep woods far to the {dir}', by: { pursuits: ['hunting'], watch: true } } },
  { id: 'giant-wolves', encounter: 'giant-wolves', habitat: 'wood', ring: [4700, 5500], range: 80, groups: 1 },
  // By the sea (S9; a town with no coast near has none): giant crabs on the strands, smugglers in a cove farther off.
  { id: 'crabs', encounter: 'crabs', habitat: 'shore', ring: [320, 1300], range: 28, groups: 2, lore: { told: 'crabs the size of a table crawl the strand to the {dir}, and they take fingers', by: { pursuits: ['fishing', 'net_mending'], trades: ['harbourmaster', 'warehouse'] } } },
  { id: 'smugglers', encounter: 'smugglers', habitat: 'shore', ring: [600, 1600], range: 24, groups: 1, count: [2, 3], lore: { told: 'there is a cove to the {dir} where lamps burn at the wrong hours of the night', by: { pursuits: ['fishing', 'net_mending'], trades: ['harbourmaster'], watch: true } } },
  // Out in deep water past the harbour: a shark, for a hero who swims far out.
  { id: 'sharks', encounter: 'shark', habitat: 'sea', ring: [500, 1800], range: 45, groups: 2, lore: { told: 'a shark patrols the deep water to the {dir}, and the fishers will not go there', by: { pursuits: ['fishing', 'net_mending'], trades: ['harbourmaster'] } } },
];
