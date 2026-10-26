/**
 * The classic setting's shops (plan 11.5): the smith forges blades, axes, shields and mail; the market's
 * stalls keep the general goods of a valley town and take most things off a traveller's hands; the inn's
 * keeper sells food and drink and buys game for the kitchen.
 */
import type { ShopDef } from '../contract';

export const shops: readonly ShopDef[] = [
  {
    keeper: 'smith', name: 'The smithy', topic: 'Show me your iron.',
    line: 'Have a look. Everything on the rack came off my anvil, and I stand by all of it.',
    goods: [['knife', 2], ['dagger', 2], ['short-sword', 2], ['arming-sword', 1], ['hatchet', 2], ['bearded-axe', 1], ['mace', 1], ['spear', 2], ['buckler', 1], ['round-shield', 1], ['iron-cap', 1], ['mail-shirt', 1]],
    buys: ['weapon', 'shield', 'armour'], purse: 900, pays: 0.42, asks: 1.2, quality: 7,
  },
  {
    keeper: 'trader', name: 'A market stall', topic: 'What are you selling?',
    line: 'A bit of everything, friend. And if you have something to sell, I might take it off your hands.',
    goods: [['torch', 4], ['rope', 2], ['lockpicks', 1], ['minor-potion', 2], ['bread', 3], ['cheese', 2], ['cloak', 1], ['gloves', 1], ['boots', 1], ['leather-cap', 1], ['padded-jack', 1], ['leather-jerkin', 1], ['ring', 1], ['amulet', 1]],
    buys: ['valuable', 'tool', 'food', 'potion', 'armour', 'weapon', 'shield'], purse: 450, pays: 0.38, asks: 1.3, most: 2,
  },
  {
    keeper: 'innkeeper', name: 'The inn', topic: 'What is there to eat?',
    line: 'Bread from this morning, cheese, and a draught or two for the road. Game for the pot I always buy.',
    goods: [['bread', 4], ['cheese', 3], ['venison', 1], ['minor-potion', 1], ['potion', 1], ['torch', 2]],
    buys: ['food', 'valuable'], purse: 300, pays: 0.45, asks: 1.25,
  },
];
