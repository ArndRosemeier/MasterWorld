/**
 * The town's buildings (world/townMesh.ts, meshed in the terrain worker), one mesh per cell near and one
 * far: the far one (no frames, shutters or sills) takes over past FAR metres. Drawn with the building
 * shader (materials/building.ts).
 */
import { Group, type BufferAttribute, type Mesh, type Vector3 } from 'three/webgpu';
import type { BuildingMesh, TownPlan } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import type { TerrainJobs } from '../../workers/pool';
import type { MeshRange } from '../../world/townMesh';
import { buildingMeshAt } from '../materials/building';

/** From this far (m, camera to the cell's middle) the far meshes draw. */
const FAR = 200;
/** Switch back a little nearer, so a camera on the line does not flicker between the two. */
const HYSTERESIS = 12;
/** How much of its colour a burnt building keeps (soot over wood and thatch). */
const CHAR = 0.22;

interface Cell { x: number; z: number; near: Mesh; far: Mesh; nearRanges: MeshRange[]; farRanges: MeshRange[] }

export class TownView {
  readonly group = new Group();
  private readonly cells: Cell[] = [];
  /** Buildings taken out of their cell's meshes (shown open in their place), with their indices to put back. */
  private readonly hidden = new Map<number, { index: BufferAttribute; start: number; saved: Uint32Array }[]>();

  constructor(private readonly stage: Stage, private readonly jobs: TerrainJobs) {
    this.group.name = 'town';
  }

  /** Mesh the buildings of the town of this id and put them in; its plan, if `plan` (planned in the worker). */
  async build(id: string, cam: Vector3, plan = false): Promise<TownPlan | null> {
    const { cells, plan: planned } = await this.jobs.townMeshes(id, plan);
    for (const c of cells) {
      const near = cellMesh(c.near, c.x, c.z), far = cellMesh(c.far, c.x, c.z);
      this.group.add(near, far);
      this.cells.push({ x: c.x, z: c.z, near, far, nearRanges: c.nearRanges, farRanges: c.farRanges });
    }
    this.update(cam, true);
    await this.stage.add(this.group);
    return planned;
  }

  /** Near or far meshes, by distance. */
  update(cam: Vector3, force = false): void {
    for (const c of this.cells) {
      const d = Math.hypot(cam.x - c.x, cam.z - c.z);
      const far = force || !c.far.visible ? d > FAR : d > FAR - HYSTERESIS;
      c.near.visible = !far;
      c.far.visible = far;
    }
  }

  /**
   * Takes building `id` out of the town's meshes (its triangles folded to nothing, near and far, shadows
   * too), or puts it back: the open building is drawn in its place meanwhile. No new draw, no new shader.
   */
  hide(id: number, on: boolean): void {
    if (on === this.hidden.has(id)) return;
    if (!on) {
      for (const h of this.hidden.get(id)!) { (h.index.array as Uint32Array).set(h.saved, h.start); reupload(h.index, h.start, h.saved.length); }
      this.hidden.delete(id);
      return;
    }
    const out: { index: BufferAttribute; start: number; saved: Uint32Array }[] = [];
    for (const c of this.cells) {
      for (const [mesh, ranges] of [[c.near, c.nearRanges], [c.far, c.farRanges]] as const) {
        const r = ranges.find((x) => x[0] === id);
        if (!r) continue;
        const index = mesh.geometry.index!, arr = index.array as Uint32Array, [, start, count] = r;
        out.push({ index, start, saved: arr.slice(start, start + count) });
        arr.fill(arr[start], start, start + count);
        reupload(index, start, count);
      }
    }
    this.hidden.set(id, out);
  }

  /** Buildings drawn scorched (a raided barn), with their vertices' tints to put back. */
  private readonly scorched = new Map<number, { tint: BufferAttribute; at: Uint32Array; saved: Float32Array }[]>();

  /**
   * Draws building `id` burnt (its colours darkened to char, near and far: a raided farm's barn, C10), or as it
   * was. Only its vertices' tints change: no new draw, no new shader. False while the town is not meshed yet.
   */
  scorch(id: number, on: boolean): boolean {
    if (on === this.scorched.has(id)) return true;
    if (!this.cells.length) return false;
    if (!on) {
      for (const s of this.scorched.get(id)!) { s.at.forEach((v, k) => (s.tint.array as Float32Array).set(s.saved.subarray(k * 3, k * 3 + 3), v * 3)); s.tint.needsUpdate = true; }
      this.scorched.delete(id);
      return true;
    }
    const out: { tint: BufferAttribute; at: Uint32Array; saved: Float32Array }[] = [];
    for (const c of this.cells) {
      for (const [mesh, ranges] of [[c.near, c.nearRanges], [c.far, c.farRanges]] as const) {
        const r = ranges.find((x) => x[0] === id);
        if (!r) continue;
        const index = mesh.geometry.index!.array as Uint32Array, tint = mesh.geometry.getAttribute('tint') as BufferAttribute, arr = tint.array as Float32Array;
        const at = Uint32Array.from(new Set(index.subarray(r[1], r[1] + r[2])));
        const saved = new Float32Array(at.length * 3);
        at.forEach((v, k) => { saved.set(arr.subarray(v * 3, v * 3 + 3), k * 3); for (let j = 0; j < 3; j++) arr[v * 3 + j] *= CHAR; });
        tint.needsUpdate = true;
        out.push({ tint, at, saved });
      }
    }
    this.scorched.set(id, out);
    return true;
  }

  /** Triangles in the meshes drawn now (for the HUD). */
  get triangles(): number {
    let n = 0;
    for (const c of this.cells) n += ((c.near.visible ? c.near : c.far).geometry.index?.count ?? 0) / 3;
    return n;
  }
}

/** Uploads part of an index buffer again. */
function reupload(index: BufferAttribute, start: number, count: number): void {
  index.addUpdateRange(start, count);
  index.needsUpdate = true;
}

/** A cell's mesh: the attributes the building shader reads, at (x, 0, z). */
function cellMesh(m: BuildingMesh, x: number, z: number): Mesh {
  return buildingMeshAt(m, x, 0, z, 'buildings');
}
