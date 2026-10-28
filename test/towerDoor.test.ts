import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dungeonWorld } from '../src/game/dungeonWorld';
import type { Prop } from '../src/world/dungeon/cellar';
import type { DungeonSpace } from '../src/world/dungeon/space';

// Open space everywhere (10 m from any rock), so only the door counts.
const open = { sdf: () => 10 } as unknown as DungeonSpace;
const origin = { x: 100, y: -400, z: 50 };

test('tower door: the camera keeps out from behind a tower\'s door, whichever wall it is on', () => {
  for (const yaw of [Math.PI, -Math.PI / 2, 0, Math.PI / 2]) {
    // The door 0.55 m out from its wall (as a tower's hatch prop stands); its pane at w = -0.5 along its facing.
    const door: Prop = { kind: 'door', x: 0, z: 0, y: 0, yaw, room: 0 };
    const w = dungeonWorld(open, origin, door);
    const at = (u: number, f: number, y = 1.5) => {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      return w.sightSurface!(origin.x + c * u + s * f, origin.y + y, origin.z - s * u + c * f)!;
    };
    // Between the pane and the wall (where a trailing camera ended up, looking at the pane's back): inside.
    assert.ok(at(0.15, 0, 1.5) < 0 && at(0.15, 0.4, 1.5) < 0, `behind the door, yaw ${yaw}`);
    // Out in the room before it, and beside it: clear.
    assert.ok(at(0, -2.5) > 1 && at(3, 0) > 1, `in the room, yaw ${yaw}`);
    // The walker is not stopped by it (only the camera).
    assert.equal(w.rockSurface(origin.x, origin.y + 1.5, origin.z), 10);
  }
  // A cellar's ladder adds nothing.
  assert.equal(dungeonWorld(open, origin, { kind: 'ladder', x: 0, z: 0, y: 0, yaw: 0, room: 0 }).sightSurface, undefined);
});
