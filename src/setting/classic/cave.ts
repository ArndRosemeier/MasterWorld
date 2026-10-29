/**
 * Natural caves of the classic setting (plan 8: "water and rock; a lair at the end"): what made them, who
 * used them once (miners, herders, a hermit), what lies deeper (an older people's paintings, a spring, a
 * pit of old bones), what went wrong, and who dens there now. Out on the land in the hills around the town;
 * the mouth is rock on the hillside, and inside the rock is carved, not built.
 */
import type { CellarLore } from '../contract';
import { who } from './encounters';
import { CELLAR_SPACE } from './cellar';

export const cave: CellarLore = {
  // Water and rock: a storey below always (the water went down), the way up to the mouth a rock step with a ladder.
  form: {
    stands: 'cliff', ring: [700, 1600], called: 'the cave {dir} of the town', word: 'cave', purposes: ['lead', 'den', 'hideout'], shell: 'mouth', clearing: { back: 6, r: 17 },
    // Natural caves are big (D57): 3 m cells, 4 m storeys, ramps of rock between them, chambers far apart along
    // long winding ways, and one great cavern six storeys (24 m) high.
    space: {
      ...CELLAR_SPACE, scale: { cell: 3, storey: 4, stairRun: 3, passage: 3.4 }, radius: 40, maxRooms: 13, depth: [-2, -2], inset: 1.25, entrance: [3, 3],
      rooms: { nook: [2, 3], small: [3, 4], medium: [4, 5], large: [5, 7] }, ways: { gap: [3, 6], turn: 0.3, longest: 20, least: 220, rise: 1 }, cavern: { height: 6, size: [7, 10] },
      carved: true, torches: false, arriveMid: true,
    },
  },
  words: {
    quiet: 'Nothing stirs in {place} now. The household who told you of it will want to hear.',
    thanks: '{place} is quiet? Then the hill road is safe again. Take {coins}, with our thanks.',
    came: 'Not a sound in here any more, so I came in. Then the hill road is safe again! Take {coins}, with our thanks.',
  },
  uses: [
    { id: 'mouth', name: 'the cave mouth', props: ['rubble', 'bones', 'straw'] },
    { id: 'gallery', name: 'the long gallery', props: ['rubble', 'puddle', 'rubble'] },
    { id: 'cavern', name: 'the great cavern', props: ['rubble', 'rubble', 'bones', 'puddle'] },
    { id: 'drip-hall', name: 'the dripping hall', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'pool', name: 'the still pool', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'crawl', name: 'the low crawl', props: ['rubble', 'rubble'] },
    { id: 'stream-cut', name: 'the stream passage', props: ['puddle', 'rubble', 'puddle'] },
    { id: 'pen', name: 'the old pen', props: ['straw', 'rubble', 'bones'] },
    { id: 'workings', name: 'the old workings', props: ['beam', 'rubble', 'crate', 'lantern'] },
    { id: 'ore-face', name: 'the worked-out face', props: ['rubble', 'beam', 'bin'] },
    { id: 'hermit-cell', name: "the hermit's cell", props: ['cot', 'table', 'jar', 'candle'] },
    { id: 'painted-chamber', name: 'the painted chamber', props: ['jar', 'bones', 'candle'] },
    { id: 'spring', name: 'the spring', props: ['puddle', 'puddle', 'jar'] },
    { id: 'bone-pit', name: 'the bone pit', props: ['bones', 'bones', 'rubble'] },
    { id: 'shaft', name: 'the hall under the shaft', props: ['rubble', 'bones', 'straw'] },
    { id: 'den', name: 'the den', props: ['bones', 'bones', 'straw', 'nest'] },
    { id: 'warren', name: 'the goblin warren', props: ['straw', 'sack', 'bones', 'crate'] },
    { id: 'camp', name: "the bandits' camp", props: ['straw', 'lantern', 'crate', 'sack', 'cot'] },
    { id: 'smugglers-store', name: "the smugglers' store", props: ['crate', 'crate', 'barrel', 'lantern'] },
    { id: 'burrow', name: 'a burrow', props: ['rubble', 'bones', 'nest'] },
    { id: 'rat-nest', name: 'the nest', props: ['nest', 'bones', 'straw', 'nest'] },
    { id: 'web-hall', name: 'the webbed cavern', props: ['web', 'web', 'bones'] },
    { id: 'refuge', name: 'a dry ledge', props: ['straw', 'jar', 'candle'] },
    { id: 'collapse', name: 'the rockfall', props: ['rubble', 'rubble', 'rubble'] },
    { id: 'stand', name: 'the barricade', props: ['beam', 'crate', 'bones'] },
    { id: 'flooded-way', name: 'the flooded way', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'ward-niche', name: 'a carved niche', props: ['bricks', 'candle'] },
    { id: 'hoard-nook', name: 'the hoard', props: ['chest', 'sack', 'jar'] },
  ],
  builders: [
    { id: 'stream', text: 'A stream cut {place} out of the hill over more years than anyone can count; it still runs in the low passages.', uses: ['mouth', 'stream-cut', 'drip-hall', 'pool'], patterns: ['low-road', 'twin-paths', 'seen-goal'], weight: 1.3 },
    { id: 'fault', text: 'A crack opened in the hill in some old shaking of the land; {place} runs along it, high and narrow.', uses: ['mouth', 'gallery', 'cavern', 'crawl'], patterns: ['gallery', 'drop-in', 'side-loop'] },
    { id: 'miners', text: 'Copper miners followed a green vein into {place} and widened what they found, until the vein ran out.', uses: ['mouth', 'workings', 'ore-face', 'gallery'], patterns: ['lock-key', 'collapsed-way', 'barred-return'] },
    { id: 'hermit', text: 'A hermit lived a long life in {place} and walled off a few dry corners against the damp.', uses: ['mouth', 'hermit-cell', 'drip-hall'], patterns: ['side-loop', 'hidden-shortcut', 'guarded-short'], weight: 0.8 },
    { id: 'herders', text: 'Herders wintered their flocks in {place} in the hard years and penned its chambers off with stones.', uses: ['mouth', 'pen', 'cavern', 'pool'], patterns: ['twin-paths', 'ring-hall', 'gambit'] },
  ],
  older: [
    { id: 'painted', text: 'Deep in it, a people older than any in the valley left hand-prints in red earth and beasts running across the rock.', uses: ['painted-chamber'], patterns: ['seen-key', 'split-descent'], traces: ['jar'] },
    { id: 'spring', text: 'Below, a spring rises into a pool that never freezes, and the cold comes up with it.', uses: ['spring'], patterns: ['low-road', 'drop-in'], traces: ['puddle'] },
    { id: 'old-workings', text: 'Under the natural cave run workings older than the town, cut with tools of bronze.', uses: ['workings'], patterns: ['secret-key', 'gallery', 'collapsed-way'], traces: ['beam'] },
    { id: 'bone-pit', text: 'A pit below is full of the bones of beasts that fell in before there was anyone to see it.', uses: ['bone-pit'], patterns: ['drop-in', 'seen-goal'], traces: ['bones'] },
  ],
  troubles: [
    { id: 'collapse', text: 'Part of the roof came down one winter, and a gallery fell into the one below.', uses: ['collapse'], patterns: ['drop-in', 'gallery', 'collapsed-way'], traces: ['rubble'] },
    { id: 'rockfall', text: 'A rockfall closed the old way in; the way now is the one the water found.', uses: ['collapse'], patterns: ['collapsed-way', 'false-goal', 'bolt-hole'], traces: ['rubble'] },
    { id: 'flood', text: 'In a wet year the water rose and drowned the low passages, and it has not quite gone down.', uses: ['flooded-way'], patterns: ['low-road', 'seen-goal'], traces: ['puddle'] },
    { id: 'lost', text: 'A shepherd boy went in after a lamb and was never found; nobody from town has gone in since.', uses: [], patterns: ['twin-paths', 'side-loop', 'hidden-shortcut'], traces: ['lantern'] },
    { id: 'sealed', text: 'Someone walled up the inner chambers long ago, and the wall has been broken from the inside.', uses: ['stand'], patterns: ['secret-key', 'barred-return', 'lock-key'], traces: ['bricks'] },
  ],
  // Most caves are lived in (Arnd: "of course caves are usually populated"); one in five stands empty, a sight
  // to explore to its end, where an older people left something.
  empty: {
    share: 0.2,
    def: {
      id: 'nobody', text: 'Nothing lives in {place} that anyone knows of. It goes deeper into the rock than anyone from the valley has gone.', uses: ['drip-hall', 'pool'], lair: 'painted-chamber',
      patterns: ['seen-goal', 'gallery', 'split-descent', 'side-loop'], traces: ['jar'],
      signs: ['Children dare each other to go in as far as the light reaches. None has gone further.', 'There is a wind out of it in summer, cold as a cellar, and a sound like water a long way down.'],
    },
  },
  dwellers: [
    {
      id: 'wolves', text: 'A wolf pack dens in {place} and hunts the valley from it.', uses: [], ...who('wolves'), lair: 'den', crowd: 2, danger: 16,
      patterns: ['twin-paths', 'guarded-short', 'bolt-hole', 'gambit'], traces: ['bones'],
      signs: ['Two ewes taken from the high pasture in a week, and the tracks lead up into the rocks.', 'At night the howling comes from the hill, and the dogs will not go out.'],
    },
    {
      id: 'goblins', text: 'A band of goblins moved into {place} and raid the farms by night.', uses: ['warren'], ...who('goblins'), lair: 'warren', crowd: 3, danger: 19,
      patterns: ['ring-hall', 'false-goal', 'hidden-shortcut', 'barred-return'], traces: ['straw', 'sack'],
      signs: ['The hens are gone, and there are small bare footprints round the coop.', 'Smoke comes out of the rocks on the hill, and singing in no tongue anyone knows.'],
      surprise: 'One of the goblins speaks broken Common and begs for mercy.',
    },
    {
      id: 'smugglers', text: "Smugglers keep their goods in {place}, well out of the reeve's sight.", uses: ['smugglers-store'], ...who('smugglers'), lair: 'smugglers-store', crowd: 1, danger: 17,
      patterns: ['hidden-shortcut', 'secret-key', 'seen-key', 'side-loop'], traces: ['lantern', 'crate'],
      signs: ['Mules go up the hill by night with nothing on them and come down loaded.', 'There is good wine at the inn that nobody paid duty on.'],
    },
    {
      id: 'highwaymen', text: 'The bandits who rob the road lie up in {place} between jobs.', uses: ['camp'], ...who('highwaymen'), lair: 'camp', crowd: 2, danger: 20,
      patterns: ['bolt-hole', 'barred-return', 'guarded-short', 'seen-goal'], traces: ['lantern', 'crate'],
      signs: ['A carter was robbed on the hill road, and the men went up into the rocks after.', 'There is a light in the rocks at night, and horses where no farm keeps them.'],
    },
    {
      id: 'rats', text: 'Rats came in out of the cold and found the dark of {place} to their liking; some have grown huge.', uses: ['burrow'], ...who('rats'), lair: 'rat-nest', crowd: 3, danger: 10,
      patterns: ['collapsed-way', 'side-loop', 'low-road', 'bolt-hole'], traces: ['nest', 'bones'],
      signs: ['The rats in the barns all came down from the hill, and they keep coming.', 'Something with a long naked tail as thick as a thumb ran out of the rocks.'],
    },
    {
      id: 'spiders', text: 'Giant spiders crept up from the dark below and spun the inner caverns of {place} shut.', uses: [], ...who('spiders'), lair: 'web-hall', crowd: 1, danger: 24,
      patterns: ['gallery', 'drop-in', 'seen-goal', 'split-descent'], traces: ['web', 'bones'],
      signs: ['A lamb went missing by the rocks, and there was silk on the thorns where it was last seen.', 'The mouth of the cave is grey with webs every morning.'],
    },
    {
      id: 'ghoul', text: 'Something that eats the dead came up into {place} from the deep places.', uses: [], ...who('ghoul'), lair: 'bone-pit', crowd: 1, danger: 26,
      patterns: ['gallery', 'lock-key', 'seen-key', 'drop-in'], traces: ['bones'], with: ['bone-pit', 'lost', 'painted'],
      signs: ['The grave of the drover buried last spring is open, and the tracks go up the hill.', 'A smell of the grave comes out of the rocks when the wind is from the hill.'],
    },
  ],
};
