/**
 * The outlines round the creatures of a fight (sim/aura.ts): the fights say what to mark each frame (`AURAS.mark`,
 * world coordinates, from every fight in play); just before the scene is drawn `projectAuras` turns the strongest
 * into screen ellipses for the one outline shader (render/materials/outline.ts, in the post chain) and empties them.
 */
import { Matrix4, Vector3, type PerspectiveCamera } from 'three/webgpu';
import { FAINT, STRONG } from '../../sim/aura';
import { OUTLINE } from '../materials/outline';

/** Marks kept in a frame, at most; the shader outlines the strongest OUTLINE.cap of them. */
const KEPT = 48;
/** Floats per mark: x, y, z (the middle of the creature's body), strength, half width, half height, seed, r, g, b, dim. */
const STRIDE = 11;

export class AuraMarks {
  readonly data = new Float32Array(KEPT * STRIDE);
  count = 0;

  /** One creature: its middle (world), how strong (0..1), the ellipse that holds its body, a seed, the health colour and brightness. */
  mark(x: number, y: number, z: number, strength: number, halfW: number, halfH: number, seed: number, r: number, g: number, b: number, dim: number): void {
    if (this.count >= KEPT || strength <= 0.003) return;
    this.data.set([x, y, z, strength, halfW, halfH, seed, r, g, b, dim], this.count * STRIDE);
    this.count++;
  }
}

/** Every fight puts its marks here; the view takes them once a frame. */
export const AURAS = new AuraMarks();

/** Thickness of the line (px): the faint ones thin, the target's thick. */
const THIN = 1.4, THICK = 2.8; // (the shader reads both widths itself: materials/outline.ts LINE_PX)
/** Depth tolerance (m) of a creature's pixels about its middle: its body's half depth, at least this much. */
const DEPTH_TOL = 0.3;

const inverse = new Matrix4(), at = new Vector3();

/** Hand the strongest marks to the outline shader, as screen ellipses round each body, and empty `marks`. */
export function projectAuras(camera: PerspectiveCamera, marks: AuraMarks = AURAS): void {
  const n = marks.count, d = marks.data;
  marks.count = 0;
  // Strongest first (the target before the faint ones): the shader holds only so many.
  const order: number[] = [];
  for (let i = 0; i < n; i++) order.push(i);
  order.sort((a, b) => d[b * STRIDE + 3]! - d[a * STRIDE + 3]!);
  camera.updateMatrixWorld();
  inverse.copy(camera.matrixWorld).invert();
  const p = camera.projectionMatrix.elements;
  OUTLINE.near.value = camera.near;
  let k = 0;
  for (const i of order) {
    if (k >= OUTLINE.cap) break;
    const o = i * STRIDE;
    at.set(d[o]!, d[o + 1]!, d[o + 2]!).applyMatrix4(inverse);
    const z = -at.z;
    if (z < 0.4) continue;
    const halfW = d[o + 4]!, halfH = d[o + 5]!, s = d[o + 3]!, dim = d[o + 10]!;
    const strong = Math.min(1, Math.max(0, (s - FAINT) / (STRONG - FAINT)));
    // The ellipse on the screen (uv, y down): where it stands and how far it reaches.
    OUTLINE.slots.area[k]!.set(0.5 + 0.5 * p[0]! * at.x / z, 0.5 - 0.5 * p[5]! * at.y / z, Math.max(1e-4, 0.5 * p[0]! * halfW / z), Math.max(1e-4, 0.5 * p[5]! * halfH / z));
    OUTLINE.slots.range[k]!.set(z, Math.max(DEPTH_TOL, halfH * 0.45), s, strong);
    OUTLINE.slots.tint[k]!.set(d[o + 7]! * dim, d[o + 8]! * dim, d[o + 9]! * dim, THIN + (THICK - THIN) * strong);
    k++;
  }
  // The rest of the table is empty (no strength).
  for (; k < OUTLINE.cap; k++) OUTLINE.slots.range[k]!.z = 0;
}
