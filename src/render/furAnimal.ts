/**
 * An Actors animal drawn in its fur (the town's horses, the wild's wolves and deer): its actor on node
 * materials with the coat's fur shells, stood on the ground in a group that carries it, the body
 * casting the shadow (the shells cast none). And its gait played at a pace that fits its ground speed.
 */
import { Group, type Mesh, type WebGPURenderer } from 'three/webgpu';
import type { Animal } from '@actors/animal';
import { ThreeActor, createFurUniforms, setFurCoat } from '@actors/three';
import { addNodeFurShells, animalNodeMaterials } from '@actors/three/webgpu';

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
  place.traverse((m) => { if ((m as Mesh).isMesh && !m.name.endsWith(':fur')) (m as Mesh).castShadow = true; });
  return { actor, place };
}

/** The clip playing at its own pace when the animal goes `pace` m/s (none: as it is), within half to 1.6 times. */
export function gaitPace(actor: ThreeActor, speed: number, pace: number | undefined): void {
  const a = actor.currentAction;
  if (a) a.timeScale = pace ? Math.min(1.6, Math.max(0.5, speed / pace)) : 1;
}
