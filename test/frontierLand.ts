import { parseSeed } from '@futuremagic/core';
import { classic } from '../src/setting/classic/index';
import { firstDecisions, startPlace } from '../src/vgm/builder';
import { Terrain } from '../src/world/terrain';
import { walkFrontier } from '../src/vgm/frontier';
import type { Decision, DecisionLog } from '../src/world/decisions';
import { SMALL } from './small';

/**
 * The frontier tests' land (test/frontier*.test.ts, two files so each stays well inside its 5 s, docs/CHECKS.md):
 * the start's land with small drainage tiles (as the flora, water and roads tests): the same town, faster.
 */
export const seed = parseSeed('masterworld');
export const terrain = new Terrain(seed, classic, SMALL);
export const first = firstDecisions(terrain, startPlace(terrain));
terrain.settle(first);
export const home = terrain.towns[0].decision;
export const regions = classic.regions!;

/** Walks `km` from the start along `dir` (radians, atan2(z, x)). */
export const walk = (km: number, dir: number, from: DecisionLog = first): Decision[] => [...from, ...walkFrontier({ seed, log: from, terrain, regions, home }, dir, km)];

// The walks, made when a test first needs them (each test has its own time budget).
const walks = new Map<number, Decision[]>();
export const along = (dir: number) => walks.get(dir) ?? walks.set(dir, walk(5, dir)).get(dir)!;
export const EAST = 0, SOUTH = Math.PI / 2, WEST = Math.PI;
