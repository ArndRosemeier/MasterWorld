/**
 * Barrows of the classic setting (plan 8, 12.1): burial mounds out on the land, raised by the peoples who
 * lived in the valley long before the town, and older than the old realm some of them. What lies under
 * them, what went wrong, and what stirs there now that the magic is coming back after the Fading.
 * Fantasy dead and old peoples' rites only: no real-world faith, no churchyard.
 */
import type { CellarLore } from '../contract';
import { who } from './encounters';
import { CELLAR_SPACE } from './cellar';

export const barrow: CellarLore = {
  form: { stands: 'rise', ring: [550, 1300], called: 'the barrow {dir} of the town', word: 'barrow', purposes: ['lead'], shell: 'mound', clearing: { back: 4, r: 13 }, space: CELLAR_SPACE },
  words: {
    enter: 'You stoop under the lintel and go down into {place}.',
    quiet: 'All is still in {place} now. The household who told you of it will want to hear.',
    thanks: 'You went into {place} and walked out again? Here, {coins}, and our thanks with it.',
  },
  uses: [
    { id: 'forecourt', name: 'the passage in', props: ['rubble', 'candle', 'bones', 'jar'] },
    { id: 'cairn-passage', name: 'the cairn passage', props: ['rubble', 'beam', 'bones'] },
    { id: 'burial-hall', name: 'the burial hall', props: ['bones', 'jar', 'chest', 'candle'] },
    { id: 'ossuary', name: 'the bone room', props: ['bones', 'bones', 'shelf', 'bones'] },
    { id: 'grave-goods', name: 'the room of grave goods', props: ['chest', 'jar', 'rack', 'crate'] },
    { id: 'offering-room', name: 'the offering room', props: ['jar', 'candle', 'table', 'jar'] },
    { id: 'horse-burial', name: 'the horse grave', props: ['bones', 'straw', 'bones'] },
    { id: 'chieftain-tomb', name: "the chieftain's tomb", props: ['chest', 'bones', 'candle', 'jar'] },
    { id: 'older-graves', name: 'the older graves', props: ['bones', 'rubble', 'jar'] },
    { id: 'spring-chamber', name: 'the walled spring', props: ['puddle', 'bricks', 'puddle'] },
    { id: 'flint-pits', name: 'the flint pits', props: ['rubble', 'rubble', 'bones'] },
    { id: 'robbers-camp', name: "the robbers' camp", props: ['straw', 'lantern', 'crate', 'sack'] },
    { id: 'bier-hall', name: 'the hall of the bier', props: ['bones', 'candle'] },
    { id: 'burrow', name: 'a burrow', props: ['rubble', 'bones', 'nest'] },
    { id: 'rat-nest', name: 'the nest', props: ['nest', 'bones', 'straw', 'nest'] },
    { id: 'web-hall', name: 'the webbed hall', props: ['web', 'web', 'bones'] },
    { id: 'refuge', name: 'a dry little niche', props: ['stool', 'candle', 'jar'] },
    { id: 'collapse', name: 'the fallen passage', props: ['rubble', 'beam', 'rubble'] },
    { id: 'stand', name: 'the barricaded room', props: ['beam', 'crate', 'bones'] },
    { id: 'flooded-way', name: 'the flooded way', props: ['puddle', 'puddle', 'rubble'] },
    { id: 'ward-niche', name: 'a ward niche', props: ['bricks', 'candle'] },
    { id: 'hoard-nook', name: 'the hoard', props: ['chest', 'sack', 'jar'] },
  ],
  builders: [
    { id: 'hill-chiefs', text: 'The hill-folk raised {place} over their chieftains, long before the old realm.', uses: ['forecourt', 'burial-hall', 'grave-goods', 'chieftain-tomb'], patterns: ['lock-key', 'seen-goal', 'ring-hall'] },
    { id: 'horse-lords', text: 'Horse-lords of the plains buried their dead in {place}, each with a horse at their feet.', uses: ['forecourt', 'horse-burial', 'burial-hall', 'offering-room'], patterns: ['twin-paths', 'gallery', 'gambit'] },
    { id: 'wardens', text: 'The wardens of the old realm laid their fallen in {place} and set ward-stones at its door.', uses: ['forecourt', 'ossuary', 'offering-room', 'burial-hall'], patterns: ['secret-key', 'barred-return', 'seen-key'] },
    { id: 'family-cairn', text: 'A family of the valley buried their own in {place} for a dozen generations.', uses: ['cairn-passage', 'older-graves', 'ossuary'], patterns: ['twin-paths', 'side-loop', 'barred-return'], weight: 1.5 },
  ],
  older: [
    { id: 'spring', text: 'Beneath it a spring was walled off; the barrow-builders feared what came up with the water.', uses: ['spring-chamber'], patterns: ['low-road', 'drop-in'], traces: ['puddle'] },
    { id: 'flint-mine', text: 'It was dug into flint pits older than any grave in the valley.', uses: ['flint-pits'], patterns: ['collapsed-way', 'split-descent', 'gallery'], traces: ['rubble'] },
    { id: 'older-graves', text: 'Older graves lie beneath it; its builders broke into them and built on.', uses: ['older-graves'], patterns: ['drop-in', 'secret-key'], traces: ['bones'] },
  ],
  troubles: [
    { id: 'robbed', text: 'Grave-robbers dug in from the side three winters ago; not all of them came out.', uses: ['collapse'], patterns: ['bolt-hole', 'hidden-shortcut', 'collapsed-way'], traces: ['lantern', 'rubble'] },
    { id: 'collapse', text: 'The mound slumped in a wet year, and a passage fell in.', uses: ['collapse'], patterns: ['collapsed-way', 'drop-in', 'gallery'], traces: ['rubble', 'beam'] },
    { id: 'flood', text: 'Water found its way in from the hill and stands in the low rooms.', uses: [], patterns: ['low-road', 'seen-goal'], traces: ['puddle'] },
    { id: 'sealed', text: 'Its keepers sealed the inner rooms with stones and spoken words, and the words have worn thin.', uses: [], patterns: ['secret-key', 'hidden-shortcut', 'lock-key'], traces: ['bricks'] },
    { id: 'wards-taken', text: 'Someone carted the ward-stones from its door to wall a sheepfold.', uses: [], patterns: ['barred-return', 'guarded-short', 'seen-key'], traces: ['bricks'] },
  ],
  dwellers: [
    {
      id: 'restless-dead', text: 'Since the magic began to come back, the dead of {place} do not lie still.', uses: [], ...who('the-dead'), lair: 'chieftain-tomb', crowd: 2, danger: 18,
      patterns: ['gallery', 'lock-key', 'seen-key', 'ring-hall'], traces: ['bones'],
      signs: ['The sheep will not graze near it any more, and at dusk something walks along the top of the mound.', 'There was a light in the doorway at midnight, cold and green, and a sound like stones grinding.'],
    },
    {
      id: 'grave-robbers', text: 'A band of grave-robbers have made {place} their camp and dig for what the dead took with them.', uses: ['robbers-camp'], ...who('smugglers'), lair: 'robbers-camp', crowd: 1, danger: 17,
      patterns: ['hidden-shortcut', 'barred-return', 'false-goal', 'bolt-hole'], traces: ['lantern', 'crate'],
      signs: ['There is smoke from the mound some mornings, and fresh spoil by the doorway.', 'Two strangers bought picks and rope at the smithy and paid in old coin.'],
    },
    {
      id: 'rats', text: 'Rats found the robbers\' holes and grew fat in {place} on what the dead were given.', uses: ['burrow'], ...who('rats'), lair: 'rat-nest', crowd: 3, danger: 10,
      patterns: ['collapsed-way', 'side-loop', 'low-road', 'bolt-hole'], traces: ['nest', 'bones'],
      signs: ['The dog came back from the mound with a bone in its mouth, and it was not an animal bone.', 'Rats as big as cats run from the barrow into the fields at night.'],
    },
    {
      id: 'spiders', text: 'Giant spiders crept in from the dark below and spun the inner rooms of {place} shut.', uses: [], ...who('spiders'), lair: 'web-hall', crowd: 1, danger: 24,
      patterns: ['gallery', 'drop-in', 'seen-goal', 'split-descent'], traces: ['web', 'bones'],
      signs: ['A shepherd went in after a lamb and came out grey with silk.', 'The doorway is webbed over every morning, however often the boys knock it down.'],
    },
    {
      id: 'barrow-lord', text: 'The chieftain of {place} has woken, and his household rises with him.', uses: [], ...who('ghoul-and-bones'), lair: 'chieftain-tomb', crowd: 1, danger: 29,
      patterns: ['gallery', 'lock-key', 'seen-key'], traces: ['bones'], with: ['hill-chiefs', 'sealed', 'wards-taken'],
      signs: ['It is cold by the mound even at noon, and the grass on it has gone white.', 'At night something calls from inside it, slow, in a tongue older than the town.'],
    },
  ],
};
