/// <reference lib="webworker" />
import { buildChunk, type ChunkSpec, type ChunkMesh } from '../world/chunkMesh';
import { Terrain } from '../world/terrain';
import { settingById } from '../setting/index';

export interface TerrainJob extends ChunkSpec {
  seed: number;
  setting: string;
}

let terrain: Terrain | null = null;

self.onmessage = (e: MessageEvent<{ id: number; job: TerrainJob }>) => {
  const { id, job } = e.data;
  try {
    if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = new Terrain(job.seed, settingById(job.setting));
    const mesh: ChunkMesh = buildChunk(terrain, job);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, result: mesh }, [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.surface.buffer]);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
