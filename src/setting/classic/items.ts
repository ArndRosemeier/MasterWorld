/**
 * The classic setting's first items (plan 11.5, 12.1, D31): weapons of each kind, shields, three weights
 * of armour, potions, food, tools and valuables; a few legendary pieces with their history; what places
 * and creatures of some danger hold. Rarity and the bonuses to its qualities are rolled when an item is found.
 */
import type { ItemCatalog, TravelDef, UpkeepDef, VoyageDef } from '../contract';

export const items: ItemCatalog = {
  items: [
    { id: 'knife', name: 'Knife', kind: 'weapon', slot: 'main', weapon: { swing: 'slash', damage: [2, 5], kind: 'cut', time: 1.4, reach: 0.7 }, value: 8, weight: 0.3 },
    { id: 'dagger', name: 'Dagger', kind: 'weapon', slot: 'main', weapon: { swing: 'slash', damage: [3, 6], kind: 'pierce', time: 1.5, reach: 0.75 }, value: 30, weight: 0.4 },
    { id: 'short-sword', name: 'Short sword', kind: 'weapon', slot: 'main', weapon: { swing: 'slash', damage: [4, 8], kind: 'cut', time: 1.9, reach: 0.95 }, value: 90, weight: 1.2 },
    { id: 'arming-sword', name: 'Arming sword', kind: 'weapon', slot: 'main', weapon: { swing: 'slash', damage: [5, 11], kind: 'cut', time: 2.2, reach: 1.1 }, value: 260, weight: 1.4 },
    { id: 'hatchet', name: 'Hatchet', kind: 'weapon', slot: 'main', weapon: { swing: 'slash', damage: [4, 8], kind: 'cut', time: 1.9, reach: 0.85 }, value: 40, weight: 1.1 },
    { id: 'bearded-axe', name: 'Bearded axe', kind: 'weapon', slot: 'main', weapon: { swing: 'slash', damage: [6, 12], kind: 'cut', time: 2.5, reach: 1.0 }, value: 180, weight: 1.8 },
    { id: 'club', name: 'Club', kind: 'weapon', slot: 'main', weapon: { swing: 'slam', damage: [3, 7], kind: 'blunt', time: 1.8, reach: 0.85 }, value: 4, weight: 1.3 },
    { id: 'mace', name: 'Flanged mace', kind: 'weapon', slot: 'main', weapon: { swing: 'slam', damage: [5, 10], kind: 'blunt', time: 2.3, reach: 0.9 }, value: 200, weight: 2.0 },
    { id: 'spear', name: 'Spear', kind: 'weapon', slot: 'main', weapon: { swing: 'thrust', damage: [4, 9], kind: 'pierce', time: 2.1, reach: 1.6 }, value: 60, weight: 1.8 },
    { id: 'buckler', name: 'Buckler', kind: 'shield', slot: 'off', armour: 0, block: 0.18, value: 40, weight: 1.5 },
    { id: 'round-shield', name: 'Round shield', kind: 'shield', slot: 'off', armour: 1, block: 0.28, value: 70, weight: 3.5 },
    { id: 'padded-jack', name: 'Padded jack', kind: 'armour', slot: 'body', armour: 1, value: 30, weight: 3 },
    { id: 'leather-jerkin', name: 'Leather jerkin', kind: 'armour', slot: 'body', armour: 2, value: 80, weight: 4 },
    { id: 'mail-shirt', name: 'Mail shirt', kind: 'armour', slot: 'body', armour: 4, value: 400, weight: 10 },
    { id: 'leather-cap', name: 'Leather cap', kind: 'armour', slot: 'head', armour: 1, value: 20, weight: 0.5 },
    { id: 'iron-cap', name: 'Iron cap', kind: 'armour', slot: 'head', armour: 2, value: 110, weight: 1.5 },
    { id: 'gloves', name: 'Leather gloves', kind: 'armour', slot: 'hands', armour: 0, value: 15, weight: 0.3 },
    { id: 'boots', name: 'Stout boots', kind: 'armour', slot: 'feet', armour: 1, value: 30, weight: 1.2 },
    { id: 'cloak', name: 'Wool cloak', kind: 'armour', slot: 'cloak', armour: 0, value: 25, weight: 1.5 },
    { id: 'ring', name: 'Copper ring', kind: 'armour', slot: 'ring', armour: 0, value: 12, weight: 0.02 },
    { id: 'amulet', name: 'Pendant on a thong', kind: 'armour', slot: 'amulet', armour: 0, value: 20, weight: 0.05 },
    { id: 'minor-potion', name: 'Small healing draught', kind: 'potion', heal: 25, value: 25, weight: 0.2, lore: 'Bitter and green; the hedge witch swears by it.' },
    { id: 'potion', name: 'Healing draught', kind: 'potion', heal: 55, value: 70, weight: 0.3 },
    { id: 'deep-draught', name: 'Draught of the deep', kind: 'potion', effect: { id: 'gills', magnitude: 1, duration: 180 }, value: 60, weight: 0.3, lore: 'Kelp, salt and something the herbalist will not name: three minutes of breathing water.' },
    { id: 'bread', name: 'Loaf of bread', kind: 'food', heal: 6, value: 2, weight: 0.4 },
    { id: 'cheese', name: 'Wedge of cheese', kind: 'food', heal: 8, value: 4, weight: 0.3 },
    { id: 'torch', name: 'Torch', kind: 'tool', value: 2, weight: 0.5 },
    { id: 'rope', name: 'Coil of rope', kind: 'tool', value: 6, weight: 2 },
    { id: 'portal-stone', name: 'Portal stone', kind: 'tool', portal: true, value: 0, weight: 0.3, lore: 'Smooth and cold, it hums when held. One glyph remembers a place; the other opens the way back to it.' },
    { id: 'lockpicks', name: 'Lockpicks', kind: 'tool', value: 40, weight: 0.1 },
    { id: 'old-coin', name: 'Coin of the old realm', kind: 'valuable', value: 30, weight: 0.01, lore: 'A crowned hammer on one side, a tower on the other. Nobody mints these any more.' },
    { id: 'candlestick', name: 'Silver candlestick', kind: 'valuable', value: 90, weight: 0.8 },
    { id: 'garnet', name: 'Rough garnet', kind: 'valuable', value: 60, weight: 0.02 },
    { id: 'trinket', name: 'Shiny trinket', kind: 'valuable', value: 3, weight: 0.05, lore: 'A button, a bent spoon and a bead on a string. Treasured by someone.' },
    { id: 'silk', name: 'Bundle of spider silk', kind: 'valuable', value: 45, weight: 0.3, lore: 'Weavers in the city pay well for it, and ask no questions.' },
    { id: 'wolf-pelt', name: 'Wolf pelt', kind: 'valuable', value: 35, weight: 2.5, lore: 'Thick grey fur. The furrier in town pays well for it before winter.' },
    { id: 'deer-hide', name: 'Deer hide', kind: 'valuable', value: 22, weight: 2 },
    { id: 'rat-hide', name: 'Giant rat hide', kind: 'valuable', value: 6, weight: 0.6, lore: 'Coarse and greasy. The tanner takes it, for gloves nobody admits to wearing.' },
    { id: 'venom-sac', name: 'Spider venom sac', kind: 'valuable', value: 30, weight: 0.1, lore: 'Handle it gently. The hedge witch makes a numbing salve of it.' },
    { id: 'boar-tusk', name: 'Boar tusk', kind: 'valuable', value: 14, weight: 0.2 },
    { id: 'venison', name: 'Haunch of venison', kind: 'food', heal: 14, value: 9, weight: 2 },
    // Writings (C3): rare extra ways to a spell. Read, the spell is yours and the school opens; the page crumbles.
    { id: 'tome-embers', name: 'Charred primer of embers', kind: 'writing', teaches: 'fireball', value: 140, weight: 1.2, lore: 'Half its pages are ash. The rest still smell of smoke, and teach how to throw a fireball.' },
    { id: 'scroll-sunlance', name: 'Scroll of the sunlance', kind: 'writing', teaches: 'sunlance', value: 90, weight: 0.1, lore: 'Gold ink that glows faintly in the dark. Reading it once is enough.' },
    { id: 'tome-shadows', name: 'Book of quiet shadows', kind: 'writing', teaches: 'veil', value: 150, weight: 1, lore: 'Its letters fade when you look straight at them. It teaches the veil.' },
    { id: 'tome-stone', name: 'Slate-bound tablet', kind: 'writing', teaches: 'stone-skin', value: 130, weight: 3, lore: 'Dwarven runes cut in slate: how skin becomes stone.' },
    { id: 'scroll-mend', name: 'Scroll of mending', kind: 'writing', teaches: 'mend', value: 70, weight: 0.1, lore: 'A hedge witch wrote it out, with a pressed leaf in the fold.' },
  ],
  uniques: [
    { id: 'lantern-blade', base: 'short-sword', name: "Grundmar's Lantern-Blade", bonuses: { aim: 10, guard: 4 }, danger: 14, grants: 'deeplight', lore: 'A dwarf of the old realm forged it to light the deep halls. Since the Fading it has only glinted, until lately.' },
    { id: 'threshold', base: 'round-shield', name: 'Threshold', bonuses: { block: 10, armour: 5 }, danger: 18, grants: 'hold-door', lore: 'Its rim bears the open door of the Threshold. The temple keeper would give a great deal to see it.' },
    { id: 'watch-mace', base: 'mace', name: 'Coldiron of the Watch', bonuses: { aim: 9, guard: 4 }, danger: 18, grants: 'watch-cold', lore: 'The valley watch carried it when the watch-house still stood. It is cold to the touch in any weather.' },
  ],
  treasure: [
    // What a creature carries fits what it is: animals only their own hide, fangs or silk (rats nothing at all),
    // people coin and gear, the dead their grave goods. Coin a beast's victims dropped lies in its lair's hoard.
    { id: 'giant-rat', items: [['rat-hide', 1]], count: [0, 1], coins: [0, 0] },
    { id: 'goblin', items: [['trinket', 4], ['knife', 2], ['bread', 2], ['old-coin', 1], ['amulet', 1]], count: [0, 1], coins: [1, 12] },
    { id: 'bandit', items: [['dagger', 2], ['short-sword', 1], ['minor-potion', 2], ['leather-cap', 1], ['gloves', 1], ['cheese', 1]], count: [0, 1], coins: [8, 35] },
    { id: 'wolf', items: [['wolf-pelt', 1]], count: [1, 1], coins: [0, 0] },
    { id: 'boar', items: [['boar-tusk', 2], ['venison', 1]], count: [1, 2], coins: [0, 0] },
    { id: 'deer', items: [['deer-hide', 1], ['venison', 2]], count: [1, 1], coins: [0, 0] },
    { id: 'web', items: [['silk', 3], ['venom-sac', 2]], count: [1, 2], coins: [0, 0] },
    { id: 'hold', items: [['bearded-axe', 2], ['iron-cap', 2], ['mail-shirt', 1], ['garnet', 2], ['old-coin', 1], ['tome-stone', 0.3]], count: [0, 1], coins: [10, 40] },
    { id: 'grave', items: [['old-coin', 3], ['amulet', 2], ['ring', 2], ['iron-cap', 1], ['arming-sword', 1], ['tome-shadows', 0.25]], count: [0, 1], coins: [0, 0] },
    { id: 'stash', items: [['minor-potion', 3], ['rope', 1], ['old-coin', 2], ['ring', 1], ['dagger', 1], ['cloak', 1], ['scroll-mend', 0.2], ['deep-draught', 0.5]], count: [1, 2], coins: [8, 30] },
    { id: 'cellar-chest', items: [['candlestick', 1], ['minor-potion', 3], ['rope', 2], ['lockpicks', 1], ['cheese', 2], ['cloak', 1], ['old-coin', 2], ['scroll-mend', 0.15]], count: [1, 2], coins: [3, 25] },
    {
      id: 'lair', count: [2, 3], coins: [20, 80],
      items: [['minor-potion', 3], ['potion', 1], ['short-sword', 1], ['hatchet', 1], ['spear', 1], ['mace', 1], ['buckler', 1], ['round-shield', 1], ['leather-jerkin', 1], ['mail-shirt', 0.3], ['iron-cap', 0.6], ['boots', 1], ['ring', 1], ['amulet', 1], ['garnet', 1], ['tome-embers', 0.2], ['scroll-sunlance', 0.25], ['deep-draught', 0.6]],
    },
  ],
  affixes: {
    aim: { prefix: 'Keen', suffix: 'of the Edge' },
    guard: { prefix: 'Nimble', suffix: 'of the Cat' },
    armour: { prefix: 'Stout', suffix: 'of the Ox' },
    block: { prefix: 'Steady', suffix: 'of the Wall' },
    spell: { prefix: 'Humming', suffix: 'of the Old Ways' },
    stealth: { prefix: 'Quiet', suffix: 'of Shadows' },
    speech: { prefix: 'Silver', suffix: 'of the Market' },
    health: { prefix: 'Hale', suffix: 'of the Hearth' },
  },
};

