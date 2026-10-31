/**
 * The classic setting's shops (plan 11.5): the smith forges blades, axes, shields and mail; the market's
 * stalls keep the general goods of a valley town and take most things off a traveller's hands; the inn's
 * keeper sells food and drink and buys game for the kitchen. In the capital the armourer and the jeweller keep shop too. Above the plain goods each forge and stall keeps
 * a few finer pieces and one rare one, dear enough to save for over several evenings.
 */
import type { ShopDef } from '../contract';

export const shops: readonly ShopDef[] = [
  {
    keeper: 'smith', name: 'The smithy', topic: 'Show me your iron.',
    line: 'Have a look. Everything on the rack came off my anvil, and I stand by all of it.',
    goods: [['knife', 2], ['dagger', 2], ['short-sword', 2], ['arming-sword', 1], ['hatchet', 2], ['bearded-axe', 1], ['mace', 1], ['spear', 2], ['buckler', 1], ['round-shield', 1], ['iron-cap', 1], ['mail-shirt', 1]],
    buys: ['weapon', 'shield', 'armour'], purse: 900, pays: 0.42, asks: 1.2, restock: 3,
    fine: { uncommon: 3, rare: 1, danger: 8 },
  },
  {
    keeper: 'trader', name: 'A market stall', topic: 'What are you selling?',
    line: 'A bit of everything, friend. And if you have something to sell, I might take it off your hands.',
    goods: [['torch', 4], ['rope', 2], ['lockpicks', 1], ['minor-potion', 2], ['bread', 3], ['cheese', 2], ['cloak', 1], ['gloves', 1], ['boots', 1], ['leather-cap', 1], ['padded-jack', 1], ['leather-jerkin', 1], ['ring', 1], ['amulet', 1]],
    buys: ['valuable', 'tool', 'food', 'potion', 'armour', 'weapon', 'shield', 'writing'], purse: 450, pays: 0.38, asks: 1.3, most: 2, restock: 3,
    fine: { uncommon: 2, rare: 1, danger: 6 },
  },
  // The capital's crafts (C15): finer armour than a valley smith keeps, and rings and pendants that pay well for gems.
  {
    keeper: 'armourer', name: "The armourer's", topic: 'Show me your harness.',
    line: 'Mail riveted ring by ring, caps beaten from one sheet. Try it on; a coat that does not fit is a coat that kills you.',
    goods: [['mail-shirt', 2], ['iron-cap', 2], ['round-shield', 2], ['buckler', 1], ['leather-jerkin', 1], ['gloves', 1], ['boots', 1]],
    buys: ['armour', 'shield'], purse: 1200, pays: 0.45, asks: 1.25, restock: 3,
    fine: { uncommon: 4, rare: 2, danger: 10 },
  },
  {
    keeper: 'jeweller', name: "The jeweller's", topic: 'What do you have in the case?',
    line: 'Rings, pendants, a stone or two. And if you found something shiny in the dark, I pay better than any stall.',
    goods: [['ring', 3], ['amulet', 3]],
    buys: ['valuable'], purse: 1500, pays: 0.55, asks: 1.3, restock: 3,
    fine: { uncommon: 3, rare: 2, danger: 10 },
  },
  // By the sea (S5): the herbalist on the quay brews for those who work the water, and for those who go under it.
  {
    keeper: 'herbalist', name: "The herbalist's", topic: 'What have you brewed?',
    line: 'Salves for rope-burn, draughts for the fever, and for the divers a thing that lets you breathe the sea. Mind the dose.',
    goods: [['minor-potion', 3], ['potion', 2], ['deep-draught', 3]],
    buys: ['potion', 'food'], purse: 350, pays: 0.4, asks: 1.3, restock: 2,
  },
  {
    keeper: 'innkeeper', name: 'The inn', topic: 'What is there to eat?',
    line: 'Bread from this morning, cheese, and a draught or two for the road. Game for the pot I always buy.',
    goods: [['bread', 4], ['cheese', 3], ['venison', 1], ['minor-potion', 1], ['potion', 1], ['torch', 2]],
    buys: ['food', 'valuable'], purse: 300, pays: 0.45, asks: 1.25, restock: 2,
  },
];
