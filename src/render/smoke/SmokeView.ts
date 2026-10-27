/**
 * Smoke columns over burning places (C10): the game says where (`show`, world coordinates); the puffs are
 * placed on the GPU (render/materials/smoke.ts). One draw, one shader, compiled with the others at load.
 */
import { Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import { SMOKE, SMOKE_COLUMNS, SMOKE_FEET, SMOKE_PUFFS, createSmokeMaterial } from '../materials/smoke';
import { ORIGIN } from '../origin';

/** The real time wraps (s) so the puffs' motion keeps its float precision. */
const WRAP = 3600;

/** A column of smoke: its foot in the world and how thick it is (0..1). */
export interface SmokeColumn {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly thick: number;
}

export class SmokeView {
  readonly mesh: Mesh<InstancedBufferGeometry>;
  private columns: readonly SmokeColumn[] = [];
  private seconds = 0;

  constructor(seed: number) {
    const g = new InstancedBufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
    g.setIndex([0, 1, 2, 2, 1, 3]);
    const rng = new Rng(seed), n = SMOKE_COLUMNS * SMOKE_PUFFS, puffs = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) puffs.set([rng.float(), rng.float(), rng.float(), Math.floor(i / SMOKE_PUFFS)], i * 4);
    g.setAttribute('pPuff', new InstancedBufferAttribute(puffs, 4));
    g.instanceCount = n;
    this.mesh = new Mesh(g, createSmokeMaterial());
    this.mesh.name = 'smoke';
    // Placed on the GPU anywhere: never culled (its bounds are not its geometry's).
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    // Placed on the GPU relative to the floating origin: drawn at the identity.
    ORIGIN.pin(this.mesh);
    // Shown until the first frame: the warm-up compiles only what is visible.
  }

  /** The columns to draw (the first SMOKE_COLUMNS). */
  burn(columns: readonly SmokeColumn[]): void {
    this.columns = columns.slice(0, SMOKE_COLUMNS);
  }

  /** Each frame: the time, and the columns moved with the origin. */
  billow(dt: number): void {
    this.seconds = (this.seconds + dt) % WRAP;
    SMOKE.time.value = this.seconds;
    const at = ORIGIN.at, cols = SMOKE_FEET;
    for (let i = 0; i < SMOKE_COLUMNS; i++) {
      const c = this.columns[i];
      cols[i].set(c ? c.x - at.x : 0, c ? c.y : 0, c ? c.z - at.z : 0, c ? c.thick : 0);
    }
    this.mesh.visible = this.columns.length > 0;
  }
}
