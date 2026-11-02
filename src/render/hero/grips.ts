/**
 * Held things on an Actors person: a weapon in the hand in a fight, at the hip or on the back otherwise.
 * Shared by everyone drawn as an Actors person (the hero, and anyone else who carries arms).
 */
import { Matrix4, Quaternion, Vector3, type Bone, type Object3D } from 'three/webgpu';

/** A turn given by where the blade (grip +y) and its edge (about grip +z) point in the bone. */
function aim(blade: readonly [number, number, number], edge: readonly [number, number, number]): Quaternion {
  const y = new Vector3(...blade).normalize();
  const x = new Vector3(...edge).cross(y).negate().normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(x, y, new Vector3().crossVectors(x, y)));
}

/** Grip frames: how a held thing (grip space: +y along the blade) sits in each bone. */
export const GRIPS = {
  hand_r: { at: new Vector3(-0.02, 0.05, 0.05), turn: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 - 0.3) },
  hand_l: { at: new Vector3(0.02, 0.05, 0.05), turn: new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI / 2 - 0.3) },
  // At the left hip, the hilt over the belt, the blade down and back (the pelvis bone leans: +x left, +y up and
  // back, +z up and forward).
  pelvis: { at: new Vector3(0.19, 0.08, 0.06), turn: aim([0.14, -0.28, -0.94], [0.28, -0.92, 0.26]) },
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
  // Held meshes do not update their own matrix (the building kinds' meshes stand still).
  thing.updateMatrix();
  return true;
}

/** An Actors person: its bones, and hands that close round what they hold. */
export interface Holder {
  readonly bones: readonly Bone[];
  setGrip(side: 'l' | 'r', amount: number): void;
}

/**
 * Main and off hand things: drawn (in closed hands) or carried (hip, back, hands open). `offInHand`: the off
 * hand holds its thing even when nothing is drawn (a lit torch).
 */
export function gripHeld(main: Object3D | null, off: Object3D | null, drawn: boolean, who: Holder, owner: Object3D, offInHand = drawn): void {
  if (main) grip(main, who.bones, drawn ? 'hand_r' : 'pelvis', owner);
  if (off) grip(off, who.bones, offInHand ? 'hand_l' : 'spine_03', owner);
  who.setGrip('r', main && drawn ? 1 : 0);
  who.setGrip('l', off && offInHand ? 1 : 0);
}
