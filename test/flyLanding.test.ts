import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three/webgpu';
import { dungeonWorld } from '../src/game/dungeonWorld';
import type { WalkWorld } from '../src/game/walker';

// The cameras listen on the page; here nothing calls them.
const quiet = { addEventListener() {} };
(globalThis as { window?: unknown }).window ??= quiet;
const { Player } = await import('../src/app/player');

/** A cellar room 6 m x 3 m x 6 m round its origin; rock everywhere else (an SDF: positive in the room). */
const room = { sdf: (x: number, y: number, z: number) => Math.min(3 - Math.abs(x), y, 2.8 - y, 3 - Math.abs(z)) };
const cellar = dungeonWorld(room as never, { x: 100, y: -40, z: 100 });

test('fly landing: a free camera flown out through a cellar wall brings the hero back to where they stood', () => {
  const cam = new PerspectiveCamera();
  const p = new Player(cam, quiet as never, cellar, false);
  p.goTo([100.5, -40, 101]);
  p.flying = true;
  cam.position.set(100, -38, 120); // 20 m out, in the rock
  p.flying = false;
  const w = p.walker.pos;
  assert.deepEqual([w.x, w.y, w.z], [100.5, -40, 101]);
});

test('fly landing: over open land the hero lands under the camera', () => {
  const land: WalkWorld = { height: () => 5, rockSurface: () => null, waterLevel: () => null };
  const cam = new PerspectiveCamera();
  const p = new Player(cam, quiet as never, land, false);
  p.goTo([0, 0]);
  p.flying = true;
  cam.position.set(40, 60, -30);
  p.flying = false;
  const w = p.walker.pos;
  assert.deepEqual([w.x, w.y, w.z], [40, 5, -30]);
});
