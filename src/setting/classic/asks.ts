/**
 * What a household asks of the hero about its place (D62, phase Q): clearing it is one verb of several. Each
 * kind names one thing, and only that thing counts as done. The VGM picks the kind (vgm/asks.ts) and keeps
 * from giving the same kind twice in a row.
 */
import type { AskDef } from '../contract';

export const asks: readonly AskDef[] = [
  {
    id: 'clear',
    verb: 'clear',
    weight: 2,
    words: {
      told: [
        'Whoever makes it safe down there will not go unpaid.',
        'We cannot go on like this. If someone would deal with it, we would pay what we can.',
        'Nobody here has the stomach to go and see. Somebody with a blade might.',
      ],
      topic: '{place} is safe again.',
      note: 'It is quiet there now. {name} of {house} will want to hear it, and pay what the trouble was worth.',
      thanks: 'Quiet at last? Then we sleep tonight. Here, {coins}; you have earned every one.',
    },
  },
  {
    id: 'heirloom',
    verb: 'fetch',
    weight: 1.5,
    things: [
      { item: 'locket', name: 'the {family} locket', lore: 'Silver, with a lark on the lid and a curl of hair inside. It belongs to the {family} family.' },
      { item: 'signet', name: 'the {family} signet ring', lore: 'A heavy ring with a worn seal. The {family} family sealed their letters with it for three lifetimes.' },
      { item: 'old-blade', name: 'the {family} sword', lore: 'An old sword in a cracked scabbard, notched and kept. It hung over the {family} hearth for as long as anyone remembers.' },
      { item: 'deed-box', name: 'the {family} deed box', lore: 'A small iron box with the deeds to the {family} land in it. Without it they own nothing on paper.' },
    ],
    words: {
      told: [
        'It is not the trouble I mind most. {thing} is down there, and it must come back to us.',
        'Bring back {thing}, that is all I ask. What else is down there can rot.',
        '{thing} was in there when it all began. Whatever else you do, bring it back.',
      ],
      topic: 'I have brought back {thing}.',
      note: 'I have {thing}. {name} of {house} will want it back, and pay for it.',
      thanks: '{thing}! I never thought to hold it again. Here, {coins}, and you are welcome at our table.',
      missing: 'Then where is it? Come back when you have {thing} in your hands.',
    },
  },
];
