/// <reference lib="webworker" />
/** Terrain meshes: height field chunks, and the rock volumes standing on the land. */
import { buildChunk, finerFor, type ChunkSpec, type ChunkMesh } from '../world/chunkMesh';
import { archMesh, type VolumeMesh } from '../world/volumes';
import { openHouse, townMeshBuffers, townMeshes, type OpenHouse, type TownCellMesh } from '../world/townMesh';
import { guildHouses, guildSigns } from '../game/guilds';
import type { Terrain } from '../world/terrain';
import { openWorld } from '../vgm/builder';
import { settingById } from '../setting/index';
import { horizonMap, type HorizonSpec } from '../world/horizon';
import { serve } from './serve';
import { townMaskData } from '../world/townMask';
import type { Decision } from '../world/decisions';
import type { BuildingMesh, TownBuilding, TownPlan } from '@futuremagic/settlement';
import { caveField, caveShell, type CaveField } from '../world/dungeon/caveRock';
import { mouthOnLand, type CaveMouth } from '../world/dungeon/caveMouth';
import type { Site } from '../world/dungeon/site';
import type { ScaledLayout } from '../world/dungeon/cellar';
import { holdRockOnLand, type HoldRock } from '../world/holdRock';
import { layOut, type SiteJob, type SiteLayout } from '../world/sites';

export type TerrainJob = { seed: number; setting: string } & (({ kind: 'chunk' } & ChunkSpec) | { kind: 'volumes' } | { kind: 'town'; id: string; plan: boolean } | { kind: 'townMask'; id: string; w: number; h: number; i0: number; j0: number } | ({ kind: 'horizon' } & HorizonSpec) | { kind: 'caveRock'; layout: ScaledLayout; cave: number } | { kind: 'caveMouth'; site: Site; cave: number } | { kind: 'holdRock'; site: Site & { readonly level: number }; rock: number } | { kind: 'site'; site: SiteJob } | { kind: 'house'; b: TownBuilding; hatch: boolean; hall: boolean; sign?: [number, number, number] } | { kind: 'decisions'; decisions: readonly Decision[] });
export type TerrainResult = ChunkMesh | VolumeMesh[] | TownMeshes | Uint8Array | CaveRock | CaveMouth | HoldRock | SiteLayout | OpenHouse | null;

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
    const land = terrain, town = land.town(job.id);
    const cells = town ? townMeshes(town, guildSigns(guildHouses(town.plan, town.decision.size ?? 'town', land.setting)), (x, z) => land.height(x, z)) : [];
    return { result: { cells, plan: job.plan && town ? town.plan : null }, transfer: townMeshBuffers(cells) };
  }
  if (job.kind === 'townMask') {
    const town = terrain.town(job.id), data = town ? townMaskData(town, job.w, job.h, job.i0, job.j0) : new Uint8Array(job.w * 2 * job.h * 4);
    return { result: data, transfer: [data.buffer] };
  }
  if (job.kind === 'caveRock') {
    const field = caveField(job.layout, job.cave), shell = caveShell(field, job.layout, job.cave);
    return { result: { field, shell }, transfer: [field.d.buffer, ...meshBuffers(shell)] };
  }
  if (job.kind === 'caveMouth') {
    const t = terrain, mouth = mouthOnLand((x, z) => t.height(x, z), job.site, job.cave);
    return { result: mouth, transfer: [mouth.walk.blocked.buffer, ...meshBuffers(mouth.mesh)] };
  }
  if (job.kind === 'holdRock') {
    const t = terrain, rock = holdRockOnLand((x, z) => t.height(x, z), job.site, job.rock);
    return { result: rock, transfer: [rock.walk.blocked.buffer, ...meshBuffers(rock.mesh)] };
  }
  // A region's place or a sight by the way (tens of milliseconds for a barrow): here, off the main thread (floor F2).
  if (job.kind === 'site') {
    const t = terrain, laid = layOut(job.site, (x, z) => t.height(x, z));
    return { result: laid, transfer: laid ? meshBuffers(laid.mesh) : [] };
  }
  // A building drawn open (D38) as one comes up to its door: its plan and mesh, off the main thread (floor F2).
  if (job.kind === 'house') {
    const house = openHouse(job.b, { hatch: job.hatch, hall: job.hall }, job.sign);
    return { result: house, transfer: [house.mesh, house.lid, house.ladderTop, ...house.doors.map((d) => d.mesh)].flatMap((m) => (m ? meshBuffers(m) : [])) };
  }
  if (job.kind === 'horizon') {
    const t = terrain;
    const map = horizonMap((x, z) => t.height(x, z), job);
    return { result: map, transfer: [map.buffer] };
  }
  const mesh = buildChunk(terrain, { ...job, segs: finerFor(terrain, job) });
  return { result: mesh, transfer: [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.surface.buffer, mesh.level.buffer, mesh.canopy.buffer] };
});

