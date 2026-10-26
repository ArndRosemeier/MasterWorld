/**
 * What a household pays when told its place is safe again (plan 4.2, D29): copper by the danger of who
 * lived there. Pure: the game and the loop check pay the same.
 */
import type { CreatureDef } from '../setting/contract';
import type { Cellar } from '../world/dungeon/cellar';
import { cellarDanger } from '../world/dungeon/treasure';

/** Copper per point of a place's danger. */
export const REWARD_PER_DANGER = 12;

/** The reward for a place made safe, copper. */
export function rewardFor(c: Cellar, creatures: readonly CreatureDef[]): number {
  return Math.round(cellarDanger(c, creatures) * REWARD_PER_DANGER);
}
