/**
 * Cellars of the classic setting (plan 8, 12.1): what town houses dig cellars for, what lay beneath the
 * town before it (the old realm, before the Fading), what goes wrong, and who moves in.
 */
import type { CellarLore } from '../contract';

export const cellar: CellarLore = {
  words: {
    enter: 'You climb down into the cellar of {place}.',
    quiet: 'The cellar of {place} is quiet now. Its household will want to hear.',
    thanks: 'The household of {place} hears the cellar is safe and presses {coins} into your hand.',
  },
  uses: [
    { id: 'store', name: 'the household store', props: ['sack', 'barrel', 'shelf', 'jar', 'lantern'] },
    { id: 'wine-store', name: 'the wine store', props: ['rack', 'cask', 'rack', 'candle'] },
    { id: 'cask-hall', name: 'the cask hall', props: ['cask', 'cask', 'vat', 'barrel'] },
    { id: 'counting-room', name: 'the counting room', props: ['table', 'stool', 'ledger', 'chest', 'candle'] },
    { id: 'brewhouse', name: 'the old brewhouse', props: ['vat', 'barrel', 'bin', 'sack'] },
    { id: 'grain-store', name: 'the grain store', props: ['sack', 'sack', 'bin', 'bin'] },
    { id: 'cooperage', name: "the cooper's store", props: ['barrel', 'beam', 'stool', 'barrel'] },
    { id: 'herb-store', name: 'the herb store', props: ['shelf', 'jar', 'table', 'jar'] },
    { id: 'coal-hole', name: 'the coal hole', props: ['rubble', 'bin'] },
    { id: 'cistern', name: 'the old cistern', props: ['puddle', 'bricks'] },
    { id: 'watch-cells', name: 'the old watch cells', props: ['straw', 'bones', 'bricks'] },
    { id: 'guardroom', name: 'the old guardroom', props: ['table', 'stool', 'lantern', 'rubble'] },
    { id: 'realm-store', name: 'a storehouse of the old realm', props: ['chest', 'crate', 'shelf', 'rubble'] },
    { id: 'old-hall', name: 'the hall of an older house', props: ['beam', 'rubble', 'table'] },
    { id: 'burrow', name: 'a burrow', props: ['rubble', 'bones', 'nest'] },
    { id: 'rat-nest', name: 'the nest', props: ['nest', 'bones', 'straw', 'nest'] },
    { id: 'smugglers-store', name: "the smugglers' store", props: ['crate', 'crate', 'barrel', 'chest', 'lantern'] },
    { id: 'bunks', name: 'the bunks', props: ['cot', 'cot', 'straw', 'table', 'candle'] },
    { id: 'lookout', name: 'the lookout', props: ['stool', 'lantern'] },
    { id: 'web-hall', name: 'the webbed hall', props: ['web', 'web', 'bones'] },
    { id: 'hideout', name: 'the hideout', props: ['straw', 'sack', 'candle', 'bones'] },
    { id: 'refuge', name: 'a dry little room', props: ['sack', 'stool', 'candle'] },
    { id: 'collapse', name: 'the fallen room', props: ['rubble', 'beam', 'rubble'] },
    { id: 'stand', name: 'the barricaded room', props: ['barrel', 'beam', 'crate', 'bones'] },
    { id: 'flooded-way', name: 'the flooded way', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'ward-niche', name: 'a niche of the old realm', props: ['bricks', 'candle'] },
    { id: 'hoard-nook', name: 'the hoard', props: ['chest', 'sack', 'jar'] },
  ],
  builders: [
    { id: 'wine-merchant', text: 'A wine merchant built {house} and dug deep cellars to keep his casks cool.', uses: ['wine-store', 'cask-hall', 'counting-room'], patterns: ['lock-key', 'twin-paths', 'ring-hall'] },
    { id: 'brewer', text: 'A brewer brewed under {house} for three generations.', uses: ['brewhouse', 'cask-hall', 'grain-store'], patterns: ['twin-paths', 'barred-return'] },
    { id: 'chandler', text: 'A grain chandler kept his stock under {house}.', uses: ['grain-store', 'store', 'counting-room'], patterns: ['lock-key', 'side-loop', 'seen-key'] },
    { id: 'cooper', text: 'A cooper stored his staves and finished barrels under {house}.', uses: ['cooperage', 'store'], patterns: ['twin-paths', 'guarded-short', 'gambit'] },
    { id: 'herbwife', text: 'A herbwife dried and kept her herbs in the cool under {house}.', uses: ['herb-store', 'store'], patterns: ['side-loop', 'seen-goal'] },
    { id: 'household', text: 'The family of {house} dug a plain cellar for turnips, coal and ale.', uses: ['store', 'coal-hole'], patterns: ['twin-paths', 'barred-return'], weight: 1.5 },
  ],
  older: [
    { id: 'watch-house', text: "Before the town grew, the valley's watch-house stood here; its cells were filled in, not all of them well.", uses: ['watch-cells', 'guardroom'], patterns: ['gallery', 'barred-return'], traces: ['bricks'] },
    { id: 'cistern', text: 'Beneath it lies a cistern of the old realm, dry since the Fading broke its channels.', uses: ['cistern'], patterns: ['low-road', 'drop-in'], traces: ['puddle'] },
    { id: 'realm-store', text: 'Men and dwarves of the old realm kept a storehouse here; it was sealed when the Fading came.', uses: ['realm-store'], patterns: ['secret-key', 'gallery', 'split-descent'], traces: ['rubble'] },
    { id: 'old-hall', text: 'An older house stood here and burned; the town built over its hall.', uses: ['old-hall'], patterns: ['drop-in', 'collapsed-way'], traces: ['beam'] },
  ],
  troubles: [
    { id: 'flood', text: 'In the wet spring the river rose, and the lower cellar silted up.', uses: [], patterns: ['low-road', 'seen-goal'], traces: ['puddle'] },
    { id: 'collapse', text: 'One winter the floor gave way into what lay below.', uses: ['collapse'], patterns: ['drop-in', 'gallery', 'collapsed-way'], traces: ['rubble', 'beam'] },
    { id: 'debt', text: 'The owner ran into debt and left one night; the far rooms were locked and forgotten.', uses: ['counting-room'], patterns: ['lock-key', 'barred-return', 'seen-key'], traces: ['ledger'] },
    { id: 'fire', text: 'A fire in {house} burned through the floor; the cellar was patched, not cleared.', uses: ['collapse'], patterns: ['collapsed-way', 'guarded-short'], traces: ['beam'] },
    { id: 'sealed', text: 'A sickness came; a room was bricked up with what was in it, and nobody spoke of it after.', uses: [], patterns: ['secret-key', 'hidden-shortcut'], traces: ['bricks'] },
  ],
  dwellers: [
    {
      id: 'rats', text: 'Rats came up through the old drains and grew fat and bold; some are as big as dogs.', uses: ['burrow'], creatures: ['giant rat', 'rat'], lair: 'rat-nest', crowd: 3, danger: 10,
      patterns: ['collapsed-way', 'side-loop', 'low-road', 'bolt-hole'], traces: ['nest', 'bones'],
      signs: ['Something gnaws down there at night, and the dog will not go down any more.', 'The sacks are chewed through, and the bites are too big for a rat.'],
    },
    {
      id: 'smugglers', text: 'Smugglers found the old ways beneath and use them to move goods past the town gate.', uses: ['bunks', 'lookout'], creatures: ['bandit'], lair: 'smugglers-store', crowd: 1, danger: 17,
      patterns: ['hidden-shortcut', 'barred-return', 'secret-key', 'false-goal', 'ring-hall'], traces: ['lantern', 'crate'],
      signs: ['There are lights under the floorboards at night, and voices.', 'Wine goes missing, but the lock is never broken.'],
    },
    {
      id: 'spiders', text: 'Giant spiders crept in from the dark below and spun the lower rooms shut.', uses: [], creatures: ['giant spider'], lair: 'web-hall', crowd: 1, danger: 24,
      patterns: ['gallery', 'drop-in', 'seen-goal', 'split-descent'], traces: ['web', 'bones'],
      signs: ['The cat came back up covered in silk, and it has not stopped shaking.', 'There are webs on the cellar stairs that come back every morning.'],
    },
    {
      id: 'goblins', text: 'A handful of goblins came up the old tunnels, hungry, and stayed.', uses: ['burrow'], creatures: ['goblin'], lair: 'hideout', crowd: 2, danger: 15,
      patterns: ['guarded-short', 'collapsed-way', 'twin-paths', 'bolt-hole', 'gambit'], traces: ['bones', 'straw'],
      signs: ['Bread goes missing, and there are small muddy footprints by the hatch.', 'Someone down there sings at night, badly, in no tongue I know.'],
      surprise: 'One of the goblins speaks broken Common and begs for mercy.',
    },
    {
      id: 'ghoul', text: 'Something from the filled-in cells woke when the magic began to come back.', uses: [], creatures: ['ghoul', 'skeleton'], lair: 'watch-cells', crowd: 1, danger: 29,
      patterns: ['gallery', 'lock-key', 'seen-key'], traces: ['bones'], with: ['watch-house'],
      signs: ['It is cold down there, colder than it should be, and it smells of the grave.', 'Scratching from below, slow, like someone counting.'],
    },
  ],
};
