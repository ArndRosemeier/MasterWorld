/**
 * Trees and shrubs around the camera (@futuremagic/vegetation models, drawn instanced). Placements come
 * from the world worker (world/flora.ts) in square cells: near cells hold every plant, far cells a thinned
 * set of bigger stand-ins. Up close a tree is its full model (wood and leaf cards); further out its far
 * canopy hull; past the near cells only the far cells' hulls remain. The levels, and on WebGPU the culling to the
 * view (and to shadows falling into it), are @futuremagic/instances'.
 */
import { Matrix4, Quaternion, Vector3, type BufferGeometry, type Camera, type DirectionalLight, type Material } from 'three/webgpu';
import { shrubModel, treeModel, vegetationUniforms, type TreeSpecies } from '@futuremagic/vegetation';
import { createBarkMaterial, createFarTreeMaterial, createLeafMaterial, createLeafPasses } from '@futuremagic/vegetation/node';
import { ORIGIN } from '../origin';
import { createInstanceDraws, DITHER, KIND, RECORD, type DrawKind, type DrawPart, type InstanceDraws } from '@futuremagic/instances';
import type { Stage } from '@futuremagic/stage';
import { hash2f } from '@futuremagic/core';
import { FLORA_KINDS, FLORA_STRIDE, NEAR_SPACING } from '../../world/flora';
import { until, type WorldJobs } from '../../workers/pool';
import { WOODS } from '../materials';

/** Near cells: side (m) and how many around the camera's cell either way. */
const NEAR_CELL = 64, NEAR_REACH = 6;
/** Far cells: side (m) and reach; their candidate spacing. */
const FAR_CELL = 512, FAR_REACH = 2, FAR_SPACING = 16;
/** Full models within this distance (m), hulls beyond. Shrubs end here too. */
const FULL = 60;
/** Hulls end here (m); the ground's canopy (materials.ts WOODS) rises over the last HULL_THIN m before. Within what the far cells always cover. */
const HULL_END = FAR_REACH * FAR_CELL - 24;
/** Over this last stretch (m) the hulls thin out at random as the canopy rises, so the woods have no edge where they hand over. */
const HULL_THIN = 300;
/** How far a tree's shadow reaches (m): trees just out of view whose shadows fall into it stay drawn. */
const SHADOW_REACH = 80;

/** `again`: the land changed while it was being placed (a road): it is asked for once more. */
interface Cell { pending: boolean; data: Float32Array | null; again?: boolean }

export class FloraView {
  private readonly near = new Map<string, Cell>();
  private readonly far = new Map<string, Cell>();
  /** Every plant as an instance; levels (full model, hull) and, on WebGPU, view culling done there. */
  readonly draws: InstanceDraws;
  private readonly hasHull: boolean[];
  private center = { i: NaN, j: NaN };
  private dirty = true;
  private records = new Float32Array(0);
  private readonly sunDir = new Vector3(0, -1, 0);
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  /** `leafDepth`: leaves with a depth pre-pass (each leaf pixel lit once); `shadows`: trees cast shadows. */
  constructor(private readonly stage: Stage, private readonly jobs: WorldJobs, private readonly sun?: DirectionalLight, opts: { leafDepth?: boolean; shadows?: boolean } = {}) {
    WOODS.band.value.set(HULL_END - HULL_THIN, HULL_END);
    const U = vegetationUniforms;
    // Drawn relative to the floating origin (wind and tints read the world position through it).
    U.uOrigin.value = ORIGIN.at;
    const shadows = opts.shadows ?? true, leafDepth = opts.leafDepth ?? true;
    const bark = createBarkMaterial(U), hull = createFarTreeMaterial(U);
    const reversed = !!(stage.renderer as unknown as { backend?: { parameters?: { reversedDepthBuffer?: boolean } } }).backend?.parameters?.reversedDepthBuffer;
    const leafPass = (conifer: boolean) => (leafDepth ? createLeafPasses(U, conifer, reversed) : { depth: null, color: createLeafMaterial(U, conifer) });
    const leaf = leafPass(false), needles = leafPass(true);
    // The hulls' baked colours read lighter than the leaf cards they stand in for.
    hull.color.setScalar(0.75);
    const part = (geometry: BufferGeometry, material: Material, renderOrder = 0, castShadow = shadows): DrawPart => ({ geometry, material, castShadow, receiveShadow: true, renderOrder });
    const leaves = (geometry: BufferGeometry, p: typeof leaf): DrawPart[] =>
      p.depth ? [part(geometry, p.depth, -1, false), part(geometry, p.color, 1)] : [part(geometry, p.color)];
    const kinds: DrawKind[] = FLORA_KINDS.map((k) => {
      const m = k.species === 'shrub' ? shrubModel(k.variant) : treeModel(k.species as TreeSpecies, k.variant);
      const lods: DrawKind['lods'] = [{ far: FULL, parts: [part(m.wood, bark), ...leaves(m.leaves, k.conifer ? needles : leaf)] }];
      if (!m.isShrub) lods.push({ near: FULL, far: HULL_END, fade: [HULL_END - HULL_THIN, HULL_END], parts: [part(m.far, hull)] });
      return { lods };
    });
    this.hasHull = kinds.map((k) => k.lods.length > 1);
    this.draws = createInstanceDraws(stage.renderer, kinds, { horizontal: true, shadow: { dir: this.sunDir, reach: SHADOW_REACH }, capacity: 16384, origin: ORIGIN.at });
    this.draws.group.name = 'flora';
    ORIGIN.pin(this.draws.group);
  }

