/// <reference lib="webworker" />
import { Terrain } from '../world/terrain';
import { depthMask, type DepthJob } from '../world/water';
import { settingById } from '../setting/index';
import { serve } from './serve';

let terrain: Terrain | null = null;

serve<DepthJob, Uint8Array>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = new Terrain(job.seed, settingById(job.setting));
  const mask = depthMask(terrain, job);
  return { result: mask, transfer: [mask.buffer] };
});
