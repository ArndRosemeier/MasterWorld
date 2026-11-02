/**
 * Smoke columns over burning places (C10): the game says where (`show`, world coordinates); the puffs are
 * placed on the GPU (render/materials/smoke.ts). One draw, one shader, compiled with the others at load.
 */
import { Float32BufferAttribute, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, type Material } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import { SMOKE, SMOKE_COLUMNS, SMOKE_FEET, SMOKE_HIGH, SMOKE_PUFFS, SMOKE_SHAPE, SMOKE_SIZE, createSmokeMaterial } from '../materials/smoke';
import { ORIGIN } from '../origin';

/** The real time wraps (s) so the puffs' motion keeps its float precision. */
const WRAP = 3600;

/**
 * One draw of puffs for `columns` columns of `puffs` each: camera-facing quads placed on the GPU (`pPuff` per instance: three random
 * numbers and the column; materials/smoke.ts puffMaterial), never culled (placed on the GPU relative to the floating origin: drawn at the identity).
 */
export function puffMesh(seed: number, columns: number, puffs: number, material: Material, name: string): Mesh<InstancedBufferGeometry> {
  const g = new InstancedBufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0], 3));
  g.setIndex([0, 1, 2, 2, 1, 3]);
  const rng = new Rng(seed), n = columns * puffs, data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) data.set([rng.float(), rng.float(), rng.float(), Math.floor(i / puffs)], i * 4);
  g.setAttribute('pPuff', new InstancedBufferAttribute(data, 4));
  g.instanceCount = n;
  const mesh = new Mesh(g, material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  ORIGIN.pin(mesh);
  return mesh;
}

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
    // (Shown until the first frame: the warm-up compiles only what is visible.)
    this.mesh = puffMesh(seed, SMOKE_COLUMNS, SMOKE_PUFFS, createSmokeMaterial(), 'smoke');
  }

  /** The columns to draw (the first SMOKE_COLUMNS). */
  burn(columns: readonly SmokeColumn[]): void {
    this.columns = columns.slice(0, SMOKE_COLUMNS);
  }

  /** Each frame: the time, and the columns moved with the origin. */
  billow(dt: number): void {
    this.seconds = (this.seconds + dt) % WRAP;
    SMOKE.time.value = this.seconds;
    const at = ORIGIN.at;
    for (let i = 0; i < SMOKE_COLUMNS; i++) {
      const c = this.columns[i];
      SMOKE_FEET[i].set(c ? c.x - at.x : 0, c ? c.y : 0, c ? c.z - at.z : 0, 0);
      SMOKE_SHAPE[i].set(SMOKE_HIGH, c ? c.thick : 0, SMOKE_SIZE, 0);
    }
    this.mesh.visible = this.columns.length > 0;
  }
}