/**
 * The carts between the inns (plan 5.4, C7): the carter's pair keeps a brisk trot on the roads, so the
 * longer way by road still takes less time than running it straight; a few coppers a kilometre, about a
 * room's price for a day's ride.
 */
export const travel: TravelDef = {
  speed: 8,
  road: 1.3,
  perKm: 6,
  least: 8,
  offers: 4,
  words: {
    topic: 'A seat on the cart to {place} ({price})',
    given: '{price}, and the carter leaves from the yard as soon as you are up on the bench.',
    tooDear: 'The cart is {price}, friend, and your purse says otherwise. Your legs are free.',
    going: 'The road goes by…',
    arrived: 'The cart sets you down at the inn of {place}, {hours} on the road.',
  },
};

/**
 * Passage by sea (S4): a ship makes 7 m/s with the wind (quicker than the cart, the way over the water is short); a
 * berth costs about twice a seat on the cart a kilometre, a day's wage for a short crossing, food aboard included.
 */
export const voyage: VoyageDef = {
  speed: 7,
  perKm: 12,
  least: 24,
  offers: 3,
  reach: [2500, 14000],
  words: {
    topic: 'Passage by ship to {place} ({price})',
    given: '{price}. She lies at the pier: go aboard by the gangplank, she casts off directly.',
    tooDear: 'Passage is {price}, and the master takes no promises. Come back with the coin.',
    arrived: 'The ship comes in to {place}, {hours} at sea.',
  },
};

