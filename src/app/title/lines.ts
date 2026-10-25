/**
 * The title's words: the town crier's rumours, the toys' toasts and the peoples on the card. All player
 * text of the title lives here, as one table, so a translation replaces this file (plan 17). Tone: warm,
 * a little silly, never mean (plan 12.1). No real-world religion (the Wardens are the setting's own).
 */

/** The town crier's ticker: what the tavern says today. */
export const RUMOURS: readonly string[] = [
  'Dwarf smith denies the anvil is enchanted; anvil declines to comment',
  'Halfling innkeeper reports a record fourth breakfast',
  'Miller swears the river ran uphill on Tuesday, then apologised',
  'Old ward stone near the bridge glowed for an hour; goats unimpressed',
  'Goblins seen buying rope in bulk. Rope merchant: "Not my business"',
  'Elf passing through calls the town "quaint". Town calls the elf "tall"',
  'Shepherd counts his sheep twice, gets two different numbers, blames the fog',
  'Children born with the gift: one keeps setting the porridge on fire',
  'Watch captain asks citizens not to wake anything in the old crypt. Again',
  'Kobolds deny everything, including being kobolds',
  'Baker\'s cat elected to the town council by a margin of one mouse',
  'Mysterious stranger in a hood turns out to be cold, not mysterious',
  'A giant was seen on the far hills. Locals advise not to point',
  'Rest-day gathering at the temple of the five Wardens; bring your own bench',
  'The sealed dwarf hall hums at night. Dwarves: "Yes. And?"',
  'Fisherman claims a sea serpent stole his lunch; serpent unavailable for comment',
  'Old crier swears a dragon answers to an ancient code (up, up, down, down…)',
  'Wizard\'s apprentice turns a boot into a frog; the frog is wearing the other boot',
];

/** What the toys say. */
export const TOASTS = {
  birds: [
    'The crows of Eastmere thank you for your interest.',
    'A feather drifts down. Somewhere a bird is slightly colder.',
    'The flock files a complaint with the town council.',
    'Startled starlings spell a rude word, then deny it.',
  ],
  bolt: ['A bolt from the blue!', 'The sky answers. Rudely.', 'Somewhere a weather mage is very pleased with themselves.'],
  star: ['A shooting star. Make a wish, it is free.', 'The stars are restless tonight.'],
  bell: ['The bell rings. The town looks up.', 'Ding. Someone in the market drops a cabbage.', 'The bell-ringer wants to know who did that.'],
  cloud: ['A cloud of your very own. It rains on exactly one farmer.', 'The farmer below thanks you. The washing on the line does not.', 'Local weather, made to order.'],
  splash: ['Something large moves beneath the waves…', 'The sea keeps its secrets. For now.'],
  whale: ['A whale! It looks at you with mild disappointment.', 'A sea serpent breaches, waves, and is gone.'],
  dragon: ['Here be dragons.', 'A dragon! It did not notice you. Lucky.'],
} as const satisfies Record<string, readonly string[]>;

/** The hint under the menu (as in StarLord's title). */
export const HINT = 'Psst: the world can be clicked.';

/** The peoples a game can start with (plan 12.1), each with a small scene and the button's words. */
export interface People {
  readonly id: 'humans' | 'dwarves' | 'halflings' | 'elves';
  readonly name: string;
  readonly scene: string;
  readonly walk: string;
}

export const PEOPLES: readonly People[] = [
  { id: 'humans', name: 'Humans', scene: 'Farmers, traders and stubborn town councils. They built the valley and argue about it daily.', walk: 'Walk with the humans' },
  { id: 'dwarves', name: 'Dwarves', scene: 'Smiths and miners, old allies of men. Their deep halls are sealed, and they will not say why.', walk: 'Walk with the dwarves' },
  { id: 'halflings', name: 'Halflings', scene: 'They run the inn, the gossip and most of the breakfasts. Small feet, long memories.', walk: 'Walk with the halflings' },
  { id: 'elves', name: 'Elves', scene: 'Rare travellers who remember the old realm differently, and politely say so.', walk: 'Walk with the elves' },
];

/** The secret code: up, up, down, down, left, right, left, right, B, A (by key position). */
export const SECRET = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'] as const;

/** Listens for a code: `heard` gives true when the last keys pressed spell it. */
export class CodeWatch {
  private readonly last: string[] = [];
  constructor(private readonly code: readonly string[]) {}
  heard(key: string): boolean {
    this.last.push(key);
    if (this.last.length > this.code.length) this.last.shift();
    if (this.last.length < this.code.length || this.last.some((k, i) => k !== this.code[i])) return false;
    this.last.length = 0;
    return true;
  }
}
