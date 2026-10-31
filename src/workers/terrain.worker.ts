/// <reference lib="webworker" />
/** Terrain meshes: height field chunks, and the rock volumes standing on the land. */
import { buildChunk, finerFor, type ChunkSpec, type ChunkMesh } from '../world/chunkMesh';
import { archMesh, type VolumeMesh } from '../world/volumes';
import { openHouse, readyMesh, townMeshBuffers, townMeshes, type OpenHouse, type TownCellMesh } from '../world/townMesh';
import { guildHouses, guildSigns } from '../game/guilds';
import type { Terrain } from '../world/terrain';
import { openWorld } from '../vgm/builder';
import { adoptTiles, traced, type TracedTile } from '../world/hydro';
import { waterMask, type MaskJob } from '../world/water';
import { settingById } from '../setting/index';
import { horizonMap, type HorizonSpec } from '../world/horizon';
import { serve } from './serve';
import { townMaskData } from '../world/townMask';
import type { Decision } from '../world/decisions';
import type { BuildingMesh, TownBuilding, TownPlan } from '@futuremagic/settlement';
import { caveField, caveShell, type CaveField, type CaveThroat } from '../world/dungeon/caveRock';
import { caveFeatures } from '../world/dungeon/caveFeatures';
import { mouthOnLand, type CaveMouth } from '../world/dungeon/caveMouth';
import type { Site } from '../world/dungeon/site';
import type { ScaledLayout } from '../world/dungeon/cellar';
import { holdRockOnLand, type HoldRock } from '../world/holdRock';
import { layOut, type SiteJob, type SiteLayout } from '../world/sites';

export type TerrainJob = { seed: number; setting: string } & (({ kind: 'chunk' } & ChunkSpec) | { kind: 'volumes' } | { kind: 'town'; id: string; plan: boolean } | { kind: 'townMask'; id: string; w: number; h: number; i0: number; j0: number } | ({ kind: 'horizon' } & HorizonSpec) | { kind: 'caveRock'; layout: ScaledLayout; cave: number; keep: readonly (readonly [number, number])[]; throat: CaveThroat | null } | { kind: 'caveMouth'; site: Site; cave: number } | { kind: 'holdRock'; site: Site & { readonly level: number }; rock: number } | { kind: 'site'; site: SiteJob } | { kind: 'house'; b: TownBuilding; hatch: boolean; hall: boolean; sign?: [number, number, number] } | { kind: 'decisions'; decisions: readonly Decision[] } | { kind: 'tiles'; tiles: readonly TracedTile[] } | { kind: 'trace'; brook: boolean; tx: number; tz: number } | ({ kind: 'water' } & Omit<MaskJob, 'seed' | 'setting'>));
export type TerrainResult = TracedTile | Float32Array | ChunkMesh | VolumeMesh[] | TownMeshes | Uint8Array | CaveRock | CaveMouth | HoldRock | SiteLayout | OpenHouse | null;

/** A town's buildings merged per cell, and its plan when asked for (a settlement founded while playing is planned here). */
export interface TownMeshes { readonly cells: TownCellMesh[]; readonly plan: TownPlan | null }

/** A cave's rock: the field the walker reads and its mesh. */
export interface CaveRock { readonly field: CaveField; readonly shell: BuildingMesh }

const meshBuffers = (m: BuildingMesh): ArrayBuffer[] => Object.values(m).flatMap((v) => (ArrayBuffer.isView(v) ? [v.buffer as ArrayBuffer] : []));

let terrain: Terrain | null = null;
/** Time spent opening the world here (ms). */
let openMs = 0;

serve<TerrainJob, TerrainResult>((job) => {
  // The rivers' and brooks' tiles the main thread traced: this worker opens the world on them instead of tracing them.
  if (job.kind === 'tiles') { adoptTiles(job.tiles); return { result: null, transfer: [] }; }
  if (!terrain || terrain.seed !== job.seed || terrain.setting.id !== job.setting) { const t0 = performance.now(); terrain = openWorld(job.seed, settingById(job.setting)).terrain; openMs += performance.now() - t0; }
  // A tile traced here for every worker (TerrainJobs.shareTiles).
  if (job.kind === 'trace') { const t = terrain.hydro.traceTile(job.brook, job.tx, job.tz); return { result: t, transfer: [t.data.buffer] }; }
  if (job.kind === 'water') { const out = waterMask(terrain, job); return { result: out, transfer: [out.buffer] }; }
  if (job.kind === 'decisions') { terrain.settleMore(job.decisions); return { result: new Uint8Array(0), transfer: [] }; }
  if (job.kind === 'volumes') {
    const t = terrain;
    const meshes = t.volumes.map((f) => archMesh(t, f.site)).filter((m): m is VolumeMesh => !!m);
    return { result: meshes, transfer: meshes.flatMap((m) => [m.position.buffer, m.normal.buffer, m.color.buffer, m.surface.buffer, m.level.buffer, m.index.buffer]) };
  }
  if (job.kind === 'town') {
    const land = terrain, town = land.town(job.id);
    // Made ready for the GPU here (floats, spheres), off the main thread.
    const cells = (town ? townMeshes(town, guildSigns(guildHouses(town.plan, town.decision.size ?? 'town', land.setting)), (x, z) => land.height(x, z)) : []).map((c) => ({ ...c, near: readyMesh(c.near), far: readyMesh(c.far) }));
    return { result: { cells, plan: job.plan && town ? town.plan : null }, transfer: townMeshBuffers(cells) };
  }
  if (job.kind === 'townMask') {
    const town = terrain.town(job.id), data = town ? townMaskData(town, job.w, job.h, job.i0, job.j0) : new Uint8Array(job.w * 2 * job.h * 4);
    return { result: data, transfer: [data.buffer] };
  }
  if (job.kind === 'caveRock') {
    const feat = caveFeatures(job.layout, job.cave, job.keep), field = caveField(job.layout, job.cave, feat, undefined, job.throat), shell = caveShell(field, job.layout, job.cave, feat, job.throat);
    return { result: { field, shell }, transfer: [...field.bricks.flatMap((b) => (b ? [b.buffer as ArrayBuffer] : [])), ...meshBuffers(shell)] };
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
  return { result: mesh, transfer: [mesh.position.buffer, mesh.normal.buffer, mesh.color.buffer, mesh.surface.buffer, mesh.level.buffer, mesh.canopy.buffer, mesh.ground.buffer, ...(mesh.index ? [mesh.index.buffer] : [])] };
}, () => ({ ...traced, openMs }));
