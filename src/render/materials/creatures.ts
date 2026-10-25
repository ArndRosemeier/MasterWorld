/**
 * The procedural creatures' two kinds (@futuremagic/creatures): one flesh for every species, so a new
 * beast is never a new shader, and one for their eyes. Skinned (every skeleton is padded to the same
 * bone count). Their rims catch a little of the lantern's warm light, so a rat in the dark still reads.
 */
import { vec3 } from 'three/tsl';
import { critterEye, critterFlesh } from '@futuremagic/creatures/node';
import type { CritterMaterials } from '@futuremagic/creatures/three';
import { defineKind } from '../materials';

export const CRITTER = defineKind('critter', ['position', 'normal', 'color', 'look'], () => critterFlesh({ outline: vec3(0.05, 0.035, 0.02) }));
export const CRITTER_EYE = defineKind('critter eye', ['position', 'normal', 'color'], () => critterEye(), { cast: false, receive: true });

/** The materials the creature package's figures are drawn with. */
export function critterMaterials(): CritterMaterials {
  return { flesh: CRITTER.make(), eye: CRITTER_EYE.make() };
}
