/**
 * Ruined towers of the classic setting (plan 8: "a building plan, collapsed and reoccupied"): who raised
 * them in the old realm or after it (a watch on the road, a petty lord, a sky-reading mage, beacon-keepers,
 * a toll), what their foot stands on, how they fell, and who holds them now. They stand out on the land,
 * storeys of stone going up; the goal is near the top.
 */
import type { CellarLore } from '../contract';
import { who } from './encounters';
import { CELLAR_SPACE } from './cellar';

export const tower: CellarLore = {
  // A small foot and storeys going up, a cellar under its foot (an older layer's vault, if it has one).
  form: {
    stands: 'level', ring: [700, 1500], called: 'the old tower {dir} of the town', word: 'tower', purposes: ['lead', 'hideout'], shell: 'keep', clearing: { back: 9, r: 24 },
    space: { ...CELLAR_SPACE, radius: 7, maxRooms: 10, depth: [-1, -1], rise: 2, way: 'door', entrance: [3, 3], arriveMid: true, walls: 'dressed' },
  },
  words: {
    enter: 'You push past the broken door and step into {place}.',
    quiet: 'Nothing moves in {place} now. The household who told you of it will want to hear.',
    thanks: 'Nothing left alive in {place}? Then we can look up at it without fear. Here, {coins}, and well earned.',
  },
  uses: [
    { id: 'gatehall', name: 'the gate hall', props: ['rubble', 'beam', 'lantern', 'crate'] },
    { id: 'guardroom', name: 'the guardroom', props: ['table', 'stool', 'lantern', 'rack'] },
    { id: 'barracks', name: 'the barracks', props: ['cot', 'cot', 'straw', 'table'] },
    { id: 'armoury', name: 'the armoury', props: ['rack', 'rack', 'chest', 'crate'] },
    { id: 'kitchen', name: 'the kitchen', props: ['table', 'barrel', 'vat', 'jar'] },
    { id: 'storeroom', name: 'the storeroom', props: ['sack', 'barrel', 'crate', 'shelf'] },
    { id: 'hall', name: 'the hall', props: ['table', 'table', 'stool', 'candle'] },
    { id: 'solar', name: "the lord's chamber", props: ['cot', 'table', 'chest', 'candle'] },
    { id: 'study', name: 'the study', props: ['shelf', 'table', 'ledger', 'candle'] },
    { id: 'library', name: 'the book room', props: ['shelf', 'shelf', 'shelf', 'table'] },
    { id: 'lookout', name: 'the watch room', props: ['stool', 'lantern', 'table'] },
    { id: 'beacon', name: 'the beacon room', props: ['rubble', 'beam', 'barrel'] },
    { id: 'toll-room', name: 'the toll room', props: ['table', 'ledger', 'chest', 'stool'] },
    { id: 'undercroft', name: 'the undercroft', props: ['cask', 'barrel', 'rubble'] },
    { id: 'founders-vault', name: "the founders' vault", props: ['chest', 'bones', 'jar', 'candle'] },
    { id: 'cistern', name: 'the cistern', props: ['puddle', 'bricks'] },
    { id: 'cells', name: 'the cells', props: ['straw', 'bones', 'bricks'] },
    { id: 'dovecote', name: 'the dovecote', props: ['nest', 'nest', 'straw'] },
    { id: 'camp', name: "the bandits' room", props: ['straw', 'lantern', 'crate', 'sack', 'cot'] },
    { id: 'warren', name: 'the goblin warren', props: ['straw', 'sack', 'bones', 'crate'] },
    { id: 'burrow', name: 'a gnawed hole', props: ['rubble', 'bones', 'nest'] },
    { id: 'rat-nest', name: 'the nest', props: ['nest', 'bones', 'straw', 'nest'] },
    { id: 'web-hall', name: 'the webbed room', props: ['web', 'web', 'bones'] },
    { id: 'refuge', name: 'a quiet corner', props: ['stool', 'candle', 'jar'] },
    { id: 'collapse', name: 'the fallen floor', props: ['rubble', 'beam', 'rubble'] },
    { id: 'stand', name: 'the barricaded stair', props: ['beam', 'crate', 'bones'] },
    { id: 'flooded-way', name: 'the flooded vault', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'ward-niche', name: 'a warded alcove', props: ['bricks', 'candle'] },
    { id: 'hoard-nook', name: 'the hoard', props: ['chest', 'sack', 'jar'] },
  ],
  builders: [
    { id: 'watch', text: 'The old realm raised {place} to watch the valley road, and a dozen men kept it.', uses: ['gatehall', 'guardroom', 'barracks', 'lookout'], patterns: ['barred-return', 'seen-goal', 'twin-paths'], weight: 1.3 },
    { id: 'lord', text: 'A petty lord built {place} when the valley was his, and his family held it until the line ran out.', uses: ['gatehall', 'hall', 'kitchen', 'solar'], patterns: ['lock-key', 'ring-hall', 'gambit'] },
    { id: 'mage', text: 'A mage of the old realm built {place} to read the sky from; the Fading left her nothing to read.', uses: ['gatehall', 'study', 'library', 'lookout'], patterns: ['seen-key', 'secret-key', 'gallery'] },
    { id: 'beacon', text: 'Beacon-keepers lived in {place} and lit its fire when raiders came up the valley.', uses: ['gatehall', 'storeroom', 'beacon', 'barracks'], patterns: ['drop-in', 'split-descent', 'guarded-short'] },
    { id: 'toll', text: 'A toll-keeper held {place} and took a coin from every cart on the old road.', uses: ['gatehall', 'toll-room', 'storeroom', 'armoury'], patterns: ['lock-key', 'side-loop', 'barred-return'] },
  ],
  older: [
    { id: 'undercroft', text: 'It stands on the vaults of an older hall, and the vaults still hold its casks.', uses: ['undercroft'], patterns: ['low-road', 'gallery'], traces: ['cask'] },
    { id: 'founders', text: 'Its first keepers lie in a vault at its foot, each under a stone with a name.', uses: ['founders-vault'], patterns: ['secret-key', 'seen-key'], traces: ['bones'] },
    { id: 'cistern', text: 'It was built over a cistern cut in the rock, which kept it through every siege.', uses: ['cistern'], patterns: ['low-road', 'drop-in'], traces: ['puddle'] },
    { id: 'cells', text: 'Its foot holds cells older than the tower, from when the crag was a prison.', uses: ['cells'], patterns: ['barred-return', 'split-descent'], traces: ['bricks'] },
  ],
  troubles: [
    { id: 'collapse', text: 'A storm took the roof and the floors fell in after it, one storey onto the next.', uses: ['collapse'], patterns: ['drop-in', 'gallery', 'collapsed-way'], traces: ['rubble', 'beam'] },
    { id: 'siege', text: 'It was besieged in the bad years after the Fading; the last of its keepers barricaded the stair.', uses: ['stand'], patterns: ['barred-return', 'guarded-short', 'bolt-hole'], traces: ['beam', 'bones'] },
    { id: 'fire', text: 'It burned one dry summer, and the fire went up through the floors like a chimney.', uses: ['collapse'], patterns: ['collapsed-way', 'false-goal', 'drop-in'], traces: ['beam'] },
    { id: 'abandoned', text: 'The keepers were called away and never came back; the doors were locked behind them.', uses: [], patterns: ['lock-key', 'seen-key', 'hidden-shortcut'], traces: ['ledger'] },
    { id: 'sealed', text: 'Its last keeper walled up the upper rooms with what was in them, and spoke of it to no one.', uses: [], patterns: ['secret-key', 'hidden-shortcut', 'side-loop'], traces: ['bricks'] },
  ],
  dwellers: [
    {
      id: 'garrison', text: 'The garrison of {place} died at their posts, and since the magic began to come back they keep the watch again.', uses: [], ...who('the-dead'), lair: 'lookout', crowd: 1, danger: 19,
      patterns: ['barred-return', 'lock-key', 'ring-hall', 'gallery'], traces: ['bones'],
      signs: ['Lights move along the top of the old tower at night, one after another, like men on a round.', 'A drover sheltered under the tower and heard a horn blown inside it, the old call to arms.'],
    },
    {
      id: 'highwaymen', text: 'Bandits have made {place} their hold; from the top they see every cart on the road.', uses: ['camp'], ...who('highwaymen'), lair: 'camp', crowd: 2, danger: 20,
      patterns: ['bolt-hole', 'guarded-short', 'seen-goal', 'false-goal'], traces: ['lantern', 'crate'],
      signs: ['Carts on the old road get stopped within sight of the tower, never out of it.', 'There is smoke from the top of the tower, and someone has hung a new door.'],
    },
    {
      id: 'goblins', text: 'Goblins swarm in {place} and have gnawed the old hangings into nests.', uses: ['warren'], ...who('goblins'), lair: 'warren', crowd: 3, danger: 19,
      patterns: ['ring-hall', 'twin-paths', 'gambit', 'collapsed-way'], traces: ['straw', 'bones'],
      signs: ['Small figures on the broken top of the tower at dusk, throwing stones at the crows.', 'The goats that graze by the tower come back with their ears chewed.'],
      surprise: 'One of the goblins speaks broken Common and begs for mercy.',
    },
    {
      id: 'rats', text: 'Rats took {place} when the keepers left and grew fat on their stores.', uses: ['burrow'], ...who('rats'), lair: 'rat-nest', crowd: 3, danger: 10,
      patterns: ['collapsed-way', 'side-loop', 'low-road', 'bolt-hole'], traces: ['nest', 'bones'],
      signs: ['The owls that nest in the tower are gone, and something has been at their nests.', 'Rats as big as cats run from the tower into the fields at dusk.'],
    },
    {
      id: 'spiders', text: 'Giant spiders have spun the upper rooms of {place} shut, and the crows keep away.', uses: [], ...who('spiders'), lair: 'web-hall', crowd: 1, danger: 24,
      patterns: ['gallery', 'drop-in', 'seen-goal', 'split-descent'], traces: ['web', 'bones'],
      signs: ['The arrow slits of the tower are grey with webs, every one of them.', 'A boy climbed the tower for a dare and came down white and would not say why.'],
    },
    {
      id: 'ghoul', text: "Something has crawled out of the founders' vault of {place}, and it is hungry.", uses: [], ...who('ghoul-and-bones'), lair: 'founders-vault', crowd: 1, danger: 26,
      patterns: ['gallery', 'lock-key', 'seen-key', 'low-road'], traces: ['bones'], with: ['founders', 'sealed'],
      signs: ['There is a smell from the tower like an opened grave, even from the road.', 'The stones of the founders lie broken by the tower door, and nobody broke them.'],
    },
  ],
};
