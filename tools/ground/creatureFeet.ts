/**
 * A creature's feet against a ground: a synthetic four-legged animal (Actors' `syntheticWalker`, a skinned rig with flat soles, no model
 * files) grown to `size` (a giant recipe's body, like the wild's giants), stood at (x, z) with the foot pass (`LibraryAnimal.setGround`)
 * on the given ground, settled for a few frames. Reports how far the lowest point of each foot's skin ended up in the ground (`sunk`)
 * and over it (`floating`), metres. Used by `npm run ground:scan` and test/creatureFeet.test.ts.
 */
import { deform } from '@actors/core';
import { soleClearances, syntheticWalker } from '@actors/three';

export interface Feet {
  /** The deepest a foot's skin sank into the ground (m, 0 if none did). */
  sunk: number;
  /** The highest a foot's lowest skin stood over the ground (m). */
  floating: number;
}

const LEGS: [number, number][] = [[0.25, 0.5], [-0.25, 0.5], [0.25, -0.5], [-0.25, -0.5]];

export function feetOn(ground: (x: number, z: number) => number, x: number, z: number, yaw: number, size: number, seed = 1): Feet {
  const { lib, mesh } = syntheticWalker(LEGS);
  lib.object.scale.setScalar(size);
  lib.object.rotation.y = yaw;
  lib.object.position.set(x, ground(x, z), z);
  if (size > 1) lib.setDeform(deform({ recipe: 'giant', seed, strength: 1, size }));
  lib.setGround(ground);
  for (let i = 0; i < 12; i++) lib.update(1 / 30);
  const c = soleClearances(lib, mesh, ground);
  return { sunk: Math.max(0, -Math.min(...c)), floating: Math.max(...c) };
}
