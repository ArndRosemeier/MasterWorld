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
import type { Decision, RoadDecision, RoadWay } from '../world/decisions';
import { linkRoad, type Place } from '../vgm/roads';
import { serve } from './serve';

export type WorldJob = ({ kind: 'mask' } & MaskJob) | ({ kind: 'grass' } & MaskJob) | ({ kind: 'roads' } & MaskJob) | ({ kind: 'flora' } & FloraJob) | { kind: 'decisions'; seed: number; setting: string; decisions: readonly Decision[] }
  | { kind: 'link'; seed: number; setting: string; roads: readonly RoadDecision[]; place: Place; way: RoadWay; at?: number };

/** What a job answers: a mask or plant placements; a road routed (or none); nothing for decisions. */
export type WorldResult = Float32Array | RoadDecision | null;

let terrain: Terrain | null = null;

serve<WorldJob, WorldResult>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = openWorld(job.seed, settingById(job.setting)).terrain;
  if (job.kind === 'decisions') { terrain.settleMore(job.decisions); return { result: null, transfer: [] }; }
  // Routing a road takes a few hundred milliseconds: here, off the main thread (floor F2).
  if (job.kind === 'link') return { result: linkRoad(terrain, job.roads, job.place, job.way, job.at), transfer: [] };
  const out = job.kind === 'mask' ? waterMask(terrain, job) : job.kind === 'grass' ? grassMask(terrain, job) : job.kind === 'roads' ? roadMask(terrain.roads, job) : floraPlacement(terrain, job);
  return { result: out, transfer: [out.buffer] };
});
