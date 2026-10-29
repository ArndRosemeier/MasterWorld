/**
 * Bandit hideouts of the classic setting (C6c, plan 4.5: "bandits take a waystation"): a few rooms dug into a
 * hillside and shored with timber, where a band lies up between jobs, keeps what it took and drinks it. The
 * VGM asks for one when a band needs somewhere to be (`dungeonFor`, purpose 'hideout'); it is no lead of its
 * own. Out on the land in the hills, the mouth a timbered door in the slope; inside built, not carved.
 */
import type { CellarLore } from '../contract';
import { who } from './encounters';
import { CELLAR_SPACE } from './cellar';

export const hideout: CellarLore = {
  form: {
    stands: 'slope', ring: [500, 1800], called: 'the hideout {dir} of the town', word: 'hideout', purposes: ['hideout'], shell: 'mouth', clearing: { back: 5, r: 14 }, pieces: ['cellar'],
    space: { ...CELLAR_SPACE, entrance: [3, 3], arriveMid: true },
  },
  words: {
    quiet: 'Nobody is left in {place}. Whoever they robbed will want to know.',
    thanks: '{place} is empty? Then we can drive the road again. Take {coins}, and our thanks.',
    came: 'Not one of them left! I saw it all go quiet from outside. We can drive the road again. Take {coins}, and our thanks.',
  },
  uses: [
    { id: 'door', name: 'the hidden door', props: ['beam', 'rubble', 'lantern'] },
    { id: 'guardroom', name: 'the guardroom', props: ['table', 'barrel', 'lantern', 'crate'] },
    { id: 'bunks', name: 'the bunk room', props: ['cot', 'cot', 'straw', 'sack'] },
    { id: 'loot-store', name: 'the loot store', props: ['crate', 'crate', 'chest', 'sack'] },
    { id: 'tap', name: 'the drinking hole', props: ['barrel', 'barrel', 'table', 'candle'] },
    { id: 'stable', name: 'the dug stable', props: ['straw', 'straw', 'bin', 'beam'] },
    { id: 'chief', name: "the chief's room", props: ['cot', 'table', 'chest', 'candle'] },
    { id: 'pen', name: 'the pen', props: ['straw', 'bones', 'beam'] },
    { id: 'well', name: 'the old well', props: ['puddle', 'bricks', 'jar'] },
    { id: 'collapse', name: 'the fallen gallery', props: ['rubble', 'rubble', 'beam'] },
    { id: 'stand', name: 'the barricade', props: ['beam', 'crate', 'barrel'] },
    { id: 'hoard-nook', name: 'the hoard', props: ['chest', 'sack', 'jar'] },
    { id: 'refuge', name: 'a dry corner', props: ['straw', 'jar', 'candle'] },
    { id: 'burrow', name: 'a burrow', props: ['rubble', 'bones', 'nest'] },
    { id: 'rat-nest', name: 'the nest', props: ['nest', 'bones', 'straw', 'nest'] },
  ],
  builders: [
    { id: 'diggers', text: 'A band dug {place} into the hill themselves and shored it with stolen timber.', uses: ['door', 'bunks', 'loot-store', 'guardroom'], patterns: ['bolt-hole', 'guarded-short', 'side-loop'] },
    { id: 'charcoal', text: 'Charcoal burners once lived in {place} through the winters; the band found it empty and made it theirs.', uses: ['door', 'bunks', 'tap', 'stable'], patterns: ['twin-paths', 'hidden-shortcut', 'seen-goal'] },
    { id: 'drovers', text: 'Drovers built {place} as a stop on the hill road, with a stable cut into the slope; the road moved and the stop was forgotten.', uses: ['door', 'stable', 'guardroom', 'tap'], patterns: ['ring-hall', 'barred-return', 'gambit'], weight: 0.8 },
  ],
  older: [
    { id: 'well', text: 'Below it an older well, lined with stone, goes down into the hill.', uses: ['well'], patterns: ['drop-in', 'seen-key'], traces: ['bricks'] },
    { id: 'old-workings', text: 'The diggers broke into old workings, cut with tools of bronze, and used them as a back way.', uses: ['collapse'], patterns: ['secret-key', 'collapsed-way'], traces: ['beam'] },
  ],
  troubles: [
    { id: 'cave-in', text: 'A gallery came down on two of the band one wet spring; they never dug them out.', uses: ['collapse'], patterns: ['collapsed-way', 'false-goal'], traces: ['rubble'] },
    { id: 'falling-out', text: 'The band fell out over a share, and the one who lost barred himself in with the loot.', uses: ['stand', 'hoard-nook'], patterns: ['lock-key', 'barred-return'], traces: ['beam'] },
    { id: 'sold-out', text: 'Someone sold the band to the reeve once; they keep a way out nobody in town knows of.', uses: [], patterns: ['bolt-hole', 'hidden-shortcut'], traces: ['lantern'] },
  ],
  dwellers: [
    {
      id: 'highwaymen', text: 'The bandits who rob the road lie up in {place} between jobs.', uses: ['loot-store'], ...who('highwaymen'), lair: 'chief', crowd: 2, danger: 20,
      patterns: ['bolt-hole', 'barred-return', 'guarded-short', 'seen-goal'], traces: ['lantern', 'crate'],
      signs: ['A carter was robbed on the hill road, and the men went up into the brush after.', 'Smoke comes out of the hillside where nobody lives.'],
    },
    {
      id: 'smugglers', text: "Smugglers keep their goods in {place}, well out of the reeve's sight.", uses: ['loot-store'], ...who('smugglers'), lair: 'loot-store', crowd: 1, danger: 17,
      patterns: ['hidden-shortcut', 'secret-key', 'seen-key', 'side-loop'], traces: ['lantern', 'crate'],
      signs: ['Mules go up the hill by night with nothing on them and come down loaded.', 'There is good wine at the inn that nobody paid duty on.'],
    },
    {
      id: 'rats', text: 'The band is gone; the rats that ate their stores grew fat and stayed in {place}.', uses: [], ...who('rats'), lair: 'rat-nest', crowd: 3, danger: 10,
      patterns: ['collapsed-way', 'side-loop', 'low-road'], traces: ['nest', 'bones'],
      signs: ['The rats in the barns all came down from the hill.', 'Something gnawed through a sack of grain overnight and left a trail up the slope.'],
    },
  ],
};
