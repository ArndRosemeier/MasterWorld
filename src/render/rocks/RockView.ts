/**
 * Rocks on the land around the camera (world/rocks.ts; @futuremagic/rocks models), drawn instanced with
 * the cliffs' stone (materials.ts ROCKS). Placements come from the world worker in landform cells; each rock
 * is its full model up close and fewer triangles further out (@futuremagic/instances levels; culled to the
 * view on WebGPU).
 */
import { BufferAttribute, BufferGeometry, Matrix4, Quaternion, Vector3, type Camera, type DirectionalLight } from 'three/webgpu';
import { createInstanceDraws, DITHER, KIND, RECORD, type DrawKind, type InstanceDraws } from '@futuremagic/instances';
import { rockModel } from '@futuremagic/rocks';
import { hash2f } from '@futuremagic/core';
import type { Stage } from '@futuremagic/stage';
import { ORIGIN } from '../origin';
import { ROCKS } from '../materials';
import { FORM_CELL } from '../../world/landforms';
import { ROCK_STRIDE, rockKinds } from '../../world/rocks';
import { until, type WorldJobs } from '../../workers/pool';
import { CameraCells } from '../cameraCells';

/** Cells either way of the camera's (FORM_CELL each): rocks to about 900 m. */
const REACH = 3;
/** Levels: (detail, from, to) in metres from the eye. */
const LEVELS: readonly [number, number, number][] = [[2, 0, 70], [1, 70, 320], [0, 320, 950]];
/** How far a rock's shadow reaches (m). */
const SHADOW_REACH = 40;

export class RockView {
  private readonly cells: CameraCells;
  readonly draws: InstanceDraws;
  private dirty = true;
  private records = new Float32Array(0);
  private readonly sunDir = new Vector3(0, -1, 0);
  private readonly m = new Matrix4();
  private readonly q = new Quaternion();
  private readonly v = new Vector3();
  private readonly s = new Vector3();
  private readonly up = new Vector3(0, 1, 0);

  constructor(private readonly stage: Stage, jobs: WorldJobs, private readonly sun?: DirectionalLight) {
    this.cells = new CameraCells(FORM_CELL, REACH, (x0, z0, side) => jobs.rocks(x0, z0, side), { placed: () => { this.dirty = true; } });
    const material = ROCKS.make();
    const kinds: DrawKind[] = rockKinds().map((k) => ({
      lods: LEVELS.map(([detail, near, far], i) => ({
        ...(i > 0 ? { near } : {}), far, ...(i === LEVELS.length - 1 ? { fade: [far - 120, far] as [number, number] } : {}),
        parts: [{ geometry: geometryOf(rockModel(k.shape, k.seed, detail)), material, castShadow: i < 2, receiveShadow: true }],
      })),
    }));
    this.draws = createInstanceDraws(stage.renderer, kinds, { horizontal: true, shadow: { dir: this.sunDir, reach: SHADOW_REACH }, capacity: 8192, origin: ORIGIN.at });
    this.draws.group.name = 'rocks';
    ORIGIN.pin(this.draws.group);
  }

  /**
   * Placements for the start, before the first frame: only the cells next to the camera's (to some 400 m), so
   * the world workers are free for the land; the rest are asked for by the first frames.
   */
  async placeStart(cam: Vector3): Promise<void> {
    this.cells.askAround(cam.x, cam.z, 1);
    await until(() => this.cells.allHere);
    this.setRecords();
  }

  /** Put the rocks into the scene once their shader is built. */
  async raise(): Promise<void> {
    await this.draws.prepare((g) => this.stage.prepare(g));
    await this.stage.add(this.draws.group);
  }

  /** Each frame: cells follow the camera, the draws pick levels (and on WebGPU cull to the view and the sun's shadows). */
  tend(camera: Camera): void {
    // The sun's way, for the shadows of rocks just out of view.
    if (this.sun) this.sunDir.copy(this.sun.target.position).sub(this.sun.position).normalize();
    this.cells.askAround(camera.position.x, camera.position.z);
    if (this.dirty) this.setRecords();
    this.draws.update(camera);
  }

  /** The rocks near where `touches` names are placed anew (a road was laid; a cell's rocks lie up to a landform's length past it). */
  refresh(touches: (x0: number, z0: number, x1: number, z1: number) => boolean): void {
    this.cells.placeAnew(touches, 1);
  }

  private setRecords(): void {
    this.dirty = false;
    let n = 0;
    for (const c of this.cells.cells.values()) {
      const d = c.data;
      if (!d) continue;
      const count = d.length / ROCK_STRIDE;
      if (this.records.length < (n + count) * RECORD) {
        const grown = new Float32Array(Math.ceil((n + count) * 1.5 + 64) * RECORD);
        grown.set(this.records.subarray(0, n * RECORD));
        this.records = grown;
      }
      for (let r = 0; r < d.length; r += ROCK_STRIDE) {
        const x = d[r], y = d[r + 1], z = d[r + 2];
        this.m.compose(this.v.set(x, y, z), this.q.setFromAxisAngle(this.up, d[r + 4]), this.s.setScalar(d[r + 3]));
        const o = n++ * RECORD;
        this.m.toArray(this.records, o);
        this.records[o + KIND] = d[r + 5];
        this.records[o + DITHER] = hash2f(11, Math.round(x * 8), Math.round(z * 8));
      }
    }
    this.draws.set(this.records, n);
  }
}

/** A rock model as a geometry (position, normal, colour). */
function geometryOf(m: ReturnType<typeof rockModel>): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new BufferAttribute(m.normals, 3));
  g.setAttribute('color', new BufferAttribute(m.colors, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}
