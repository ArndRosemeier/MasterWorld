/**
 * The town's buildings (world/townMesh.ts, meshed in the terrain worker), one mesh per cell near and one
 * far: the far one (no frames, shutters or sills) takes over past FAR metres. Drawn with the building
 * shader (materials/building.ts).
 */
import { hash3f } from '@futuremagic/core';
import { Group, type BufferAttribute, type Mesh, type Vector3 } from 'three/webgpu';
import type { BuildingMesh, TownPlan } from '@futuremagic/settlement';
import type { Stage } from '@futuremagic/stage';
import type { TerrainJobs } from '../../workers/pool';
import type { MeshRange } from '../../world/townMesh';
import { buildingMeshAt } from '../materials/building';
import { freeMesh } from '../materials';

/** From this far (m, camera to the cell's middle) the far meshes draw. */
const FAR = 200;
/** Switch back a little nearer, so a camera on the line does not flicker between the two. */
const HYSTERESIS = 12;
/** A burnt building's colours: soot grey (this much of its own hue left), darkest up under the roof, in patches. */
const CHAR = { hue: 0.25, foot: 0.11, top: 0.02, patch: 0.8 };

/** A tint (0..1 sRGB) charred: `h` how high up the building (0 its foot, 1 its top), `n` a patch value 0..1. */
export function charred(r: number, g: number, b: number, h: number, n: number): [number, number, number] {
  const grey = 0.3 * r + 0.59 * g + 0.11 * b;
  const f = (CHAR.foot + (CHAR.top - CHAR.foot) * Math.min(1, Math.max(0, h))) * (1 - CHAR.patch / 2 + CHAR.patch * n);
  return [r, g, b].map((c) => (grey + (c - grey) * CHAR.hue) * f) as [number, number, number];
}

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

  /** Out of the scene, its meshes' buffers freed (the town is far behind; drawn anew when it comes near). */
  unbuild(): void {
    this.stage.remove(this.group);
    for (const c of this.cells) { freeMesh(c.near); freeMesh(c.far); }
    this.cells.length = 0;
    this.group.clear();
    this.hidden.clear();
    this.scorched.clear();
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
        const pos = mesh.geometry.getAttribute('position');
        let lo = Infinity, hi = -Infinity;
        for (const v of at) { const y = pos.getY(v); lo = Math.min(lo, y); hi = Math.max(hi, y); }
        at.forEach((v, k) => {
          saved.set(arr.subarray(v * 3, v * 3 + 3), k * 3);
          // Soot patches: a hash of where the vertex stands (the same on every vertex there, half a metre apart).
          const n = hash3f(id, Math.round(pos.getX(v) * 2), Math.round(pos.getY(v) * 2), Math.round(pos.getZ(v) * 2));
          arr.set(charred(arr[v * 3], arr[v * 3 + 1], arr[v * 3 + 2], (pos.getY(v) - lo) / Math.max(1e-3, hi - lo), n), v * 3);
        });
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
