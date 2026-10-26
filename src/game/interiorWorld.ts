/**
 * An open building as part of the walker's world (D38, in place): its storeys, stairs and furniture
 * (@futuremagic/settlement planInterior) where the building stands. Floors, the top ceiling, the walls,
 * the steps and the rails come through `rockSurface` (so the walker climbs the stairs and the camera keeps
 * inside), the furniture of the storey one is on through `wall`. Pure.
 */
import { interiorBlocked, interiorSolids, storeyAt, WALL_THICK, type InteriorBox, type InteriorPlan, type TownBuilding } from '@futuremagic/settlement';

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

/** What an open building adds to the walker's world. */
export interface HouseWalk {
  readonly building: TownBuilding;
  readonly plan: InteriorPlan;
  readonly frame: RoomFrame;
  /** The solids' signed distance (positive in air), or null away from the building. */
  rockSurface(x: number, y: number, z: number): number | null;
  /** Whether a body there touches a wall or furniture, or null outside the building (its feet at `y`). */
  wallAt(x: number, z: number, r: number, y?: number): boolean | null;
  /** Whether (x, z) lies within the building's walls (any storey's). */
  within(x: number, z: number): boolean;
  /** The storey of feet at world height y. */
  storey(y: number): number;
  /** A point on a storey's floor in the world. */
  floorAt(a: number, b: number, storey: number): { x: number; y: number; z: number };
}

export function houseWalk(b: TownBuilding, plan: InteriorPlan): HouseWalk {
  const frame = roomFrame(b, { x: b.cx, z: b.cz });
  const solids = interiorSolids(plan);
  const W = WALL_THICK, reach = Math.hypot(b.hu, b.hv) + 2;
  // Each storey's outer walls (b: jettied ones stand further out).
  const outer = plan.storeys.map((s) => ({ a0: s.a0 - W, a1: s.a1 + W, b0: s.b0 - W, b1: s.b1 + W }));
  const storey = (y: number) => storeyAt(plan, y - b.floorY);
  return {
    building: b, plan, frame, storey,
    rockSurface: (x, y, z) => {
      if (Math.abs(x - b.cx) > reach || Math.abs(z - b.cz) > reach) return null;
      const [a, bb] = frame.toRoom(x, z), h = y - b.floorY;
      if (Math.abs(a) > b.hu + 1 || bb < outer[outer.length - 1].b0 - 1 || bb > outer[outer.length - 1].b1 + 1) return null;
      let d = Infinity;
      for (const q of solids) d = Math.min(d, boxDistance(q, a, h, bb));
      return d;
    },
    wallAt: (x, z, r, y) => {
      const [a, bb] = frame.toRoom(x, z), k = y === undefined ? 0 : storey(y), o = outer[k];
      if (a < o.a0 - r || a > o.a1 + r || bb < o.b0 - r || bb > o.b1 + r) return null;
      return interiorBlocked(plan, a, bb, r, k);
    },
    within: (x, z) => {
      const [a, bb] = frame.toRoom(x, z);
      return outer.some((o) => a > o.a0 && a < o.a1 && bb > o.b0 && bb < o.b1);
    },
    floorAt: (a, bb, k) => {
      const [x, z] = frame.toWorld(a, bb);
      return { x, y: b.floorY + plan.storeys[k].y, z };
    },
  };
}

/** Signed distance from (a, y, b) to a box (negative inside). */
function boxDistance(q: InteriorBox, a: number, y: number, b: number): number {
  const da = Math.max(q.a0 - a, a - q.a1), dy = Math.max(q.y0 - y, y - q.y1), db = Math.max(q.b0 - b, b - q.b1);
  const out = Math.hypot(Math.max(da, 0), Math.max(dy, 0), Math.max(db, 0));
  return out > 0 ? out : Math.max(da, dy, db);
}
