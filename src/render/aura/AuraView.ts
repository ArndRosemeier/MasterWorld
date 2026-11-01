/**
 * Draws the auras (src/sim/aura.ts) with the one aura shader (render/materials/aura.ts): every aura is one
 * instance of one quad mesh, one draw. The fights say what to light each frame (`AURAS.mark`, world
 * coordinates, from every fight in play); `lightUp` writes them out once a frame and clears them.
 *
 * Floating origin: the mesh is pinned (its matrix is the identity relative to the origin) and every position is
 * written minus ORIGIN.at.
 */
import { Mesh, PlaneGeometry } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { AURA, AURA_CAP, AURA_DATA } from '../materials/aura';
import { ORIGIN } from '../origin';

/** What is to be lit this frame: collected from the fights, drawn by the view. Floats per mark: x, y, z, strength, half width, half height, seed, r, g, b, dim. */
const STRIDE = 11;

export class AuraMarks {
  readonly data = new Float32Array(AURA_CAP * STRIDE);
  count = 0;

  /** One aura: its middle (world), the ellipse, how strong (0..1), a seed, the health colour and brightness. */
  mark(x: number, y: number, z: number, strength: number, halfW: number, halfH: number, seed: number, r: number, g: number, b: number, dim: number): void {
    if (this.count >= AURA_CAP || strength <= 0.003) return;
    this.data.set([x, y, z, strength, halfW, halfH, seed, r, g, b, dim], this.count * STRIDE);
    this.count++;
  }
}

/** Every fight puts its marks here; the view draws them and empties it. */
export const AURAS = new AuraMarks();

export class AuraView {
  readonly mesh: Mesh;

  constructor(private readonly marks: AuraMarks = AURAS) {
    // Always the whole cap (spare quads have no size): the count never changes, so the draw is built once.
    this.mesh = Object.assign(new Mesh(new PlaneGeometry(2, 2), AURA.make()), { name: 'auras', frustumCulled: false, castShadow: false, receiveShadow: false, count: AURA_CAP, renderOrder: 5 });
    ORIGIN.pin(this.mesh);
  }

  /** Built and compiled now (nothing shows until a fight marks something). */
  async settleIn(stage: Stage): Promise<void> {
    this.clear(0, AURA_CAP);
    AURA_DATA.at.needsUpdate = AURA_DATA.size.needsUpdate = true;
    await stage.add(this.mesh);
    this.mesh.visible = false;
  }

  /** Write this frame's marks to the GPU and empty them. */
  lightUp(): void {
    const m = this.marks, d = m.data, at = ORIGIN.at, n = m.count;
    m.count = 0;
    if (n === 0 && this.last === 0) return;
    const A = AURA_DATA.at.array as Float32Array, S = AURA_DATA.size.array as Float32Array, T = AURA_DATA.tint.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE, j = i * 4;
      A[j] = d[o]! - at.x; A[j + 1] = d[o + 1]!; A[j + 2] = d[o + 2]! - at.z; A[j + 3] = d[o + 3]!;
      S[j] = d[o + 4]!; S[j + 1] = d[o + 5]!; S[j + 2] = d[o + 6]!; S[j + 3] = d[o + 10]!;
      T[j] = d[o + 7]!; T[j + 1] = d[o + 8]!; T[j + 2] = d[o + 9]!; T[j + 3] = 0;
    }
    this.clear(n, this.last);
    this.last = n;
    this.mesh.visible = n > 0;
    AURA_DATA.at.needsUpdate = AURA_DATA.size.needsUpdate = AURA_DATA.tint.needsUpdate = true;
  }

  /** How many were drawn last frame. */
  private last = 0;

  /** Quads from `from` to `to` have no size and no strength. */
  private clear(from: number, to: number): void {
    const A = AURA_DATA.at.array as Float32Array, S = AURA_DATA.size.array as Float32Array;
    A.fill(0, from * 4, to * 4);
    S.fill(0, from * 4, to * 4);
  }
}
