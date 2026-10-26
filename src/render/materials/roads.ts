/**
 * What the terrain shader knows of the roads (world/roads.ts roadMask): a float mask 2 km across round the
 * camera, 4 m a sample, baked in the world worker. It holds distances, not coverage, so read bilinearly
 * the road's edge and a cart track's ruts stay sharp to the centimetre between samples.
 */
import { FloatMask } from './masks';
import { ROAD_REACH } from '../../world/roads';

export const ROAD = {
  /** R across the nearest road's centre (signed), G its kind (WAYS), B distance from its edge, A metres along it. */
  mask: new FloatMask(2048, 512, [ROAD_REACH, 0, ROAD_REACH, 0]),
};
