/// <reference lib="webworker" />
/**
 * Jobs over the land around the camera: water masks and where plants grow. One worker, so the hydrology
 * tiles both need are computed once.
 */
import { Terrain } from '../world/terrain';
import { waterMask, type MaskJob } from '../world/water';
import { floraPlacement, type FloraJob } from '../world/flora';
import { settingById } from '../setting/index';
import { serve } from './serve';

export type WorldJob = ({ kind: 'mask' } & MaskJob) | ({ kind: 'flora' } & FloraJob);

let terrain: Terrain | null = null;

serve<WorldJob, Float32Array>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = new Terrain(job.seed, settingById(job.setting));
  const out = job.kind === 'mask' ? waterMask(terrain, job) : floraPlacement(terrain, job);
  return { result: out, transfer: [out.buffer] };
});
