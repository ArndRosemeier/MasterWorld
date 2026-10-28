import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';
import { walkFrontier } from '../src/vgm/frontier';
import type { Decision, DecisionLog } from '../src/world/decisions';
import { SMALL } from './small';

export const EAST = 0, SOUTH = Math.PI / 2, WEST = Math.PI;

/**
 * The frontier tests' land (test/frontier*.test.ts and the VGM's tests): the start's land with small drainage tiles
 * (as the flora, water and roads tests): the same town, faster. One land per test file: files share a process in
 * `npm test` (tools/test/run.mjs) and some settle more on theirs.
 */
export function frontierLand() {
  const seed = parseSeed('masterworld');
  const terrain = new Terrain(seed, classic, SMALL);
  const first = firstDecisions(terrain, startPlace(terrain));
  terrain.settle(first);
  const home = terrain.towns[0].decision;
  const regions = classic.regions!;
  /** Walks `km` from the start along `dir` (radians, atan2(z, x)). */
  const walk = (km: number, dir: number, from: DecisionLog = first): Decision[] => [...from, ...walkFrontier({ seed, log: from, terrain, regions, home }, dir, km)];
  // The walks, made when a test first needs them (each test has its own time budget).
  const walks = new Map<number, Decision[]>();
  const along = (dir: number) => walks.get(dir) ?? walks.set(dir, walk(5, dir)).get(dir)!;
  return { seed, terrain, first, home, regions, walk, along };
}
