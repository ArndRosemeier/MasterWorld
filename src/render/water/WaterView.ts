/**
 * The sea: one camera-centred radial mesh at sea level (Xenoworld's design: water quads per chunk never
 * line up across detail levels). Where water is and how deep comes from depth masks baked in a worker:
 * a near one for shores, a far one to the horizon.
 */
import { BufferGeometry, Float32BufferAttribute, Mesh, type Vector3 } from 'three/webgpu';
import { deriveSeed, Rng } from '@futuremagic/core';
import type { SkyLight } from '@futuremagic/sky';
import { WATER, type DepthMask } from '../materials/waterInputs';
import { WATER_KIND } from '../materials/water';
import { MASK_RES, decodeDepth } from '../../world/water';
import type { WaterPool } from '../../workers/pool';

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

interface MaskState { mask: DepthMask; ready: boolean; pending: boolean; x0: number; z0: number }

export class WaterView {
  readonly mesh: Mesh;
  private readonly masks: MaskState[];
  private time = 0;

  constructor(private readonly pool: WaterPool, private readonly seed: number, private readonly setting: string) {
    // Rings grow geometrically: ~0.4 m apart under the camera, out past the horizon (~150 km).
    this.mesh = new Mesh(radialGrid(192, 150, 0.4, 1.068), WATER_KIND.make());
    this.mesh.name = 'sea';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.masks = [WATER.near, WATER.far].map((mask) => ({ mask, ready: false, pending: false, x0: 1e9, z0: 1e9 }));
    const a = new Rng(deriveSeed(seed, 'wind')).float() * Math.PI * 2;
    WATER.wind.value.set(Math.cos(a), Math.sin(a));
  }

  get ready(): boolean { return this.masks.every((m) => m.ready); }

  /** Sea depth at a point from the masks (metres; negative on land), or null where no mask has data. */
  depthAt(x: number, z: number): number | null {
    for (const s of this.masks) {
      if (!s.ready) continue;
      const u = (x - s.x0) / s.mask.side, v = (z - s.z0) / s.mask.side;
      if (u < 0 || v < 0 || u >= 1 || v >= 1) continue;
      const i = Math.floor(u * MASK_RES), j = Math.floor(v * MASK_RES);
      return decodeDepth(s.mask.data[(j * MASK_RES + i) * 4]);
    }
    return null;
  }

  /** True when `p` is under the water surface (calm level; waves are within a metre or two). */
  submerged(p: Vector3): boolean {
    const d = this.depthAt(p.x, p.z);
    return d !== null && p.y < WATER.level.value && d > WATER.level.value - p.y - 0.3;
  }

  private refresh(s: MaskState, cam: Vector3): void {
    if (s.pending) return;
    const side = s.mask.side, half = side / 2;
    if (s.ready && Math.abs(cam.x - (s.x0 + half)) < side / 5 && Math.abs(cam.z - (s.z0 + half)) < side / 5) return;
    const snap = side / 16;
    const x0 = Math.round(cam.x / snap) * snap - half, z0 = Math.round(cam.z / snap) * snap - half;
    s.pending = true;
    void this.pool.run({ seed: this.seed, setting: this.setting, x0, z0, size: side, res: MASK_RES }).then((px) => {
      s.mask.data.set(px);
      s.mask.tex.needsUpdate = true;
      s.mask.origin.value.set(x0, z0);
      s.x0 = x0; s.z0 = z0;
      s.ready = true;
      s.pending = false;
    });
  }

  /** Masks for the start, before the first frame. */
  async prime(cam: Vector3): Promise<void> {
    for (const s of this.masks) this.refresh(s, cam);
    while (!this.ready) await new Promise((r) => setTimeout(r, 20));
  }

  /** `gain`: the multiplier the scene's lights carry on the sky's light rig (SkyView.gain). */
  update(dt: number, cam: Vector3, L: SkyLight, gain: number): void {
    for (const s of this.masks) this.refresh(s, cam);
    this.time += dt;
    WATER.time.value = this.time;
    const snap = 4;
    WATER.center.value.set(Math.round(cam.x / snap) * snap, WATER.level.value, Math.round(cam.z / snap) * snap);
    this.mesh.position.copy(WATER.center.value);
    WATER.sunDir.value.set(...L.lightDir);
    const sun = L.lightIntensity * gain, sky = L.hemiIntensity * gain * 0.7;
    WATER.sunColor.value.setRGB(L.lightColor[0] * sun, L.lightColor[1] * sun, L.lightColor[2] * sun);
    WATER.ambient.value.setRGB(L.skyColor[0] * sky, L.skyColor[1] * sky, L.skyColor[2] * sky);
    // The reflection is the sky itself (the environment map holds its radiance), not the fill light.
    WATER.env.value = 1;
  }
}
