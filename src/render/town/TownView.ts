/**
 * The town's buildings (world/townMesh.ts, meshed in the terrain worker), one mesh per cell near and one
 * far: the far one (no frames, shutters or sills) takes over past FAR metres. Drawn with the building
 * shader (materials/building.ts).
 */
import { BufferAttribute, BufferGeometry, Group, type Mesh, type Vector3 } from 'three/webgpu';
import type { BuildingMesh } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import type { TerrainJobs } from '../../workers/pool';
import { BUILDING } from '../materials/building';
import { kindMesh } from '../materials';

/** From this far (m, camera to the cell's middle) the far meshes draw. */
const FAR = 200;
/** Switch back a little nearer, so a camera on the line does not flicker between the two. */
const HYSTERESIS = 12;

interface Cell { x: number; z: number; near: Mesh; far: Mesh }

export class TownView {
  readonly group = new Group();
  private readonly cells: Cell[] = [];

  constructor(private readonly stage: Stage, private readonly jobs: TerrainJobs) {
    this.group.name = 'town';
  }

  /** Mesh the `index`th town's buildings and put them in. */
  async build(index: number, cam: Vector3): Promise<void> {
    const cells = await this.jobs.townMeshes(index);
    for (const c of cells) {
      const near = cellMesh(c.near, c.x, c.z), far = cellMesh(c.far, c.x, c.z);
      this.group.add(near, far);
      this.cells.push({ x: c.x, z: c.z, near, far });
    }
    this.update(cam, true);
    await this.stage.add(this.group);
  }

  /** Near or far meshes, by distance. */
  update(cam: Vector3, force = false): void {
    for (const c of this.cells) {
      const d = Math.hypot(cam.x - c.x, cam.z - c.z);
      const far = force || !c.far.visible ? d > FAR : d > FAR - HYSTERESIS;
      c.near.visible = !far;
      c.far.visible = far;
    }
  }

  /** Triangles in the meshes drawn now (for the HUD). */
  get triangles(): number {
    let n = 0;
    for (const c of this.cells) n += ((c.near.visible ? c.near : c.far).geometry.index?.count ?? 0) / 3;
    return n;
  }
}

/** A cell's mesh: the attributes the building shader reads, at (x, 0, z). */
function cellMesh(m: BuildingMesh, x: number, z: number): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('normal', new BufferAttribute(m.normal, 3));
  g.setAttribute('uv', new BufferAttribute(m.uv, 2));
  // Floats: WebGPU has no 1- or 3-byte vertex formats.
  g.setAttribute('mat', new BufferAttribute(Float32Array.from(m.mat), 1));
  g.setAttribute('tint', new BufferAttribute(Float32Array.from(m.tint, (v) => v / 255), 3));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.computeBoundingSphere();
  const mesh = kindMesh(g, BUILDING, x, 0, z);
  mesh.name = 'buildings';
  return mesh;
}