  get group() { return this.draws.group; }

  /** Placements for the start, before the first frame. */
  async placeStart(cam: Vector3): Promise<void> {
    this.follow(cam);
    await until(() => [...this.near.values(), ...this.far.values()].every((c) => c.data));
    this.rebuild();
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
      this.placeCell(cell, i, j, side, spacing);
    }
    // Forget cells well out of reach (kept a little while, so walking back and forth costs nothing).
    for (const [key, c] of cells) {
      const [i, j] = key.split(',').map(Number);
      if (!c.pending && Math.max(Math.abs(i - ci), Math.abs(j - cj)) > reach + 2) cells.delete(key);
    }
  }

  /** Asks the worker for a cell's plants (again, if the land changes meanwhile); the old ones stay until then. */
  private placeCell(cell: Cell, i: number, j: number, side: number, spacing: number): void {
    cell.pending = true;
    void this.jobs.flora(i * side, j * side, side, spacing).then((d) => {
      if (cell.again) { cell.again = false; this.placeCell(cell, i, j, side, spacing); return; }
      cell.data = d;
      cell.pending = false;
      this.dirty = true;
    });
  }

  /** The plants of every cell `touches` names are placed anew (a road was laid through them). */
  refresh(touches: (x0: number, z0: number, x1: number, z1: number) => boolean): void {
    for (const [cells, side, spacing] of [[this.near, NEAR_CELL, NEAR_SPACING], [this.far, FAR_CELL, FAR_SPACING]] as const) {
      for (const [key, c] of cells) {
        const [i, j] = key.split(',').map(Number);
        if (!touches(i * side, j * side, (i + 1) * side, (j + 1) * side)) continue;
        if (c.pending) c.again = true;
        else this.placeCell(c, i, j, side, spacing);
      }
    }
  }

  update(dt: number, camera: Camera): void {
    vegetationUniforms.uTime.value += dt;
    this.follow(camera.position);
    if (this.dirty) this.rebuild();
    if (this.sun) this.sunDir.subVectors(this.sun.target.position, this.sun.position).normalize();
    this.draws.update(camera);
  }

  /** Every plant anew, around the camera's current cell (the draws pick each one's level). */
  private rebuild(): void {
    this.dirty = false;
    let n = 0;
    const cx = (this.center.i + 0.5) * NEAR_CELL, cz = (this.center.j + 0.5) * NEAR_CELL;
    const nearHalf = (NEAR_REACH + 0.5) * NEAR_CELL;
    const add = (d: Float32Array, keep: (x: number, z: number, kind: number) => boolean) => {
      if (this.records.length < (n + d.length / FLORA_STRIDE) * RECORD) {
        const grown = new Float32Array(Math.ceil((n + d.length / FLORA_STRIDE) * 1.5) * RECORD);
        grown.set(this.records.subarray(0, n * RECORD));
        this.records = grown;
      }
      for (let r = 0; r < d.length; r += FLORA_STRIDE) {
        const x = d[r], y = d[r + 1], z = d[r + 2], scale = d[r + 3], yaw = d[r + 4], kind = d[r + 5];
        if (!keep(x, z, kind)) continue;
        this.m.compose(this.v.set(x, y, z), this.q.setFromAxisAngle(this.up, yaw), this.s.setScalar(scale));
        const o = n++ * RECORD;
        this.m.toArray(this.records, o);
        this.records[o + KIND] = kind;
        this.records[o + DITHER] = hash2f(7, Math.round(x * 8), Math.round(z * 8));
      }
    };
    for (const [key, c] of this.near) {
      if (!c.data) continue;
      const [i, j] = key.split(',').map(Number);
      if (Math.max(Math.abs(i - this.center.i), Math.abs(j - this.center.j)) > NEAR_REACH) continue;
      add(c.data, () => true);
    }
    // The near cells cover their square; far stand-ins (trees, drawn as hulls) only outside it.
    for (const c of this.far.values()) {
      if (c.data) add(c.data, (x, z, kind) => this.hasHull[kind] && Math.max(Math.abs(x - cx), Math.abs(z - cz)) >= nearHalf);
    }
    this.draws.set(this.records, n);
  }

  /** Put the plants into the scene once their shaders are built (every part, also of kinds not around yet). */
  async plant(): Promise<void> {
    await this.draws.prepare((g) => this.stage.prepare(g));
    await this.stage.add(this.group);
  }
}
