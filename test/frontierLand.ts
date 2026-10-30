import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace, type OpenWorld } from '../src/vgm/builder';
import type { StartPlace } from '../src/world/start';
import type { RegionsDef } from '../src/setting/contract';
import { promiseCellar } from '../src/vgm/dungeons';
import { Terrain } from '../src/world/terrain';
import { walkFrontier } from '../src/vgm/frontier';
import type { Decision, DecisionLog, TownDecision } from '../src/world/decisions';
import { SMALL } from './small';

export const EAST = 0, SOUTH = Math.PI / 2, WEST = Math.PI;

/** The start's land: its terrain settled with the first decisions, the start town's decision, and walks from it. */
export interface Land {
  readonly seed: number;
  readonly terrain: Terrain;
  readonly first: Decision[];
  readonly home: TownDecision;
  readonly start: StartPlace;
  readonly regions: RegionsDef;
  walk(km: number, dir: number, from?: DecisionLog): Decision[];
  along(dir: number): Decision[];
}

/**
 * The start's land (seed masterworld) with small drainage tiles (as the flora, water and roads tests): the same town,
 * faster. Test files share a process in `npm test` (tools/test/run.mjs), so the land is built once per process and
 * shared: its log is frozen and its terrain refuses to settle more (a file that settles more on it, or pushes to its
 * log, takes its own with `{ own: true }`, so it never changes what another file sees).
 */
export function frontierLand(o: { own?: boolean } = {}): Land {
  shared ??= buildLand(null);
  // Its start and first decisions were chosen on the bare land, as they would be again: an own land takes copies.
  return o.own ? buildLand(shared) : shared;
}

/** As `openWorld(parseSeed('masterworld'), classic, SMALL)`, shared as `frontierLand` is (`own` for a fresh one). */
export function startWorld(o: { own?: boolean } = {}): OpenWorld {
  const land = frontierLand(o);
  if (!o.own && sharedWorld) return sharedWorld;
  // As openWorld: the first promise, a cellar under a house of the start town.
  const town = land.terrain.towns[0];
  const cellar = town ? promiseCellar(land.seed, town, land.first) : null;
  const log = cellar ? [...land.first, cellar] : [...land.first];
  const world = { terrain: land.terrain, log: o.own ? log : Object.freeze(log), home: land.start };
  if (!o.own) sharedWorld = world;
  return world;
}

let shared: Land | null = null;
let sharedWorld: OpenWorld | null = null;

function buildLand(base: Land | null): Land {
  const seed = parseSeed('masterworld'), guard = !base;
  const terrain = new Terrain(seed, classic, SMALL);
  const start = base ? { ...base.start } : startPlace(terrain);
  const built = base ? structuredClone(base.first) as Decision[] : firstDecisions(terrain, start);
  terrain.settle(built);
  const first: Decision[] = guard ? (Object.freeze(built) as Decision[]) : built;
  if (guard) {
    for (const m of ['settle', 'settleMore', 'addTown', 'addRoad'] as const) {
      terrain[m] = () => { throw new Error(`the shared start land: use frontierLand({ own: true }) or startWorld({ own: true }) to ${m}`); };
    }
  }
  const home = terrain.towns[0].decision;
  const regions = classic.regions!;
  /** Walks `km` from the start along `dir` (radians, atan2(z, x)). */
  const walk = (km: number, dir: number, from: DecisionLog = first): Decision[] => [...from, ...walkFrontier({ seed, log: from, terrain, regions, home }, dir, km)];
  // The walks, made when a test first needs them (each test has its own time budget).
  const walks = new Map<number, Decision[]>();
  const along = (dir: number) => walks.get(dir) ?? walks.set(dir, guard ? (Object.freeze(walk(5, dir)) as Decision[]) : walk(5, dir)).get(dir)!;
  return { seed, terrain, first, home, start, regions, walk, along };
}
