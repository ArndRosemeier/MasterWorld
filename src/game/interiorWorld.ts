/**
 * A building's room as the walker's world (D38): its plan (@futuremagic/settlement planInterior) placed
 * in the building's frame at `origin` (below the land, out of sight). The room's walls and ceiling come
 * through `rockSurface`, so the camera keeps inside; the furniture through `wall`.
 */
import { interiorBlocked, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';
import type { WalkWorld } from './walker';

/** A building's frame: room coordinates (a across, b from the door inwards) to the world and back. */
export interface RoomFrame {
  toWorld(a: number, b: number): [number, number];
  toRoom(x: number, z: number): [number, number];
  /** A facing in the room (the plan's convention: atan2(b, a)) as a world direction, atan2(z, x). */
  dirOf(planYaw: number): number;
}

export function roomFrame(b: TownBuilding, origin: { x: number; z: number }): RoomFrame {
  const ux = Math.cos(b.angle), uz = Math.sin(b.angle);
  return {
    toWorld: (a, bb) => [origin.x + ux * a + b.vx * bb, origin.z + uz * a + b.vz * bb],
    toRoom: (x, z) => {
      const dx = x - origin.x, dz = z - origin.z;
      return [dx * ux + dz * uz, dx * b.vx + dz * b.vz];
    },
    dirOf: (y) => {
      const da = Math.cos(y), db = Math.sin(y);
      return Math.atan2(uz * da + b.vz * db, ux * da + b.vx * db);
    },
  };
}

export function interiorWorld(plan: InteriorPlan, frame: RoomFrame, floor: number): WalkWorld {
  return {
    height: () => floor,
    rockSurface: (x, y, z) => {
      const [a, b] = frame.toRoom(x, z);
      return Math.min(plan.ha - Math.abs(a), plan.hb - Math.abs(b), floor + plan.height - y, y - floor + 2);
    },
    waterLevel: () => null,
    wall: (x, z, r) => {
      const [a, b] = frame.toRoom(x, z);
      return interiorBlocked(plan, a, b, r);
    },
  };
}
