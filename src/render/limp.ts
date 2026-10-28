/**
 * A limp (Arnd 2026-10-28, show don't tell): a badly hurt body favours a leg as it goes, dipping and
 * swaying onto the good one once a stride, the worse the wound the deeper. The den slows it as well
 * (sim/creatures.ts paceOf); this is how the slowing looks. Applied after the body is placed and jolted
 * this frame; whoever places it sets its whole position and rotation every frame.
 */
import type { Object3D } from 'three/webgpu';

/** Wounded less than this, it walks sound (the den's pace starts to drop about here). */
const SOUND = 0.25;

/** How much it limps for a wound (0 whole .. 1 at death's door): 0 .. 1. */
export function limpOf(wound: number): number {
  return Math.max(0, Math.min(1, (wound - SOUND) / (1 - SOUND)));
}

/**
 * `o` limping by `amount` (limpOf), `walked` metres along with strides of `stride` metres, `height` its
 * size (the dip scales with it). Does nothing while it stands.
 */
export function limp(o: Object3D, amount: number, walked: number, stride: number, height: number, moving: boolean): void {
  if (amount <= 0 || !moving) return;
  const s = Math.sin((walked / stride) * Math.PI * 2);
  // The dip lands on the bad leg once a stride; the body leans over the good one with it.
  o.position.y -= Math.max(0, s) * amount * height * 0.05;
  o.rotateZ(s * amount * 0.09);
}
