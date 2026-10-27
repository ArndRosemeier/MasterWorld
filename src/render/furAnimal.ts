/**
 * An Actors animal drawn in its fur (the town's horses, the wild's wolves and deer): its actor on node
 * materials with the coat's fur shells, stood on the ground in a group that carries it, the body
 * casting the shadow (the shells cast none). And its gait played at a pace that fits its ground speed.
 */
import { Group, type WebGPURenderer } from 'three/webgpu';
import type { Animal } from '@actors/animal';
import { ThreeActor, createFurUniforms, setFurCoat } from '@actors/three';
import { addNodeFurShells, animalNodeMaterials } from '@actors/three/webgpu';
import { eachMesh } from './hero/play';

/** The meshes that cast the animal's shadow (its body at every detail level, not the fur shells). */
const BODY = /^body(?!.*:fur$)/;

/** The animal's actor in its coat, in a group named `name`; `before` runs before its shape (tack to show). */
export async function furActor(animal: Animal<object, object>, renderer: WebGPURenderer, name: string, before?: (actor: ThreeActor) => void): Promise<{ actor: ThreeActor; place: Group }> {
  const fur = createFurUniforms();
  const actor = new ThreeActor(animal.runtime, animalNodeMaterials(fur), { reversedDepth: renderer.reversedDepthBuffer === true });
  before?.(actor);
  actor.applyShape(await animal.evaluate());
  actor.object.position.y = actor.groundOffset();
  setFurCoat(fur, animal.coat as never, (animal.shape as { size?: number }).size ?? 1);
  addNodeFurShells(actor, fur);
  const place = new Group();
  place.name = name;
  place.add(actor.object);
  // Only the body casts: eyes, horns, tack, collar and bell are each one more draw in every sun-shadow
  // redraw (two horses and a cow were 20 of the town's ~160 shadow draws) for a shadow nobody sees.
  eachMesh(place, (m) => { m.castShadow = BODY.test(m.name); });
  return { actor, place };
}

/** The clip playing at its own pace when the animal goes `pace` m/s (none: as it is), within half to 1.6 times. */
export function gaitPace(actor: ThreeActor, speed: number, pace: number | undefined): void {
  const a = actor.currentAction;
  if (a) a.timeScale = pace ? Math.min(1.6, Math.max(0.5, speed / pace)) : 1;
}
