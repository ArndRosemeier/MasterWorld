/**
 * Draws the terrain: picks chunks for the camera (lod.ts), builds missing ones in the worker pool, and
 * swaps to a new set only once all of it is ready, so the ground never shows holes. Every chunk enters
 * the scene through the Stage and shares the TERRAIN kind's one shader.
 */
import { BufferAttribute, BufferGeometry, Mesh, type Camera } from 'three/webgpu';
import type { Stage } from '@futuremagic/stage';
import { CANOPY_RISE, TERRAIN } from '../materials';
import { chunkIndex, type ChunkMesh } from '../../world/chunkMesh';
import type { TerrainJobs } from '../../workers/pool';
import { SEGS, chunkId, chunkSize, selectChunks, type ChunkKey } from './lod';

/** Built chunks kept around after they leave the view, for coming back. */
const KEEP = 400;
/** Re-select once the camera moved this far (metres). */
const MOVE = 16;

export class TerrainView {
  private readonly index = new BufferAttribute(chunkIndex(SEGS), 1);
  private readonly built = new Map<string, Mesh>();
  private readonly building = new Set<string>();
  private shown = new Set<string>();
  private wanted: ChunkKey[] = [];
  private last = { x: Infinity, z: Infinity, y: Infinity };
  private swapping = false;

  constructor(private readonly stage: Stage, private readonly jobs: TerrainJobs, private readonly groundAt: (x: number, z: number) => number) {}

  /** Chunks drawn now, and chunks being built. */
  get stats(): { shown: number; building: number; built: number } {
    return { shown: this.shown.size, building: this.building.size, built: this.built.size };
  }

  /** Whether everything the current view wants is drawn. */
  get settled(): boolean {
    return !this.swapping && this.wanted.every((k) => this.shown.has(chunkId(k)));
  }

  update(camera: Camera): void {
    const p = camera.position;
    if (Math.hypot(p.x - this.last.x, p.z - this.last.z) > MOVE || Math.abs(p.y - this.last.y) > MOVE) {
      this.last = { x: p.x, z: p.z, y: p.y };
      const above = p.y - this.groundAt(p.x, p.z);
      this.wanted = selectChunks(p.x, p.z, above);
      // Nearest first.
      const d = (k: ChunkKey) => { const s = chunkSize(k.level); return Math.hypot(k.x * s + s / 2 - p.x, k.z * s + s / 2 - p.z) / s; };
      this.wanted.sort((a, b) => d(a) - d(b));
    }
    for (const k of this.wanted) {
      const id = chunkId(k);
      if (this.built.has(id) || this.building.has(id)) continue;
      this.request(k);
    }
    if (!this.swapping && this.wanted.every((k) => this.built.has(chunkId(k))) && this.wanted.some((k) => !this.shown.has(chunkId(k)))) void this.swap();
  }

  /** Build everything the view wants and show it (behind the loading screen). */
  async ready(camera: Camera): Promise<void> {
    for (;;) {
      this.update(camera);
      if (this.settled) return;
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  private request(k: ChunkKey): void {
    const id = chunkId(k), size = chunkSize(k.level);
    this.building.add(id);
    void this.jobs.chunk(k.x * size, k.z * size, size, SEGS).then((m) => {
      this.building.delete(id);
      this.built.set(id, this.mesh(k, m));
    });
  }

  private mesh(k: ChunkKey, m: ChunkMesh): Mesh {
    const size = chunkSize(k.level);
    const mesh = groundMesh(m, this.index, k.x * size, k.z * size);
    mesh.name = `terrain ${chunkId(k)}`;
    return mesh;
  }

  private async swap(): Promise<void> {
    this.swapping = true;
    const next = new Set(this.wanted.map(chunkId));
    await Promise.all([...next].filter((id) => !this.shown.has(id)).map((id) => this.stage.add(this.built.get(id)!)));
    for (const id of this.shown) if (!next.has(id)) this.stage.remove(this.built.get(id)!);
    this.shown = next;
    this.evict();
    this.swapping = false;
  }

  private evict(): void {
    if (this.built.size <= KEEP) return;
    for (const [id, m] of this.built) {
      if (this.built.size <= KEEP) break;
      if (this.shown.has(id)) continue;
      // The index is shared by every chunk: detach it first, so disposing frees only this chunk's buffers.
      m.geometry.setIndex(null);
      m.geometry.dispose();
      this.built.delete(id);
    }
  }
}

/**
 * A mesh with the terrain material (a height field chunk, or a rock volume): position, normal, ground colour
 * and surface weights, placed at (x, 0, z) and never moved.
 */
export function groundMesh(m: Pick<ChunkMesh, 'position' | 'normal' | 'color' | 'surface' | 'level'> & Partial<Pick<ChunkMesh, 'canopy'>>, index: BufferAttribute, x = 0, z = 0): Mesh {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('normal', new BufferAttribute(m.normal, 3));
  g.setAttribute('color', new BufferAttribute(m.color, 3));
  g.setAttribute('surface', new BufferAttribute(m.surface, 4));
  g.setAttribute('level', new BufferAttribute(m.level, 1));
  // No woods on meshes without a canopy (the rock volumes).
  g.setAttribute('canopy', new BufferAttribute(m.canopy ?? new Float32Array((m.position.length / 3) * 4), 4));
  g.setIndex(index);
  g.computeBoundingSphere();
  // The canopy rises over the ground far away (materials.ts): room for it in the bounds.
  g.boundingSphere!.radius += CANOPY_RISE;
  const mesh = new Mesh(g, TERRAIN.make());
  mesh.position.set(x, 0, z);
  mesh.castShadow = TERRAIN.shadow.cast;
  mesh.receiveShadow = TERRAIN.shadow.receive;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
