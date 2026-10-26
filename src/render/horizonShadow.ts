/**
 * The hills' shadows far beyond the sun's shadow map: a horizon map (world/horizon.ts) of the land around
 * the camera, built in a terrain worker, hides the sun wherever it stands below the skyline. Read in the
 * sun's colorNode, so it shades everything the sun lights. The textures exist from the start (all lit) and
 * are refilled in place, so no shader is built again.
 */
import { ClampToEdgeWrapping, DataTexture, LinearFilter, RGBAFormat, UnsignedByteType, Vector2, Vector4, type Vector3 } from 'three/webgpu';
import { float, smoothstep, texture, uniform, vec2 } from 'three/tsl';
import { HORIZON_DIRS, type HorizonSpec } from '../world/horizon';
import type { TerrainJobs } from '../workers/pool';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any;

/** Cells a side and the square's side (metres): 64 m cells, skylines up to 8 km away. */
export const HORIZON_RES = 256;
export const HORIZON_SIZE = 16384;
/** Build a new map once the camera is this far from the last one's centre. */
const RECENTRE = 2000;
/** Half the angle (in 0..1 of 90 degrees) over which the sun fades out behind a ridge. */
const SOFT = 0.012;

export class HorizonShadow {
  private readonly planes = [0, 1].map(() => {
    const t = new DataTexture(new Uint8Array(HORIZON_RES * HORIZON_RES * 4), HORIZON_RES, HORIZON_RES, RGBAFormat, UnsignedByteType);
    t.magFilter = t.minFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  });
  private readonly origin = uniform(new Vector2(-1e9, -1e9));
  private readonly weights = [uniform(new Vector4()), uniform(new Vector4())];
  private readonly sunAngle = uniform(1);
  private centre = { x: Infinity, z: Infinity };
  private pending = false;

  /** 1 where the light from `dir` is seen above the skyline at `position` (world), toward 0 behind a ridge. */
  shade(position: N): N {
    const uv = position.xz.sub(this.origin).div(HORIZON_SIZE).toVar();
    const sky = texture(this.planes[0], uv).dot(this.weights[0]).add(texture(this.planes[1], uv).dot(this.weights[1]));
    const lit = smoothstep(sky.sub(SOFT), sky.add(SOFT), this.sunAngle);
    // Outside the map: lit.
    const inside = uv.greaterThanEqual(vec2(0.0)).all().and(uv.lessThanEqual(vec2(1.0)).all());
    return inside.select(lit, float(1.0));
  }

  /** Once per frame: the light's direction (toward it), and a new map when the camera has moved far. */
  track(camera: Vector3, dir: Vector3, jobs: TerrainJobs | null): void {
    const a = Math.atan2(dir.z, dir.x) / (Math.PI * 2) * HORIZON_DIRS;
    const d = ((a % HORIZON_DIRS) + HORIZON_DIRS) % HORIZON_DIRS;
    const d0 = Math.floor(d), f = d - d0, d1 = (d0 + 1) % HORIZON_DIRS;
    const w = [0, 0, 0, 0, 0, 0, 0, 0];
    w[d0] += 1 - f; w[d1] += f;
    this.weights[0].value.set(w[0], w[1], w[2], w[3]);
    this.weights[1].value.set(w[4], w[5], w[6], w[7]);
    this.sunAngle.value = Math.asin(Math.max(-1, Math.min(1, dir.y))) / (Math.PI / 2);
    if (!jobs || this.pending || Math.hypot(camera.x - this.centre.x, camera.z - this.centre.z) < RECENTRE) return;
    const spec: HorizonSpec = { x0: Math.round(camera.x - HORIZON_SIZE / 2), z0: Math.round(camera.z - HORIZON_SIZE / 2), size: HORIZON_SIZE, res: HORIZON_RES };
    this.pending = true;
    void jobs.horizon(spec).then((data) => {
      const plane = HORIZON_RES * HORIZON_RES * 4;
      (this.planes[0].image.data as Uint8Array).set(data.subarray(0, plane));
      (this.planes[1].image.data as Uint8Array).set(data.subarray(plane));
      for (const t of this.planes) t.needsUpdate = true;
      this.origin.value.set(spec.x0, spec.z0);
      this.centre = { x: spec.x0 + HORIZON_SIZE / 2, z: spec.z0 + HORIZON_SIZE / 2 };
      this.pending = false;
    }, () => { this.pending = false; });
  }
}
