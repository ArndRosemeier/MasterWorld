/**
 * Trees and shrubs around the camera (@futuremagic/vegetation models, drawn instanced). Placements come
 * from the world worker (world/flora.ts) in square cells: near cells hold every plant, far cells a thinned
 * set of bigger stand-ins. Up close a tree is its full model (wood and leaf cards); further out its far
 * canopy hull; past the near cells only the far cells' hulls remain.
 */
import { Group, Matrix4, Mesh, Quaternion, Vector3, type BufferGeometry, type InstancedBufferGeometry, type InstancedInterleavedBuffer, type Material } from 'three/webgpu';
import { shrubModel, treeModel, vegetationUniforms, type TreeModel, type TreeSpecies } from '@futuremagic/vegetation';
import { batchCap, createBarkMaterial, createFarTreeMaterial, createLeafMaterial, instancedGeometry } from '@futuremagic/vegetation/node';
import type { Stage } from '@futuremagic/stage';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING } from '../../world/flora';
import { until, type WorldJobs } from '../../workers/pool';

/** Near cells: side (m) and how many around the camera's cell either way. */
const NEAR_CELL = 64, NEAR_REACH = 6;
/** Far cells: side (m) and reach; their candidate spacing. */
const FAR_CELL = 512, FAR_REACH = 2, FAR_SPACING = 16;
/** Full models within this distance (m), hulls beyond. Shrubs end here too. */
const FULL = 60;

interface Cell { pending: boolean; data: Float32Array | null }
/** One batch: a model part drawn once per instance (matrices in an instanced geometry attribute). */
interface Part { geo: BufferGeometry; mat: Material; mesh: Mesh<InstancedBufferGeometry>; matrices: Float32Array; buffer: InstancedInterleavedBuffer; cap: number; n: number }

export class FloraView {
  readonly group = new Group();
  private readonly near = new Map<string, Cell>();
  private readonly far = new Map<string, Cell>();
  private readonly models: TreeModel[];
  /** Per kind: full model parts (wood, leaves) and the hull (null for shrubs). */
  private readonly full: Part[][];
  private readonly hull: (Part | null)[];
  private center = { i: NaN, j: NaN };
  /** Where the camera was at the last rebuild (full models follow it). */
  private readonly at = new Vector3(Infinity, 0, 0);
  private dirty = true;
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(private readonly stage: Stage, private readonly jobs: WorldJobs) {
    const U = vegetationUniforms;
    const bark = createBarkMaterial(U), leaf = createLeafMaterial(U, false), needles = createLeafMaterial(U, true), hull = createFarTreeMaterial(U);
    // The hulls' baked colours read lighter than the leaf cards they stand in for.
    hull.color.setScalar(0.75);
    this.models = FLORA_KINDS.map((k) => (k.species === 'shrub' ? shrubModel(k.variant) : treeModel(k.species as TreeSpecies, k.variant)));
    this.full = this.models.map((m, k) => [this.part(m.wood, bark, 64, true), this.part(m.leaves, FLORA_KINDS[k].conifer ? needles : leaf, 64, true)]);
    this.hull = this.models.map((m) => (m.isShrub ? null : this.part(m.far, hull, 512, true)));
    this.group.name = 'flora';
  }

  private part(geo: BufferGeometry, mat: Material, cap: number, shadow: boolean): Part {
    const { geometry, matrices, buffer } = instancedGeometry(geo, cap);
    const mesh = new Mesh(geometry, mat);
    mesh.frustumCulled = false;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return { geo, mat, mesh, matrices, buffer, cap, n: 0 };
  }

  /** Placements for the start, before the first frame. */
  async placeStart(cam: Vector3): Promise<void> {
    this.follow(cam);
    await until(() => [...this.near.values(), ...this.far.values()].every((c) => c.data));
    this.rebuild(cam);
  }

  /** Cells around the camera: asks for the missing ones. */
  private follow(cam: Vector3): void {
    const ci = Math.floor(cam.x / NEAR_CELL), cj = Math.floor(cam.z / NEAR_CELL);
    if (ci !== this.center.i || cj !== this.center.j) {
      this.center = { i: ci, j: cj };
      this.dirty = true;
    }
    this.fetch(this.near, NEAR_CELL, NEAR_REACH, NEAR_SPACING, cam);
    this.fetch(this.far, FAR_CELL, FAR_REACH, FAR_SPACING, cam);
  }

