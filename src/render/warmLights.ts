/**
 * Warm firelight: a few point lights, always in the scene (lights are part of every shader's key) and dark
 * until needed, moved each frame to the nearest of a list of spots. On the land at night the spots are
 * the lit doorways; in a cellar they are its torches, and the nearest torch also casts shadows. Each light
 * fades as the next spot in line comes as near, so none pops on or off.
 */
import { PointLight, type Scene, type Vector3 } from 'three/webgpu';
import { hash32, hashToFloat } from '@futuremagic/core';
import type { TownBuilding, TownWall } from '@futuremagic/settlement';
import { ORIGIN } from './origin';

/** Plain point lights in the pool (the shadow torch is one more). */
export const WARM_LIGHTS = 3;
/** Metres over which a light fades out as the next spot comes as near. */
const HAND_OVER = 6;
/** Candela: a lit doorway, a torch. */
const DOOR = 6;
const TORCH = 9;
/** A gate's lanterns: this far out before the wall's face and in behind its leaves (m), this high over the road. */
const GATE_OUT = 0.5, GATE_IN = 1.6, GATE_UP = 3.4;
/** Candela of the soft fill in a room, and how far it reaches (m). */
const FILL = 3;
const FILL_REACH = 7;
/** The shadow torch's cube map side (texels) and reach (m). */
const SHADOW_MAP = 512;
const REACH = 12;

interface Spot { x: number; y: number; z: number; roll: number }

export class WarmLights {
  readonly lights: PointLight[] = [];
  /** The nearest torch underground: the same light, with shadows. Dark (and its map not redrawn) above. */
  readonly shadowed: PointLight;
  private doors: Spot[] = [];
  private torches: Spot[] | null = null;
  private time = 0;
  private frames = 0;
  /** The floating origin's steps when the torch's map was last drawn. */
  private steps = -1;

  constructor(scene: Scene) {
    for (let i = 0; i < WARM_LIGHTS; i++) {
      const l = new PointLight(0xffa860, 0, 11, 2);
      l.castShadow = false;
      l.name = 'warm light';
      this.lights.push(l);
      scene.add(l);
    }
    const s = new PointLight(0xff9a50, 0, REACH, 2);
    s.name = 'torch shadow light';
    s.castShadow = true;
    s.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    s.shadow.camera.near = 0.1;
    s.shadow.camera.far = REACH;
    s.shadow.bias = -0.002;
    s.shadow.autoUpdate = false;
    s.position.set(0, -1e5, 0);
    this.shadowed = s;
    scene.add(s);
  }

  /**
   * The doors: in front of each building's street side, a little above the lintel. And a walled town's gates
   * (`walls`): a lantern before each gateway and one behind its leaves, always lit at night, so a shut gate's
   * oak and iron are seen.
   */
  atDoors(buildings: readonly TownBuilding[], groundAt: (x: number, z: number) => number, walls: readonly TownWall[] = []): void {
    this.doors = buildings.map((b) => {
      const x = b.cx - b.vx * (b.hv + 0.9), z = b.cz - b.vz * (b.hv + 0.9);
      return { x, y: groundAt(x, z) + 2.4, z, roll: hashToFloat(hash32(b.id * 7919 + 17)) };
    });
    for (const w of walls) for (const g of w.gates) {
      // The road's way out is `angle`: out before the wall's face, in behind the leaves.
      for (const d of [w.thick / 2 + GATE_OUT, -(w.thick / 2 + 0.6 + GATE_IN)]) this.doors.push({ x: g.x + d * Math.cos(g.angle), y: g.y + GATE_UP, z: g.z + d * Math.sin(g.angle), roll: -1 });
    }
  }

  /** Underground: the torches (world positions), or null on the way up again. */
  lightTorches(spots: readonly { x: number; y: number; z: number }[] | null): void {
    this.torches = spots ? spots.map((s, i) => ({ ...s, roll: hashToFloat(hash32(i * 104729 + 3)) })) : null;
    if (!spots) this.shadowed.intensity = 0;
  }

  /**
   * Once per frame: `glow` 0 by day .. 1 at night, `share` of the houses with a light on (ignored underground).
   * `hero`: in a room, where the hero stands (null outside). The room's one lamp hangs at the back, so the
   * hero, seen from behind, faced it and showed only a dark back: one light becomes a soft fill from the
   * viewer's side, like the glow of the hearth and the other lamps of the room.
   */
  shine(cam: Vector3, glow: number, share: number, dt: number, hero: { x: number; y: number; z: number } | null = null): void {
    this.time += dt;
    if (this.torches) { this.burn(cam); return; }
    if (hero) {
      // A third of the way from the camera to the hero's chest, a little above.
      const f = { x: cam.x + (hero.x - cam.x) / 3, y: cam.y + (hero.y + 1.3 - cam.y) / 3 + 0.5, z: cam.z + (hero.z - cam.z) / 3, roll: 0 };
      this.setLights(this.lights, [{ s: f, dist: 0 }], FILL, false);
      this.lights[0]!.distance = FILL_REACH;
      return;
    }
    this.lights[0]!.distance = 11;
    const near = glow > 0 ? closest(this.doors.filter((d) => d.roll < share), cam, WARM_LIGHTS + 1) : [];
    this.setLights(this.lights, near, DOOR * glow, false);
  }

  private burn(cam: Vector3): void {
    const near = closest(this.torches!, cam, WARM_LIGHTS + 2);
    // The nearest torch casts shadows; the next ones light without.
    const first = near[0];
    const s = this.shadowed;
    if (first) {
      // The cube map (six views) is redrawn when the torch changes and every third frame after:
      // walls stand still, only people and creatures move.
      // A step of the floating origin moves what the map was drawn of: drawn again too.
      const moved = s.position.x !== first.s.x || s.position.y !== first.s.y || s.position.z !== first.s.z || this.steps !== ORIGIN.steps;
      this.steps = ORIGIN.steps;
      s.position.set(first.s.x, first.s.y, first.s.z);
      s.intensity = TORCH * this.flicker(first.s);
      if (moved || ++this.frames % 3 === 0) s.shadow.needsUpdate = true;
    } else s.intensity = 0;
    this.setLights(this.lights, near.slice(1), TORCH, true);
  }

  private setLights(lights: PointLight[], near: { s: Spot; dist: number }[], strength: number, flicker: boolean): void {
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i]!, n = near[i];
      if (!n || strength <= 0) { l.intensity = 0; continue; }
      const next = near[lights.length]?.dist ?? Infinity;
      l.position.set(n.s.x, n.s.y, n.s.z);
      l.intensity = strength * Math.min(1, (next - n.dist) / HAND_OVER) * (flicker ? this.flicker(n.s) : 1);
    }
  }

  /** A flame's own unsteady brightness (two slow waves and a quick one, out of step per torch). */
  private flicker(s: Spot): number {
    const t = this.time + s.roll * 50;
    return 0.86 + 0.07 * Math.sin(t * 7.3) + 0.05 * Math.sin(t * 13.1 + 1.7) + 0.03 * Math.sin(t * 29.7);
  }
}

function closest(spots: readonly Spot[], cam: Vector3, n: number): { s: Spot; dist: number }[] {
  return spots.map((s) => ({ s, dist: Math.hypot(s.x - cam.x, s.y - cam.y, s.z - cam.z) })).sort((a, b) => a.dist - b.dist).slice(0, n);
}
