/**
 * A formed cave as the walker's world (D63, phase K5): its carved field (world/cave, a signed distance, positive in air)
 * placed at `origin`. Floors, walls and ceilings all come through `rockSurface`, as a built dungeon's do (dungeonWorld.ts),
 * so the walker, the camera and the creatures need nothing new. The cave's rock is climbable wherever it stands as a wall.
 */
import { fieldAt, type BrickField } from '../world/dungeon/rockMesh';
import type { WalkWorld } from './walker';

export function formedWorld(field: BrickField, origin: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }): WalkWorld {
  // No height field down here: far below everything.
  const farBelow = (): number => origin.y - 1000;
  return {
    height: farBelow,
    // Outside the field is rock.
    rockSurface: (x, y, z) => fieldAt(field, x - origin.x, y - origin.y, z - origin.z, -1),
    waterLevel: () => null,
    rockHolds: () => true,
  };
}
