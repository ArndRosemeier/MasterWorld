/**
 * Grass around the camera: patches of blades (materials/grass.ts) on a world grid, the near ones with
 * every blade, the far ones with the first quarter (blades are ranked, so a far patch is a near one
 * thinned). Patches outside the view are not drawn. The grass mask comes from the world worker and
 * follows the camera.
 */
import {
  BufferAttribute, DynamicDrawUsage, Frustum, Group, InstancedBufferAttribute, InstancedBufferGeometry, Matrix4, Mesh, Box3, Sphere, Vector3,
  type Camera,
} from 'three/webgpu';
import { BLADES, GRASS, NEAR_END, PATCH, REACH, SEGMENTS, createGrassMaterial } from '../materials/grass';
import type { WorldJobs } from '../../workers/pool';
import { FollowedMask } from '../followedMask';
import { ORIGIN } from '../origin';

/** Vertices and triangles of one blade. */
const VERTS = 2 * SEGMENTS + 1, TRIS = 2 * SEGMENTS - 1;

/** The blades of one patch: spots on a low-discrepancy sequence, so every prefix covers the square evenly. */
function patchGeometry(): { position: BufferAttribute; blade: BufferAttribute; index: BufferAttribute } {
  const pos = new Float32Array(BLADES * VERTS * 3), bl = new Float32Array(BLADES * VERTS * 4), idx = new Uint16Array(BLADES * TRIS * 3);
  const a1 = 0.7548776662466927, a2 = 0.5698402909980532; // the R2 sequence
  let k = 0;
  for (let b = 0; b < BLADES; b++) {
    const x = ((0.5 + a1 * (b + 1)) % 1) * PATCH, z = ((0.5 + a2 * (b + 1)) % 1) * PATCH;
    const rnd = ((Math.sin(b * 12.9898 + 4.1414) * 43758.5453) % 1 + 1) % 1;
    const v0 = b * VERTS;
    for (let v = 0; v < VERTS; v++) {
      const tip = v === VERTS - 1, seg = Math.floor(v / 2);
      pos.set([tip ? 0 : v % 2 ? 1 : -1, tip ? 1 : seg / SEGMENTS, 0], (v0 + v) * 3);
      bl.set([x, z, b / BLADES, rnd], (v0 + v) * 4);
    }
    for (let s = 0; s < SEGMENTS - 1; s++) {
      const a = v0 + 2 * s;
      idx.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], k);
      k += 6;
    }
    const a = v0 + 2 * (SEGMENTS - 1);
    idx.set([a, a + 1, a + 2], k);
    k += 3;
  }
  return { position: new BufferAttribute(pos, 3), blade: new BufferAttribute(bl, 4), index: new BufferAttribute(idx, 1) };
}

interface Layer { mesh: Mesh<InstancedBufferGeometry>; patches: InstancedBufferAttribute; cap: number }

export class GrassView {
  readonly group = new Group();
  private readonly near: Layer;
  private readonly far: Layer;
  private readonly mask: FollowedMask;
  private time = 0;
  private readonly frustum = new Frustum();
  private readonly pv = new Matrix4();
  private readonly box = new Box3();

  constructor(jobs: WorldJobs) {
    const M = GRASS.mask;
    // Rebaked well before the drawn grass (REACH) nears the mask's edge.
    this.mask = new FollowedMask(M, (x0, z0, side, res) => jobs.mask('grass', x0, z0, side, res), M.side / 2 - REACH - 4, 8);
    const parts = patchGeometry(), mat = createGrassMaterial();
    const layer = (cap: number, blades: number): Layer => {
      const g = new InstancedBufferGeometry();
      g.setAttribute('position', parts.position);
      g.setAttribute('gBlade', parts.blade);
      g.setIndex(parts.index);
      g.setDrawRange(0, blades * TRIS * 3);
      const patches = new InstancedBufferAttribute(new Float32Array(cap * 2), 2);
      patches.setUsage(DynamicDrawUsage);
      g.setAttribute('gPatch', patches);
      g.instanceCount = 0;
      // Blades are placed on the GPU: the geometry's own bounds mean nothing, so it is never culled.
      g.boundingSphere = new Sphere(new Vector3(), Infinity);
      const mesh = new Mesh(g, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.name = 'grass';
      this.group.add(mesh);
      return { mesh, patches, cap };
    };
    const r = (n: number) => (2 * Math.ceil(n / PATCH) + 2) ** 2;
    this.near = layer(r(NEAR_END), BLADES);
    this.far = layer(r(REACH), BLADES / 4);
    this.group.name = 'grass';
    // Placed on the GPU relative to the floating origin: the group draws at the identity.
    ORIGIN.pin(this.group);
  }

  /** The mask for the start, before the first frame; one patch each so the warm-up builds the shader. */
  async sow(cam: Vector3): Promise<void> {
    await this.mask.start(cam);
    this.near.mesh.geometry.instanceCount = this.far.mesh.geometry.instanceCount = 1;
  }

  /** The land changed (a road was laid): the mask is baked again. */
  invalidate(): void {
    this.mask.invalidate();
  }

  /** Each frame: the mask follows, the patches in view are listed (the wind is the weather's: WeatherView). */
  tend(dt: number, camera: Camera): void {
    const cam = camera.position;
    this.mask.follow(cam);
    this.time += dt;
    GRASS.time.value = this.time;
    this.pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.pv);
    let nn = 0, nf = 0;
    const n = Math.ceil(REACH / PATCH);
    const pi = Math.floor(cam.x / PATCH), pj = Math.floor(cam.z / PATCH);
    for (let j = pj - n; j <= pj + n; j++) for (let i = pi - n; i <= pi + n; i++) {
      const x0 = i * PATCH, z0 = j * PATCH;
      // Distance from the camera to the nearest point of the patch.
      const dx = Math.max(x0 - cam.x, 0, cam.x - x0 - PATCH), dz = Math.max(z0 - cam.z, 0, cam.z - z0 - PATCH);
      const d = Math.hypot(dx, dz);
      if (d > REACH) continue;
      this.box.min.set(x0, cam.y - 300, z0);
      this.box.max.set(x0 + PATCH, cam.y + 300, z0 + PATCH);
      if (!this.frustum.intersectsBox(this.box)) continue;
      const L = d < NEAR_END ? this.near : this.far;
      const k = L === this.near ? nn++ : nf++;
      if (k >= L.cap) continue;
      L.patches.array[k * 2] = x0;
      L.patches.array[k * 2 + 1] = z0;
    }
    this.finish(this.near, nn);
    this.finish(this.far, nf);
  }

  /** For the HUD: patches drawn near and far, grass at the mask's centre (near the camera). */
  get stats(): string {
    const M = GRASS.mask, c = (M.res / 2) * (M.res + 1) * 4;
    return `grass ${this.near.mesh.geometry.instanceCount}+${this.far.mesh.geometry.instanceCount} · ${M.data[c + 1].toFixed(2)} dense ${M.data[c + 2].toFixed(2)} m`;
  }

  private finish(L: Layer, n: number): void {
    L.mesh.geometry.instanceCount = Math.min(n, L.cap);
    L.patches.needsUpdate = true;
  }
}
