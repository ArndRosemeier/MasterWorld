/**
 * Sea caves of the classic setting (S8, plan 8 and 13): the sea cut them into the slopes over the shore, and its
 * lowest storey still stands under water (`flood`): the way on lies through drowned passages, dived with breath, a
 * spell, a potion or the otter, with air caught under the roofs of the drowned chambers. Smugglers and wreckers use
 * them, the drowned dead walk in some, and some are empty, a sight to explore. The mouth is rock on the slope with
 * the water just below it; inside, the rock is carved, as in a cave.
 */
import type { CellarLore } from '../contract';
import { who } from './encounters';
import { cave } from './cave';

/** How deep the lowest storey stands under water (m over its floor): over its ways' roofs, under its chambers'. */
const DROWNED = 3.6;

export const seaCave: CellarLore = {
  form: {
    stands: 'shore', ring: [400, 1800], called: 'the sea cave {dir} of the town', word: 'sea cave', purposes: ['lead', 'hideout'], shell: 'mouth', clearing: cave.form.clearing, pieces: ['cave'],
    space: { ...cave.form.space, maxRooms: 11, flood: DROWNED },
  },
  words: {
    quiet: 'Nothing stirs in {place} now but the sea. The household who told you of it will want to hear.',
    thanks: '{place} is quiet? Then the boats can put in by the rocks again. Take {coins}, with our thanks.',
    came: 'Not a sound in there but the water, so I went down. The boats can put in by the rocks again! Take {coins}, with our thanks.',
  },
  uses: [
    { id: 'mouth', name: 'the sea cave mouth', props: ['rubble', 'puddle', 'bones'] },
    { id: 'gallery', name: 'the long gallery', props: ['rubble', 'puddle', 'rubble'] },
    { id: 'cavern', name: 'the great sea cavern', props: ['rubble', 'puddle', 'puddle', 'bones'] },
    { id: 'drip-hall', name: 'the dripping hall', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'pool', name: 'the tide pool', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'crawl', name: 'the low crawl', props: ['rubble', 'rubble'] },
    { id: 'blowhole', name: 'the blowhole', props: ['rubble', 'puddle'] },
    { id: 'wrack-hall', name: 'the hall of wrack', props: ['beam', 'rubble', 'bones'] },
    { id: 'drowned-hall', name: 'the drowned hall', props: ['rubble', 'bones', 'chest'] },
    { id: 'sump', name: 'the sump', props: ['rubble', 'puddle'] },
    { id: 'landing', name: "the boats' landing", props: ['beam', 'crate', 'lantern'] },
    { id: 'smugglers-store', name: "the smugglers' store", props: ['crate', 'crate', 'barrel', 'lantern'] },
    { id: 'wreckers-loft', name: "the wreckers' loft", props: ['lantern', 'crate', 'sack', 'cot'] },
    { id: 'shrine', name: 'the drowned shrine', props: ['jar', 'candle', 'bones'] },
    { id: 'bone-pit', name: 'the bone pit', props: ['bones', 'bones', 'rubble'] },
    { id: 'shaft', name: 'the hall under the shaft', props: ['rubble', 'bones', 'straw'] },
    { id: 'burrow', name: 'a burrow', props: ['rubble', 'bones', 'nest'] },
    { id: 'rat-nest', name: 'the nest', props: ['nest', 'bones', 'straw', 'nest'] },
    { id: 'refuge', name: 'a dry ledge', props: ['straw', 'jar', 'candle'] },
    { id: 'collapse', name: 'the rockfall', props: ['rubble', 'rubble', 'rubble'] },
    { id: 'stand', name: 'the barricade', props: ['beam', 'crate', 'bones'] },
    { id: 'hoard-nook', name: 'the hoard', props: ['chest', 'sack', 'jar'] },
  ],
  builders: [
    { id: 'surf', text: 'The sea cut {place} out of the rock over more years than anyone can count, and its lowest ways are its still.', uses: ['mouth', 'gallery', 'pool', 'drowned-hall'], patterns: ['low-road', 'twin-paths', 'seen-goal'], weight: 1.3 },
    { id: 'blowhole', text: 'In a storm the sea comes up through {place} and out of a hole in the rock above, white as smoke.', uses: ['mouth', 'blowhole', 'cavern', 'sump'], patterns: ['gallery', 'drop-in', 'side-loop'] },
    { id: 'landing', text: 'Fishers once ran their boats into {place} at high water to land a catch out of the weather.', uses: ['mouth', 'landing', 'wrack-hall', 'pool'], patterns: ['side-loop', 'hidden-shortcut', 'ring-hall'] },
  ],
  older: [
    { id: 'shrine', text: 'Deep in it, below the water, a people who prayed to the sea left a shrine, and their offerings lie round it still.', uses: ['shrine'], patterns: ['seen-key', 'split-descent'], traces: ['jar'] },
    { id: 'wrack', text: 'The sea carries the wreckage of every ship lost on the coast into {place}, and leaves it in the drowned halls below.', uses: ['wrack-hall', 'drowned-hall'], patterns: ['low-road', 'drop-in'], traces: ['beam'] },
  ],
  troubles: [
    { id: 'rockfall', text: 'A rockfall closed the old way in; the way now is the one the water found.', uses: ['collapse'], patterns: ['collapsed-way', 'false-goal', 'bolt-hole'], traces: ['rubble'] },
    { id: 'drowned', text: 'Two boys went in at low water for the gulls\' eggs and the sea came in behind them; it gave them back a week later.', uses: [], patterns: ['twin-paths', 'side-loop', 'hidden-shortcut'], traces: ['lantern'] },
    { id: 'sealed', text: 'Someone walled up the inner chambers long ago, and the wall has been broken from the inside.', uses: ['stand'], patterns: ['secret-key', 'barred-return', 'lock-key'], traces: ['beam'] },
  ],
  empty: {
    share: 0.25,
    def: {
      id: 'nobody', text: 'Nothing lives in {place} that anyone knows of. It goes down under the sea further than any swimmer from the harbour has gone.', uses: ['pool', 'drowned-hall'], lair: 'shrine',
      patterns: ['seen-goal', 'gallery', 'split-descent', 'side-loop'], traces: ['jar'],
      signs: ['At the turn of the tide the cave by the rocks breathes like a sleeper.', 'Old Nan says there are lights under the water in the sea cave on still nights.'],
    },
  },
  dwellers: [
    {
      id: 'smugglers', text: "Smugglers run their boats into {place} at high water and keep their goods in its dry halls, well out of the reeve's sight.", uses: ['landing'], ...who('smugglers'), lair: 'smugglers-store', crowd: 2, danger: 17,
      patterns: ['hidden-shortcut', 'secret-key', 'seen-key', 'side-loop'], traces: ['lantern', 'crate'],
      signs: ['A boat with no lantern put in under the rocks last night and was gone by dawn.', 'There is good brandy at the inn that nobody paid duty on.'],
    },
    {
      id: 'wreckers', text: 'Wreckers who show false lights to the ships on stormy nights keep what the sea brings them in {place}.', uses: ['wrack-hall'], ...who('highwaymen'), lair: 'wreckers-loft', crowd: 2, danger: 21,
      patterns: ['bolt-hole', 'barred-return', 'guarded-short', 'seen-goal'], traces: ['lantern', 'beam'],
      signs: ['A light was seen on the rocks the night the trader went down, where no light should be.', 'Men came up from the shore at dawn with sacks, and none of them is a fisher.'],
    },
    {
      id: 'rats', text: 'Rats from the ships came ashore and found the dark of {place} to their liking; some have grown huge.', uses: ['burrow'], ...who('rats'), lair: 'rat-nest', crowd: 3, danger: 10,
      patterns: ['collapsed-way', 'side-loop', 'low-road', 'bolt-hole'], traces: ['nest', 'bones'],
      signs: ['The rats on the quay all come up from the rocks, and they keep coming.', 'Something with a long naked tail as thick as a thumb ran out of the sea cave.'],
    },
    {
      id: 'drowned-dead', text: 'The drowned from the wrecks on the coast do not lie still in {place}; they walk its dry halls.', uses: [], ...who('the-dead'), lair: 'bone-pit', crowd: 2, danger: 22,
      patterns: ['gallery', 'lock-key', 'seen-key', 'drop-in'], traces: ['bones'], with: ['wrack', 'drowned'],
      signs: ['A fisher saw a sailor walk up out of the sea into the cave, and the man had been drowned a month.', 'Something knocks on the hulls of the boats moored by the rocks at night.'],
    },
  ],
};
