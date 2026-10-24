/// <reference lib="webworker" />
import { buildChunk, type ChunkSpec, type ChunkMesh } from '../world/chunkMesh';
import { Terrain } from '../world/terrain';
import { settingById } from '../setting/index';
import { serve } from './serve';

export interface TerrainJob extends ChunkSpec {
  seed: number;
  setting: string;
}

let terrain: Terrain | null = null;

serve<TerrainJob, ChunkMesh>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = new Terrain(job.seed, settingById(job.setting));
  const mesh = buildChunk(terrain, job);
  return { result: mesh, transfer: [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.surface.buffer] };
});
