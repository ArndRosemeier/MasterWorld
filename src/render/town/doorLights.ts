/**
 * Light spilling from doorways at night: a few warm point lights, always in the scene (lights are part of
 * every shader's key) and dark by day, moved to the lit doors nearest the camera. Each fades as the next
 * door in line comes as near, so none pops on or off.
 */
import { PointLight, type Scene, type Vector3 } from 'three/webgpu';
import { hash32, hashToFloat } from '@futuremagic/core';
import type { TownBuilding } from '@futuremagic/settlement';

/** Point lights in the pool. */
export const DOOR_LIGHTS = 3;
/** Metres over which a light fades out as the next door comes as near. */
const HAND_OVER = 6;
/** Strength of one doorway's light (candela). */
const STRENGTH = 6;

export class DoorLights {
  readonly lights: PointLight[] = [];
  private doors: { x: number; y: number; z: number; roll: number }[] = [];

  constructor(scene: Scene) {
    for (let i = 0; i < DOOR_LIGHTS; i++) {
      const l = new PointLight(0xffa860, 0, 11, 2);
      l.castShadow = false;
      l.name = 'door light';
      this.lights.push(l);
      scene.add(l);
    }
  }

  /** The doors: in front of each building's street side, a little above the lintel. */
  atDoors(buildings: readonly TownBuilding[], groundAt: (x: number, z: number) => number): void {
    this.doors = buildings.map((b) => {
      const x = b.cx - b.vx * (b.hv + 0.9), z = b.cz - b.vz * (b.hv + 0.9);
      return { x, y: groundAt(x, z) + 2.4, z, roll: hashToFloat(hash32(b.id * 7919 + 17)) };
    });
  }

  /** Once per frame: `glow` 0 by day .. 1 at night, `share` of the houses with a light on. */
  shine(cam: Vector3, glow: number, share: number): void {
    const near = glow > 0
      ? this.doors.filter((d) => d.roll < share).map((d) => ({ d, dist: Math.hypot(d.x - cam.x, d.z - cam.z) })).sort((a, b) => a.dist - b.dist).slice(0, DOOR_LIGHTS + 1)
      : [];
    for (let i = 0; i < DOOR_LIGHTS; i++) {
      const l = this.lights[i]!, n = near[i];
      if (!n) { l.intensity = 0; continue; }
      const next = near[DOOR_LIGHTS]?.dist ?? Infinity;
      l.position.set(n.d.x, n.d.y, n.d.z);
      l.intensity = STRENGTH * glow * Math.min(1, (next - n.dist) / HAND_OVER);
    }
  }
}
