/**
 * A worker-baked mask that follows the camera: rebaked, centred on the camera (snapped), once the camera
 * strays `keep` metres from its centre. The old mask stays in use until the new one arrives.
 */
import type { Vector3 } from 'three/webgpu';
import type { FloatMask } from './materials/masks';
import { until } from '../workers/pool';

export class FollowedMask {
  ready = false;
  private pending = false;
  /** Baked from a land that has changed since (`invalidate`): baked again where the camera is. */
  private stale = false;
  /** The minimum corner of the data in use. */
  x0 = 1e9;
  z0 = 1e9;

  constructor(readonly mask: FloatMask, private readonly bake: (x0: number, z0: number, side: number, res: number) => Promise<Float32Array>, private readonly keep: number, private readonly snap: number) {}

  /** Asks for a new mask if the camera has strayed (or there is none yet). */
  follow(cam: Vector3): void {
    if (this.pending) return;
    const half = this.mask.side / 2;
    if (this.ready && !this.stale && Math.max(Math.abs(cam.x - (this.x0 + half)), Math.abs(cam.z - (this.z0 + half))) < this.keep) return;
    const x0 = Math.round(cam.x / this.snap) * this.snap - half, z0 = Math.round(cam.z / this.snap) * this.snap - half;
    this.pending = true;
    this.stale = false;
    void this.bake(x0, z0, this.mask.side, this.mask.res).then((px) => {
      this.mask.data.set(px);
      this.mask.tex.needsUpdate = true;
      this.mask.origin.value.set(x0, z0);
      this.x0 = x0; this.z0 = z0;
      this.ready = true;
      this.pending = false;
    });
  }

  /** The land changed (a road was laid): bake again at the next `follow`, keeping this one until then. */
  invalidate(): void {
    this.stale = true;
  }

  /** The first mask, before the first frame. */
  async start(cam: Vector3): Promise<void> {
    this.follow(cam);
    await until(() => this.ready);
  }
}
