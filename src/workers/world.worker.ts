/// <reference lib="webworker" />
/**
 * Jobs over the land around the camera: water and grass masks, and where plants grow. One worker, so the hydrology
 * tiles both need are computed once.
 */
import type { Terrain } from '../world/terrain';
import { openWorld } from '../vgm/builder';
import { waterMask, type MaskJob } from '../world/water';
import { floraPlacement, type FloraJob } from '../world/flora';
import { grassMask } from '../world/grass';
import { settingById } from '../setting/index';
import { roadMask } from '../world/roads';
import type { Decision } from '../world/decisions';
import { serve } from './serve';

export type WorldJob = ({ kind: 'mask' } & MaskJob) | ({ kind: 'grass' } & MaskJob) | ({ kind: 'roads' } & MaskJob) | ({ kind: 'flora' } & FloraJob) | { kind: 'decisions'; seed: number; setting: string; decisions: readonly Decision[] };

let terrain: Terrain | null = null;

serve<WorldJob, Float32Array>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = openWorld(job.seed, settingById(job.setting)).terrain;
  if (job.kind === 'decisions') { terrain.settleMore(job.decisions); return { result: new Float32Array(0), transfer: [] }; }
  const out = job.kind === 'mask' ? waterMask(terrain, job) : job.kind === 'grass' ? grassMask(terrain, job) : job.kind === 'roads' ? roadMask(terrain.roads, job) : floraPlacement(terrain, job);
  return { result: out, transfer: [out.buffer] };
});
