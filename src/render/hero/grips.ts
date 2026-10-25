/**
 * Held things on an Actors person: a weapon in the hand in a fight, at the hip or on the back otherwise.
 * Shared by everyone drawn as an Actors person (the hero, and anyone else who carries arms).
 */
import { Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';

/** Grip frames: how a held thing (grip space: +y along the blade) sits in each bone. */
export const GRIPS = {
  hand_r: { at: new Vector3(0, 0.085, 0.02), turn: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2) },
  hand_l: { at: new Vector3(0, 0.085, 0.02), turn: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2) },
  pelvis: { at: new Vector3(-0.17, -0.02, 0), turn: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.92) },
  spine_03: { at: new Vector3(0, 0.05, -0.16), turn: new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI * 0.8) },
} as const;
export type GripBone = keyof typeof GRIPS;

const s = new Vector3(), t = new Vector3();

/** Puts `thing` on bone `name` of `bones` in its grip; `owner` is the person's root (its scale is the thing's). */
export function grip(thing: Object3D, bones: readonly Bone[], name: GripBone, owner: Object3D): boolean {
  const bone = bones.find((b) => b.name === name);
  if (!bone) return false;
  const g = GRIPS[name];
  bone.add(thing);
  thing.position.copy(g.at);
  thing.quaternion.copy(g.turn);
  // Bones may be scaled with the body: held things keep their own size.
  bone.updateWorldMatrix(true, false);
  s.setFromMatrixScale(bone.matrixWorld).divide(t.setFromMatrixScale(owner.matrixWorld));
  thing.scale.set(1 / (s.x || 1), 1 / (s.y || 1), 1 / (s.z || 1));
  return true;
}

/** Main and off hand things: drawn (hands) or carried (hip, back). */
export function gripHeld(main: Object3D | null, off: Object3D | null, drawn: boolean, bones: readonly Bone[], owner: Object3D): void {
  if (main) grip(main, bones, drawn ? 'hand_r' : 'pelvis', owner);
  if (off) grip(off, bones, drawn ? 'hand_l' : 'spine_03', owner);
}