/** Rooms and mending (plan 11.5): a night at the inn with supper costs about a day's wage, mending a third of the price as new. */
export const upkeep: UpkeepDef = {
  room: 16,
  repair: 0.35,
  rise: 7,
  words: {
    roomTopic: 'A room and supper ({price})',
    repairTopic: 'Can you mend my gear?',
    roomGiven: '{price}, with supper and a mug of ale, and the room under the eaves is yours. Sleep well.',
    repairLine: 'Let me see what you have done to it.',
    roomTooDear: 'A room and supper is {price}, friend, and your purse says otherwise. The hearth is free to sit by, though.',
    slept: 'You sleep in a narrow bed under the eaves and wake rested. The room is yours whenever you come back to this inn.',
    nothingToMend: 'That all looks sound to me. Come back when you have dented something.',
    mended: 'There. {items}, good as new. That will be {price}.',
    mendTooDear: 'I can do the rest, but not {left} for what you have left. Bring more coin.',
    worn: 'Your {item} is showing wear.',
    battered: 'Your {item} is badly battered. A smith could mend it.',
    broken: 'Your {item} is broken and does you little good. Take it to a smith.',
    wakeRoom: 'your room at the inn',
    wakeTemple: 'the temple',
    wakeInn: 'the inn',
  },
};
