/**
 * The pasts a hero of the classic world can choose (plan 11.4, D59): each gives the kit of that life, a first
 * ability it taught them, and one or two people in town who know them already.
 */
import type { BackgroundDef } from '../contract';

export const backgrounds: readonly BackgroundDef[] = [
  {
    id: 'sellsword', name: 'Caravan guard',
    text: 'You walked beside the wagons on the long roads and kept the bandits off them for a wage.',
    abilities: ['cleave'],
    kit: { worn: { main: 'short-sword', body: 'padded-jack', head: 'leather-cap', feet: 'boots' }, pack: ['minor-potion', 'minor-potion', 'bread'], coins: 14 },
    known: [
      { trade: 'carter', line: '{hero}! Still alive, then. The roads have been quiet without you scaring the bandits off.' },
      { trade: 'innkeeper', line: 'Well, if it isn\'t {hero}. Your old corner by the fire is free, if you want it.' },
    ],
  },
  {
    id: 'farmhand', name: 'Farmhand',
    text: 'You grew up behind the plough on the farms outside town, and kept the foxes off with a boar spear.',
    abilities: ['lunge'],
    kit: { worn: { main: 'spear', body: 'padded-jack', feet: 'boots' }, pack: ['bread', 'cheese', 'minor-potion', 'torch'], coins: 10 },
    known: [
      { trade: 'miller', line: '{hero}, is it? You carried more sacks to my mill than any two lads. Good to see you.' },
      { trade: 'carter', line: 'Ho, {hero}! Tired of the fields already?' },
      { trade: 'baker', line: '{hero}! Your grain makes my best loaves, you know.' },
    ],
  },
  {
    id: 'apprentice', name: "Smith's apprentice",
    text: 'Years at the anvil gave you strong arms, a feel for good iron and a hammer that knows its way.',
    abilities: ['bash'],
    kit: { worn: { main: 'mace', body: 'leather-jerkin', hands: 'gloves', feet: 'boots' }, pack: ['minor-potion', 'bread', 'torch'], coins: 18 },
    known: [
      { trade: 'smith', line: 'There\'s my apprentice. {hero}, the forge has been cold company without you.' },
    ],
  },
  {
    id: 'poacher', name: 'Poacher',
    text: 'You know the woods better than the lord\'s foresters do, and you know how to keep out of their sight.',
    abilities: ['sneak'],
    kit: { worn: { main: 'hatchet', body: 'leather-jerkin', cloak: 'cloak', feet: 'boots' }, pack: ['rope', 'bread', 'minor-potion'], coins: 12 },
    known: [
      { trade: 'innkeeper', line: '{hero}. Keep your voice down; nobody here asks where my hares come from.' },
      { trade: 'butcher', line: 'Ah, {hero}. Anything for me today? No questions asked, as ever.' },
    ],
  },
  {
    id: 'acolyte', name: 'Temple acolyte',
    text: 'You kept the lamps lit and the floors swept at the temple, and learned to listen and to speak.',
    abilities: ['mend'],
    kit: { worn: { main: 'club', cloak: 'cloak', feet: 'boots' }, pack: ['potion', 'minor-potion', 'bread', 'torch'], coins: 16 },
    known: [
      { trade: 'keeper', line: '{hero}, child, you came back to us. The lamps have missed your care.' },
    ],
  },
  {
    id: 'scribe', name: 'Scribe',
    text: 'You wrote letters and kept accounts for anyone who could pay, and you have read every map in town.',
    abilities: ['sidestep'],
    kit: { worn: { main: 'dagger', cloak: 'cloak', feet: 'boots' }, pack: ['minor-potion', 'bread', 'torch', 'lockpicks'], coins: 36 },
    known: [
      { trade: 'reeve', line: '{hero}! Just the person. The rolls have been in a mess since you left.' },
      { trade: 'chandler', line: '{hero}, my best customer for candles. Writing late again?' },
    ],
  },
];
