/**
 * A dungeon as the walker's world: its space (world/dungeon/space.ts) placed at `origin`. Floors, walls,
 * ceilings and closed doors all come through `rockSurface`, so the walker and the camera need nothing new.
 */
import type { DungeonSpace } from '../world/dungeon/space';
import type { WalkWorld } from './walker';

export function dungeonWorld(space: DungeonSpace, origin: { x: number; y: number; z: number }): WalkWorld {
  return {
    // No height field down here: far below everything.
    height: () => origin.y - 1000,
    rockSurface: (x, y, z) => space.sdf(x - origin.x, y - origin.y, z - origin.z),
    waterLevel: () => null,
  };
}
