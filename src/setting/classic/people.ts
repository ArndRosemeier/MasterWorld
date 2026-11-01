/**
 * The classic setting's townsfolk: their names by people, and how they talk (plan 9.1). Invented names
 * with an old-country ring; dwarves short and hard, halflings homely, elves long.
 */
import type { NamesDef, TalkDef } from '../contract';

export const names: Record<string, NamesDef> = {
  human: {
    female: ['Mara', 'Edda', 'Wenna', 'Alys', 'Brienne', 'Hild', 'Mirren', 'Tamsin', 'Elsa', 'Gwen', 'Isolde', 'Rowan', 'Saffi', 'Ysolt', 'Nell', 'Orla', 'Kestra', 'Lida'],
    male: ['Tobin', 'Aldric', 'Bram', 'Cedric', 'Dunstan', 'Garrick', 'Hal', 'Jory', 'Osric', 'Piers', 'Roderic', 'Wat', 'Emeric', 'Fenn', 'Lorcan', 'Merrick', 'Oswin', 'Tam'],
    family: ['Hollin', 'Ashby', 'Thorne', 'Wendle', 'Marsh', 'Crane', 'Fallow', 'Hearth', 'Mossop', 'Ravel', 'Stoneway', 'Tilley', 'Wick', 'Brook', 'Harrow', 'Lark', 'Pell', 'Vane'],
  },
  dwarf: {
    female: ['Brunna', 'Dagny', 'Helga', 'Kalda', 'Ragna', 'Sigrun', 'Thora', 'Vigdis', 'Ylva', 'Gerd'],
    male: ['Borin', 'Durgan', 'Fargrim', 'Grundi', 'Harbek', 'Kildrak', 'Morgran', 'Orsik', 'Thrain', 'Vondal'],
    family: ['Ironfoot', 'Deepdelve', 'Coalbeard', 'Stonehelm', 'Anvilmar', 'Copperhand', 'Gravelbrow', 'Hammerfell'],
  },
  halfling: {
    female: ['Rosie', 'Daisy', 'Marigold', 'Poppy', 'Tilly', 'Hazel', 'Primula', 'Bell', 'Lobelia', 'Myrtle'],
    male: ['Pip', 'Milo', 'Tolly', 'Fosco', 'Hob', 'Ned', 'Perrin', 'Rufus', 'Sam', 'Wilco'],
    family: ['Underbough', 'Goodbarrel', 'Greenhill', 'Tealeaf', 'Brushgather', 'Thistlewood', 'Applecart', 'Puddifoot'],
  },
  elf: {
    female: ['Aelindra', 'Caerwyn', 'Elowen', 'Ilyana', 'Lirael', 'Naivara', 'Sariel', 'Thessaly', 'Vaelis', 'Yllana'],
    male: ['Aerendil', 'Caelan', 'Elric', 'Faelar', 'Ithilan', 'Laeroth', 'Mirethil', 'Soveliss', 'Thalion', 'Varis'],
    family: ['Moonwhisper', 'Silverfrond', 'Starbrook', 'Dawnmantle', 'Leafwind', 'Nightbloom', 'Amberglade', 'Mistvale'],
  },
};

export const talk: TalkDef = {
  identity: {
    trade: "I'm {name}, the {trade}. Our home is {house}.",
    'trade:ruler': "I am {name}. This realm is mine to keep, and the great hall is my seat. Speak plainly; I listen.",
    'hand:ruler': "I'm {name}. I serve in the great hall, at the seat of the realm.",
    trader: "I'm {name}. I sell at the market, and we live in {house}.",
    keeper: "I'm {name}, keeper of the temple. I live in {house}.",
    hand: "I'm {name}. I help the {trade}; home is {house}.",
    homemaker: "I'm {name}. I keep house in {house}.",
    child: "I'm {name}! I live in {house}.",
    traveller: "I am {name}, only passing through. I lodge at {house} until the road calls again.",
    // (Asked in town or aboard: S3's passengers are these.)
    'traveller:sea': "I am {name}, a traveller by sea. Between ships I lodge at {house}; then I'm off to the next harbour.",
  },
  topics: {
    greet: 'Greet',
    self: 'Who are you?',
    news: 'Anything strange lately?',
    more: 'Tell me more.',
    source: 'How do you know?',
    bye: 'Farewell.',
  },
  nothing: ['Nothing out of the ordinary, that I know of.', 'Not that I have heard.', 'All quiet, as far as I know.', "Can't say I've noticed anything."],
  house: '{house} of the {family} family',
  cellar: 'the cellar under {house}',
  troubled: 'something is wrong in {subject}',
  ownHouse: 'our own house',
  happened: { saw: 'my own eyes, I was there', heard: 'the whole town, everyone is talking of it' },
  ownCellar: 'our cellar',
  lead: 'Something is wrong in {cellar}.',
  marked: '{name} marks {house} on your map.',
  comes: [
    '{name} has seen you and comes over.',
    '“You there, a word!” {name} is coming your way.',
    '{name} waves to you and hurries over.',
  ],
  beckon: [
    'You have the look of someone who can handle trouble. And there is trouble, if you will hear it.',
    'A stranger on the road, just when we could use one. Something has been going on here, you know.',
    'Forgive me for stopping you. You are not from here, are you? Then you will not have heard what people are saying.',
  ],
  cleared: {
    topic: '{place} is safe again.',
    yours: 'your cellar',
    note: 'It is quiet there now. {name} of {house} will want to hear it, and pay what the trouble was worth.',
    rumour: 'And since you are so good at this:',
  },
  arrival: {
    title: 'Find work in town',
    text: 'A light purse and a long road behind me. Innkeepers hear every rumour: ask at {inn} whether anything strange has happened lately, or ask the townsfolk.',
    from: 'your own hand',
  },
};
