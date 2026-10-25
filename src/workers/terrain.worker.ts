/// <reference lib="webworker" />
/** Terrain meshes: height field chunks, and the rock volumes standing on the land. */
import { buildChunk, type ChunkSpec, type ChunkMesh } from '../world/chunkMesh';
import { archMesh, type VolumeMesh } from '../world/volumes';
import { Terrain } from '../world/terrain';
import { settingById } from '../setting/index';
import { serve } from './serve';

export type TerrainJob = { seed: number; setting: string } & (({ kind: 'chunk' } & ChunkSpec) | { kind: 'volumes' });
export type TerrainResult = ChunkMesh | VolumeMesh[];

let terrain: Terrain | null = null;

serve<TerrainJob, TerrainResult>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = new Terrain(job.seed, settingById(job.setting));
  if (job.kind === 'volumes') {
    const t = terrain;
    const meshes = t.volumes.map((f) => archMesh(t, f.site)).filter((m): m is VolumeMesh => !!m);
    return { result: meshes, transfer: meshes.flatMap((m) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.surface.buffer, m.level.buffer, m.index.buffer]) };
  }
  const mesh = buildChunk(terrain, job);
  return { result: mesh, transfer: [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.surface.buffer, mesh.level.buffer, mesh.canopy.buffer] };
});
