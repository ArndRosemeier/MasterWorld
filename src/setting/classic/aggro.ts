/**
 * Simple aggro in the classic world (D69, phase Z1; the reviewer's picks of open question 3, which stand until Arnd changes them):
 * 10 m for a foe of the hero's level, 1.5 m wider for each level it stands above the hero up to 20 m, 1 m narrower for each level
 * below down to 5 m, nothing from a foe five or more levels below (grey). A pull brings its group within 12 m; a foe chased 40 m
 * from where it was pulled, or 25 s with no blow either way, goes home and heals. Con colours as the old games had them: grey, green
 * three and four below, blue one and two below, white even, yellow one and two above, red three and more.
 */
import type { AggroDef } from '../contract';

export const aggro: AggroDef = {
  even: 10, up: 1.5, down: 1, min: 5, max: 20, grey: 5,
  link: 12, leash: 40, chase: 25,
  con: { green: 3, blue: 1, red: 3 },
};
