/**
 * The rock volumes standing on the land (world/volumes.ts), meshed in the terrain worker and drawn with the
 * terrain's own material: rock on their flanks, the biome's ground on what is level enough to hold it.
 */
import { BufferAttribute, Group } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import type { TerrainJobs } from '../../workers/pool';
import { groundMesh } from './TerrainView';

export class VolumeView {
  readonly group = new Group();

  constructor(private readonly stage: Stage, private readonly jobs: TerrainJobs) {
    this.group.name = 'volumes';
  }

  /** Mesh them all and put them in (they are few, and near the start). */
  async raise(): Promise<void> {
    const meshes = await this.jobs.volumeMeshes();
    for (const m of meshes) {
      const mesh = groundMesh(m, new BufferAttribute(m.index, 1));
      mesh.name = 'volume';
      this.group.add(mesh);
    }
    await this.stage.add(this.group);
  }
}
