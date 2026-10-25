/**
 * The water: one camera-centred radial mesh for sea, lakes and rivers (Xenoworld's design: water quads per chunk never
 * line up across detail levels). Each vertex takes its height from water masks baked in a worker (surface
 * level, depth and flow): a near one for shores and small rivers, a
 * mid one for larger rivers and lakes, a far one to the horizon.
 */
import { BufferGeometry, Float32BufferAttribute, Mesh, type Vector3 } from 'three/webgpu';
import type { SkyLight } from '@futuremagic/sky';
import { WATER } from '../materials/waterInputs';
import { WATER_KIND } from '../materials/water';
import type { WorldJobs } from '../../workers/pool';
import { FollowedMask } from '../followedMask';
import { prevailingWind } from '../../world/weather';

function radialGrid(segments: number, rings: number, r0: number, growth: number): BufferGeometry {
  const pos: number[] = [0, 0, 0];
  const idx: number[] = [];
  for (let i = 1; i <= rings; i++) {
    const r = (r0 * (Math.pow(growth, i) - 1)) / (growth - 1);
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
    }
  }
  const ring = (i: number, s: number) => 1 + (i - 1) * segments + (s % segments);
  for (let s = 0; s < segments; s++) idx.push(0, ring(1, s + 1), ring(1, s));
  for (let i = 1; i < rings; i++) for (let s = 0; s < segments; s++) {
    const a = ring(i, s), b = ring(i, s + 1), c = ring(i + 1, s + 1), d = ring(i + 1, s);
    idx.push(a, b, c, a, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class WaterView {
  readonly mesh: Mesh;
  private readonly masks: FollowedMask[];
  private time = 0;

  constructor(jobs: WorldJobs) {
    // Rings grow geometrically: ~0.4 m apart under the camera, out past the horizon (~150 km).
    this.mesh = new Mesh(radialGrid(192, 150, 0.4, 1.068), WATER_KIND.make());
    this.mesh.name = 'sea';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    // Each rebaked once the camera is a fifth of its side from its centre.
    this.masks = [WATER.near, WATER.mid, WATER.far].map((mask) => new FollowedMask(mask, (x0, z0) => jobs.mask('mask', x0, z0, mask.side, mask.res), mask.side / 5, mask.side / 16));
    // The swell runs with the prevailing wind (the weather's gusts and turns only change its height).
    const a = prevailingWind(jobs.seed);
    WATER.wind.value.set(Math.cos(a), Math.sin(a));
  }

  get ready(): boolean { return this.masks.every((m) => m.ready); }

  /** Water surface level and depth at a point (nearest mask sample), or null where no mask has data. */
  waterAt(x: number, z: number): { level: number; depth: number } | null {
    for (const s of this.masks) {
      if (!s.ready) continue;
      const res = s.mask.res, u = (x - s.x0) / s.mask.side, v = (z - s.z0) / s.mask.side;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const p = (Math.floor(v * res) * res + Math.floor(u * res)) * 4;
      return { level: s.mask.data[p], depth: s.mask.data[p + 1] };
    }
    return null;
  }

  /** True when `p` is under the water surface (calm level; waves are within a metre or two). */
  submerged(p: Vector3): boolean {
    const w = this.waterAt(p.x, p.z);
    return w !== null && w.depth > 0 && p.y < w.level - 0.05;
  }

  /** Masks for the start, before the first frame. */
  async prime(cam: Vector3): Promise<void> {
    await Promise.all(this.masks.map((m) => m.start(cam)));
  }

  /** `gain`: the multiplier the scene's lights carry on the sky's light rig (SkyView.gain). */
  update(dt: number, cam: Vector3, L: SkyLight, gain: number): void {
    for (const m of this.masks) m.follow(cam);
    this.time += dt;
    WATER.time.value = this.time;
    const snap = 4;
    WATER.center.value.set(Math.round(cam.x / snap) * snap, 0, Math.round(cam.z / snap) * snap);
    this.mesh.position.copy(WATER.center.value);
    WATER.sunDir.value.set(...L.lightDir);
    const sun = L.lightIntensity * gain, sky = L.hemiIntensity * gain * 0.7;
    WATER.sunColor.value.setRGB(L.lightColor[0] * sun, L.lightColor[1] * sun, L.lightColor[2] * sun);
    WATER.ambient.value.setRGB(L.skyColor[0] * sky, L.skyColor[1] * sky, L.skyColor[2] * sky);
    // The reflection is the sky itself (the environment map holds its radiance), not the fill light.
    WATER.env.value = 1;
  }
}
