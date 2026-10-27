/// <reference lib="webworker" />
/** Terrain meshes: height field chunks, and the rock volumes standing on the land. */
import { buildChunk, type ChunkSpec, type ChunkMesh } from '../world/chunkMesh';
import { archMesh, type VolumeMesh } from '../world/volumes';
import { townMeshBuffers, townMeshes, type TownCellMesh } from '../world/townMesh';
import { guildHouses, guildSigns } from '../game/guilds';
import type { Terrain } from '../world/terrain';
import { openWorld } from '../vgm/builder';
import { settingById } from '../setting/index';
import { horizonMap, type HorizonSpec } from '../world/horizon';
import { serve } from './serve';
import { townMaskData } from '../world/townMask';
import type { Decision } from '../world/decisions';
import type { DungeonLayout } from '@futuremagic/dungeon';
import type { BuildingMesh, TownPlan } from '@futuremagic/settlement';
import { caveField, caveShell, type CaveField } from '../world/dungeon/caveRock';
import { mouthOnLand, type CaveMouth } from '../world/dungeon/caveMouth';
import type { Site } from '../world/dungeon/site';

export type TerrainJob = { seed: number; setting: string } & (({ kind: 'chunk' } & ChunkSpec) | { kind: 'volumes' } | { kind: 'town'; id: string; plan: boolean } | { kind: 'townMask'; id: string; w: number; h: number } | ({ kind: 'horizon' } & HorizonSpec) | { kind: 'caveRock'; layout: DungeonLayout; cave: number } | { kind: 'caveMouth'; site: Site; cave: number } | { kind: 'decisions'; decisions: readonly Decision[] });
export type TerrainResult = ChunkMesh | VolumeMesh[] | TownMeshes | Uint8Array | CaveRock | CaveMouth;

/** A town's buildings merged per cell, and its plan when asked for (a settlement founded while playing is planned here). */
export interface TownMeshes { readonly cells: TownCellMesh[]; readonly plan: TownPlan | null }

/** A cave's rock: the field the walker reads and its mesh. */
export interface CaveRock { readonly field: CaveField; readonly shell: BuildingMesh }

const meshBuffers = (m: BuildingMesh): ArrayBuffer[] => Object.values(m).flatMap((v) => (ArrayBuffer.isView(v) ? [v.buffer as ArrayBuffer] : []));

let terrain: Terrain | null = null;

serve<TerrainJob, TerrainResult>((job) => {
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) terrain = openWorld(job.seed, settingById(job.setting)).terrain;
  if (job.kind === 'decisions') { terrain.settleMore(job.decisions); return { result: new Uint8Array(0), transfer: [] }; }
  if (job.kind === 'volumes') {
    const t = terrain;
    const meshes = t.volumes.map((f) => archMesh(t, f.site)).filter((m): m is VolumeMesh => !!m);
    return { result: meshes, transfer: meshes.flatMap((m) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.surface.buffer, m.level.buffer, m.index.buffer]) };
  }
  if (job.kind === 'town') {
    const town = terrain.town(job.id);
    const cells = town ? townMeshes(town, guildSigns(guildHouses(town.plan, town.decision.size ?? 'town', terrain.setting))) : [];
    return { result: { cells, plan: job.plan && town ? town.plan : null }, transfer: townMeshBuffers(cells) };
  }
  if (job.kind === 'townMask') {
    const town = terrain.town(job.id), data = town ? townMaskData(town, job.w, job.h) : new Uint8Array(job.w * 2 * job.h * 4);
    return { result: data, transfer: [data.buffer] };
  }
  if (job.kind === 'caveRock') {
    const field = caveField(job.layout, job.cave), shell = caveShell(field, job.layout, job.cave);
    return { result: { field, shell }, transfer: [field.d.buffer, ...meshBuffers(shell)] };
  }
  if (job.kind === 'caveMouth') {
    const t = terrain, mouth = mouthOnLand((x, z) => t.height(x, z), job.site, job.cave);
    return { result: mouth, transfer: [mouth.blocked.buffer, ...meshBuffers(mouth.mesh)] };
  }
  if (job.kind === 'horizon') {
    const t = terrain;
    const map = horizonMap((x, z) => t.height(x, z), job);
    return { result: map, transfer: [map.buffer] };
  }
  const mesh = buildChunk(terrain, job);
  return { result: mesh, transfer: [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.surface.buffer, mesh.level.buffer, mesh.canopy.buffer] };
});

