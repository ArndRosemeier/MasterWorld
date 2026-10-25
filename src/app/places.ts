/** Places worth a look, for the debug menu's "Go to" (found while building them; seed 'masterworld'). */
import type { TownPlan } from '@futuremagic/settlement';
import { polyCentroid } from '@futuremagic/settlement';
import type { Place } from './debugMenu';

const MASTERWORLD: Place[] = [
  { label: 'Stone arch', pos: [-32115, 31935], look: [280, 8], hour: 15, fly: false },
  { label: 'Waterfall', pos: [-30637, 53, 34634], look: [215, -4], hour: 10, fly: true },
  { label: 'Beach', pos: [-33540, 4, 29800], look: [150, -4], hour: 15, fly: true },
  { label: 'Sea cliff', pos: [-31888, 8, 30715], look: [185, 2], fly: true },
  { label: 'Meadow', pos: [-32000, 39000], fly: false },
  { label: 'Swim in the sea', pos: [-31110, 31110], fly: false },
];

/** The start, and the known places of this seed. */
export function placesFor(seed: string, start: { x: number; z: number }): Place[] {
  return [{ label: 'Start', pos: [start.x, start.z], fly: false }, ...(seed === 'masterworld' ? MASTERWORLD : [])];
}

/** Where a game starts in a town: on its market, a few steps from the middle. */
export function marketStart(plan: TownPlan): { x: number; z: number } {
  const [x, z] = polyCentroid(plan.market);
  return { x: x + 5, z: z + 4 };
}
