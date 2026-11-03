import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';
import { HeroCamera } from '../src/app/heroCamera';
import type { WalkWorld } from '../src/game/walker';

// The hero's camera trails five metres behind; a giant's body stands in the way, and the camera comes in short of it (the hero is never seen from inside it).
(globalThis as { window?: unknown }).window ??= { addEventListener() { /* no events in a test */ } };
const el = { addEventListener() { /* nor here */ } } as unknown as HTMLElement;

/** A flat land with one body of `radius` at (0, z0): `bigger` counts only bodies at least that wide (WalkWorld.bodies). */
function world(radius: number, z0: number): WalkWorld {
  return {
    height: () => 0,
    rockSurface: () => null,
    waterLevel: () => null,
    bodies: (x, z, r, _y, _ax, _az, bigger = 0) => radius >= bigger && Math.hypot(x, z - z0) < radius + r,
  };
}

function boom(w: WalkWorld): number {
  const camera = new PerspectiveCamera(), cam = new HeroCamera(camera, el, w);
  const head = new Vector3(0, 1.7, 0);
  cam.yaw = 0;
  cam.trail(head, 0);
  return camera.position.distanceTo(head);
}

test('camera: trails at its distance in the open, and a giant behind the hero keeps it from being inside the giant', () => {
  const open = boom(world(0.4, 99)), giant = boom(world(5.7, 8));
  assert.ok(open > 4.9, `open ground: ${open.toFixed(2)} m`);
  // The giant's edge is 2.3 m behind the hero (8 - 5.7): the camera stops short of it.
  assert.ok(giant < 2.3, `with a giant behind: ${giant.toFixed(2)} m`);
  // A wolf (or any body less than a giant's) behind the hero does not move the camera.
  assert.ok(boom(world(0.4, 3)) > 4.9, 'a wolf is no reason to come in');
});
