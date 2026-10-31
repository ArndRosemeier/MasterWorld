/**
 * Levels and experience in the classic world (D58): twenty levels, each a little dearer than the one before.
 * A fresh hero meets a goblin pack as an even fight; at level 10 a barrow lord; past that the deep places.
 */
import type { GrowthDef } from '../contract';

/** Experience to reach level n: 25 (n − 1)(n + 2), so 100 for the second, 250 the third, 10450 the twentieth. */
const xp = Array.from({ length: 20 }, (_, i) => 25 * i * (i + 3));

export const growth: GrowthDef = {
  xp,
  perLevel: { health: 6, stamina: 4, mana: 5 },
  // Level 1 aims like a guard fresh off the caravans; level 20 like the best of the old realm.
  prowess: { base: 16, step: 4.4 },
  even: { base: 9, step: 2.5 },
  fight: 2.5,
  deeds: { cleared: 40, kept: 50, band: 80, task: 60, help: 30, town: 20, place: 15, sight: 20, read: 25, learn: 10 },
  // An ability learned at level 1 hits about 1.6 times as hard at level 10; its effects last a fifth longer.
  // A spell gains a hundredth for each point of spell power on the gear.
  scale: { damage: 0.07, heal: 0.07, duration: 0.02, range: 0.01, spell: 0.01 },
  // One ability point a level (D61, Arnd 2026-10-31): a fresh hero can learn one ability; the rest come with growing.
  points: { perLevel: 1, none: 'You have no room for more just now. Grow a little, come back, and I will teach you.' },
};
