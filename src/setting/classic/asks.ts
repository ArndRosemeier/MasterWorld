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
  {
    id: 'lost',
    verb: 'lost',
    weight: 1.2,
    lived: true,
    lost: {
      alive: 0.6,
      found: 'You came for me? I heard them all round me in the dark, and I did not dare move. I can walk. I know the way out from here.',
      dead: {
        topic: 'I found what was left of {who}.',
        note: 'I have {thing}. {name} of {house} must hear what became of {who}.',
        thanks: 'So that is the end of it. At least we know, and we can bury what is left. Take this, {coins}. You went where none of us would.',
      },
    },
    things: [
      { item: 'satchel', name: "{who}'s satchel", lore: 'Torn at the strap and dark with damp. {who} carried it everywhere.' },
      { item: 'woollen-cap', name: "{who}'s cap", lore: 'A knitted cap, trodden into the dirt. Someone at home made it for {who}.' },
      { item: 'whittled-knife', name: "{who}'s knife", lore: 'A small knife with a whittled handle and initials cut into it.' },
    ],
    words: {
      told: [
        '{who} went down after the noises and has not come back. Please, find {who}.',
        '{who} said they would see for themselves what it was. That was the day before yesterday.',
        'It is {who} I am afraid for, not the house. {who} went in there, and nobody has seen them since.',
      ],
      topic: '{who} is home again.',
      note: '{who} is on the way home. {name} of {house} will want to see you.',
      thanks: '{who} walked in at the door as if nothing had happened! I cannot thank you enough. Here, {coins}, and more if we had it.',
      missing: 'You say you know what became of {who}? Then show me something of theirs, or I will not believe it.',
    },
  },
  {
    id: 'breach',
    verb: 'seal',
    weight: 1.2,
    lived: true,
    words: {
      told: [
        'They come up through a hole in the wall down there. Wall it up again, that is all we ask.',
        'Something broke through from behind the old wall. Close it, and whatever is behind can stay there.',
        'Kill them if you must, but it is the hole they came through that matters. Stop it up, or more will come.',
      ],
      topic: 'The breach in {place} is walled up.',
      note: 'I walled up the breach. {name} of {house} will want to hear that nothing more comes through.',
      thanks: 'Walled up, stone on stone? Then nothing more comes through. Here, {coins}, and well earned.',
    },
  },
  {
    id: 'parley',
    verb: 'parley',
    weight: 1.2,
    lived: true,
    dwellers: ['smugglers', 'goblins', 'grave-robbers', 'highwaymen', 'wreckers'],
    parley: {
      pact: 0.45,
      cost: [12, 30],
      terms: {
        price: 'You want us gone? Fair enough. {coins}, and we pack up and leave tonight.',
        pact: 'We go where we please. But give us your word nobody comes down here after us, and we leave that household be.',
      },
      struck: {
        price: 'Done. We are gone by morning. Nobody needs to bleed for it.',
        pact: 'Your word, then. We keep to ours: that household has nothing more to fear from us.',
      },
      short: 'You have not got it. Come back when you have {coins}, and do not come with your hand on that blade.',
      broken: 'I struck first in {place}. There is no talking to them now.',
    },
    words: {
      told: [
        'I do not want blood spilled under my own roof. Talk to them. Whatever they want, let it be over.',
        'They are not beasts down there; they can be talked to. Get them to leave us be, and no killing.',
        'Go and speak with them. If it comes to fighting they will only come back angrier, or their friends will.',
      ],
      topic: 'I have spoken with those in {place}. They will trouble you no more.',
      note: 'Terms struck in {place}, and no blood spilled. {name} of {house} will want to hear it.',
      thanks: 'Talked them round, and nobody hurt? That is worth more than any killing. Here, {coins}.',
    },
  },
];
