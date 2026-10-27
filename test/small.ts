import type { HydroOptions } from '../src/world/hydro';

/**
 * A small rivers' grid for tests: a 192 km tile instead of the game's 1024 km one. Building the big tile
 * costs about 2 s, so a test file that uses it takes most of its 5 s budget before its first test (docs/CHECKS.md).
 */
export const SMALL: HydroOptions = { cell: 2000, core: 96, margin: 32, minArea: 120 };
