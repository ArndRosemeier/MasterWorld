/**
 * Playing a clip on an Actors person: looping, or once from its start and held at its end (a blow, a
 * flinch, a death), optionally stretched to `dur` seconds, blended in over `fade` seconds (0 cuts).
 * Shared by everyone drawn as an Actors person.
 */
import { LoopOnce, type Mesh, type Object3D, type Vector3 } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { Character } from '@actors/generator';
import { ORIGIN } from '../origin';

/** Cross-fades (s): between gaits, and into a blow, a flinch or a fall (quicker, so it lands in time). */
export const FADE = { loop: 0.25, once: 0.1 } as const;

/** Plays `clip` on `ch`; `still()` says whether it is still wanted once loaded (another may have come since). */
export function playClip(ch: Character, clip: string, once: boolean, still: () => boolean, dur?: number, fade = 0): void {
  void ch.play(clip, fade).then(() => {
    const a = ch.actor.currentAction;
    if (!a || !once || !still()) return;
    a.setLoop(LoopOnce, 1);
    a.clampWhenFinished = true;
    // From the start (a blow again restarts it), still fading in: no reset(), which would stop the fade.
    a.time = 0;
    a.paused = false;
    a.enabled = true;
    if (dur) a.timeScale = a.getClip().duration / dur;
  });
}

/**
 * Compiles every shader Actors people under `obj` draw with, each one's shadow casters too (their shadow
 * builds are their own), meshes Actors keeps hidden included (compileAsync skips hidden ones).
 */
export async function preparePeople(stage: Stage, obj: Object3D): Promise<void> {
  const hidden: Object3D[] = [];
  obj.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  await stage.prepare(obj, { everyCaster: true });
  for (const o of hidden) o.visible = false;
}

/**
 * The parts of an Actors person too small or too hidden to show in a shadow: the anatomy (clothes cover it), the
 * eyes, lashes, brows, teeth and tongue. Each would be a draw call more in every shadow map for nothing, and the
 * lashes and brows (see-through and two-sided) two shadow shaders at once.
 */
const NO_SHADOW = /^(genitals|eyes|eyelashes|brows|teeth|tongue)/;

/** `fn` for every mesh in `o` (itself included). */
export function eachMesh(o: Object3D, fn: (m: Mesh) => void): void {
  o.traverse((m) => { if ((m as Mesh).isMesh) fn(m as Mesh); });
}

/** Every mesh of an Actors person casts a shadow, but the bits in NO_SHADOW. */
export function castShadows(o: Object3D): void {
  eachMesh(o, (m) => { m.castShadow = !NO_SHADOW.test(m.name); });
}

/** How far the seat bones are under the hip joints for a body with hips 0.92 m up (Actors' Mount), m. */
const SEAT_BONES = 0.085;

/**
 * Where an Actors person's seat is now, in world space (into `out`): under the posed pelvis by what it is in the
 * bind pose, down to the seat bones. A sit clip lowers the hips by a share of the body's height (Actors keeps root
 * motion in hip heights), so whoever sits on something puts this point on it. Null before the first shape.
 */
export function seatOf(actor: Character['actor'], out: Vector3): Vector3 | null {
  const f = actor.fittedSkeleton;
  if (!f) return null;
  const ip = f.names.indexOf('pelvis'), il = f.names.indexOf('thigh_l'), ir = f.names.indexOf('thigh_r');
  if (ip < 0 || il < 0 || ir < 0 || !actor.bones[ip]) return null;
  const hips = (f.heads[il][1] + f.heads[ir][1]) / 2;
  const drop = f.heads[ip][1] - (hips - SEAT_BONES * Math.max(0.3, hips / 0.92));
  actor.bones[ip].getWorldPosition(out);
  out.y -= drop;
  return out;
}

/** Where a hand of an Actors person is now, in the world (into `out`; the floating origin added back). Null before it has bones. */
export function handOf(actor: Character['actor'], side: 'l' | 'r', out: Vector3): Vector3 | null {
  const bone = actor.bones.find((b) => b.name === `hand_${side}`);
  return bone ? ORIGIN.toWorld(bone.getWorldPosition(out)) : null;
}