  private fetch(cells: Map<string, Cell>, side: number, reach: number, spacing: number, cam: Vector3): void {
    const ci = Math.floor(cam.x / side), cj = Math.floor(cam.z / side);
    const want = new Set<string>();
    for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
      const i = ci + di, j = cj + dj, key = `${i},${j}`;
      want.add(key);
      if (cells.has(key)) continue;
      const cell: Cell = { pending: true, data: null };
      cells.set(key, cell);
      void this.jobs.flora(i * side, j * side, side, spacing).then((d) => {
        cell.data = d;
        cell.pending = false;
        this.dirty = true;
      });
    }
    // Forget cells well out of reach (kept a little while, so walking back and forth costs nothing).
    for (const [key, c] of cells) {
      const [i, j] = key.split(',').map(Number);
      if (!c.pending && Math.max(Math.abs(i - ci), Math.abs(j - cj)) > reach + 2) cells.delete(key);
    }
  }

  update(dt: number, cam: Vector3): void {
    vegetationUniforms.uTime.value += dt;
    this.follow(cam);
    if (this.dirty || Math.hypot(cam.x - this.at.x, cam.z - this.at.z) > 8) this.rebuild(cam);
  }

  /** Every instance anew, around the camera's current cell. */
  private rebuild(cam: Vector3): void {
    this.dirty = false;
    this.at.copy(cam);
    for (const parts of this.full) for (const p of parts) p.n = 0;
    for (const p of this.hull) if (p) p.n = 0;
    const cx = (this.center.i + 0.5) * NEAR_CELL, cz = (this.center.j + 0.5) * NEAR_CELL;
    const nearHalf = (NEAR_REACH + 0.5) * NEAR_CELL;
    for (const [key, c] of this.near) {
      if (!c.data) continue;
      const [i, j] = key.split(',').map(Number);
      if (Math.max(Math.abs(i - this.center.i), Math.abs(j - this.center.j)) > NEAR_REACH) continue;
      this.place(c.data, (x, z, kind) => {
        const full = Math.hypot(x - cam.x, z - cam.z) < FULL;
        return full ? this.full[kind] : this.hull[kind] ? [this.hull[kind]!] : [];
      });
    }
    for (const c of this.far.values()) {
      if (!c.data) continue;
      // The near cells cover their square; far stand-ins only outside it.
      this.place(c.data, (x, z, kind) => (Math.max(Math.abs(x - cx), Math.abs(z - cz)) < nearHalf || !this.hull[kind] ? [] : [this.hull[kind]!]));
    }
    for (const parts of this.full) for (const p of parts) this.finish(p);
    for (const p of this.hull) if (p) this.finish(p);
  }

  private place(d: Float32Array, parts: (x: number, z: number, kind: number) => Part[]): void {
    for (let r = 0; r < d.length; r += FLORA_STRIDE) {
      const x = d[r], y = d[r + 1], z = d[r + 2], scale = d[r + 3], yaw = d[r + 4], kind = d[r + 5];
      const ps = parts(x, z, kind);
      if (!ps.length) continue;
      this.m.compose(this.v.set(x, y, z), this.q.setFromAxisAngle(this.up, yaw), this.s.setScalar(scale));
      for (const p of ps) {
        if (p.n >= p.cap) this.grow(p);
        this.m.toArray(p.matrices, p.n++ * 16);
      }
    }
  }

  /** A full batch: a bigger mesh of the same geometry and material (same shaders, nothing to build). */
  private grow(p: Part): void {
    const old = p.mesh;
    const cap = batchCap(p.cap + 1);
    const { geometry, matrices, buffer } = instancedGeometry(p.geo, cap);
    matrices.set(p.matrices);
    old.geometry.dispose();
    old.geometry = geometry;
    Object.assign(p, { matrices, buffer, cap });
  }

  private finish(p: Part): void {
    p.mesh.geometry.instanceCount = p.n;
    p.buffer.needsUpdate = true;
  }

  /** Put the plants into the scene once their shaders are built. */
  async show(): Promise<void> {
    // Every batch is built now, also those of kinds not around yet (one instance each while it builds).
    const parts = [...this.full.flat(), ...this.hull.filter((p): p is Part => !!p)];
    const counts = parts.map((p) => p.mesh.geometry.instanceCount);
    for (const p of parts) p.mesh.geometry.instanceCount = Math.max(1, p.mesh.geometry.instanceCount);
    await this.stage.prepare(this.group);
    parts.forEach((p, k) => { p.mesh.geometry.instanceCount = counts[k]; });
    await this.stage.add(this.group);
  }
}
