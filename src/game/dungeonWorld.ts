/**
 * A dungeon as the walker's world: its space (world/dungeon/space.ts) placed at `origin`. Floors, walls,
 * ceilings and closed doors all come through `rockSurface`, so the walker and the camera need nothing new.
 */
import type { Prop } from '../world/dungeon/cellar';
import { inFrame } from '../world/dungeon/site';
import type { DungeonSpace } from '../world/dungeon/space';
import type { WalkWorld } from './walker';

/** A tower's way out (a door prop against the wall): the part of it the camera keeps out of, in its frame (m: across; along its facing, the wall at about +0.55 and the pane at -0.5; up). */
const DOOR_ACROSS = 1.0, DOOR_FRONT = -0.65, DOOR_BACK = 1.0, DOOR_UP = 2.7;

/**
 * `hatch`: the way back out. A tower's door stands a little out from its wall (a frame, a pane of daylight, the leaf):
 * the camera keeps out of the space behind it, or it would look at the back of the pane (a flat grey screen).
 */
export function dungeonWorld(space: DungeonSpace, origin: { x: number; y: number; z: number }, hatch?: Prop): WalkWorld {
  const spaceSdf = (x: number, y: number, z: number) => space.sdf(x - origin.x, y - origin.y, z - origin.z);
  const door = hatch?.kind === 'door' ? hatch : null;
  return {
    // No height field down here: far below everything.
    height: () => origin.y - 1000,
    rockSurface: spaceSdf,
    sightSurface: door ? (x, y, z) => Math.min(spaceSdf(x, y, z), doorBox(door, x - origin.x, y - origin.y, z - origin.z)) : undefined,
    waterLevel: () => null,
  };
}

/** Signed distance from the door's box (its frame as the mesh's `spot`: u across, w along its facing). */
function doorBox(p: Prop, x: number, y: number, z: number): number {
  const [u, w] = inFrame(p, x, z);
  const qu = Math.abs(u) - DOOR_ACROSS, qw = Math.abs(w - (DOOR_FRONT + DOOR_BACK) / 2) - (DOOR_BACK - DOOR_FRONT) / 2, qy = Math.abs(y - p.y - DOOR_UP / 2) - DOOR_UP / 2;
  return Math.hypot(Math.max(qu, 0), Math.max(qw, 0), Math.max(qy, 0)) + Math.min(Math.max(qu, qw, qy), 0);
}
