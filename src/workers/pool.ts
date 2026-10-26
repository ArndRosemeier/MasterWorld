/**
 * The worker pool: the one place workers are created (guarded). Jobs go to the least busy worker; results
 * come back as promises. Each worker script handles `{ id, job }` and answers `{ id, result }` or `{ id, error }`.
 */
import { FLORA_STRIDE } from '../world/flora';

export class WorkerPool<Job, Result> {
  private readonly workers: Worker[] = [];
  private readonly busy: number[] = [];
  private readonly waiting = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void; worker: number }>();
  private nextId = 1;

  constructor(make: () => Worker, size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let w = 0; w < size; w++) {
      const worker = make();
      worker.onmessage = (e: MessageEvent<{ id: number; result?: Result; error?: string }>) => {
        const p = this.waiting.get(e.data.id);
        if (!p) return;
        this.waiting.delete(e.data.id);
        this.busy[p.worker]--;
        if (e.data.error !== undefined) p.reject(new Error(e.data.error));
        else p.resolve(e.data.result as Result);
      };
      this.workers.push(worker);
      this.busy.push(0);
    }
  }

  get inFlight(): number { return this.waiting.size; }

  run(job: Job, transfer: Transferable[] = []): Promise<Result> {
    let w = 0;
    for (let i = 1; i < this.busy.length; i++) if (this.busy[i] < this.busy[w]) w = i;
    const id = this.nextId++;
    this.busy[w]++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject, worker: w });
      this.workers[w].postMessage({ id, job }, transfer);
    });
  }

  dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.waiting.values()) p.reject(new Error('worker pool disposed'));
    this.waiting.clear();
  }
}

export type TerrainPool = WorkerPool<import('./terrain.worker').TerrainJob, import('./terrain.worker').TerrainResult>;

/** Terrain chunks are built off the main thread. */
export function createTerrainPool(size?: number): TerrainPool {
  return new WorkerPool(() => new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }), size);
}

export type TexturePool = WorkerPool<import('./texture.worker').TextureJob, import('@futuremagic/texgen').TexLayer>;

/** Ground texture layers are generated off the main thread at load. */
export function createTexturePool(size?: number): TexturePool {
  return new WorkerPool(() => new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' }), size);
}

export type WorldPool = WorkerPool<import('./world.worker').WorldJob, Float32Array>;

/** Water masks and plant positions around the camera (one worker: a job now and then). */
export function createWorldPool(): WorldPool {
  return new WorkerPool(() => new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' }), 1);
}
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** The terrain workers' jobs for one world: height field chunks and the rock volumes. */
export class TerrainJobs {
  constructor(private readonly pool: TerrainPool, readonly seed: number, readonly setting: string) {}

  private job<T>(job: DistributiveOmit<import('./terrain.worker').TerrainJob, 'seed' | 'setting'>): Promise<T> {
    return this.pool.run({ ...job, seed: this.seed, setting: this.setting } as import('./terrain.worker').TerrainJob) as Promise<T>;
  }

  chunk(x0: number, z0: number, size: number, segs: number): Promise<import('../world/chunkMesh').ChunkMesh> {
    return this.job({ kind: 'chunk', x0, z0, size, segs });
  }

  volumeMeshes(): Promise<import('../world/volumes').VolumeMesh[]> {
    return this.job({ kind: 'volumes' });
  }

  /** The skylines around a square (world/horizon.ts), for the hills' shadows. */
  horizon(spec: import('../world/horizon').HorizonSpec): Promise<Uint8Array> {
    return this.job({ kind: 'horizon', ...spec });
  }

  /** A cave's rock (its field and mesh) for its layout: a few hundred milliseconds of work. */
  caveRock(layout: import('@futuremagic/dungeon').DungeonLayout, cave: number): Promise<import('./terrain.worker').CaveRock> {
    return this.job({ kind: 'caveRock', layout, cave });
  }

  /** A cave's mouth on the land at its site. */
  caveMouth(site: import('../world/dungeon/site').Site, cave: number): Promise<import('../world/dungeon/caveMouth').CaveMouth> {
    return this.job({ kind: 'caveMouth', site, cave });
  }

  /** The buildings of the `index`th town, merged per cell. */
  townMeshes(index: number): Promise<import('../world/townMesh').TownCellMesh[]> {
    return this.job({ kind: 'town', index });
  }
}

/** The world worker's jobs for one world (seed and setting): masks and plant positions around the camera. */
export class WorldJobs {
  constructor(private readonly pool: WorldPool, readonly seed: number, readonly setting: string) {}

  /** A water (`mask`) or grass mask over a square: `res` samples a side. */
  mask(kind: 'mask' | 'grass', x0: number, z0: number, size: number, res: number): Promise<Float32Array> {
    return this.pool.run({ kind, seed: this.seed, setting: this.setting, x0, z0, size, res });
  }

  /** Ground no plant grows on that the worker does not know of (the places the VGM opened since the start). */
  keepOut: ((x: number, z: number) => boolean) | null = null;

  /** Trees and shrubs over a square, candidates `spacing` apart. */
  flora(x0: number, z0: number, size: number, spacing: number): Promise<Float32Array> {
    return this.pool.run({ kind: 'flora', seed: this.seed, setting: this.setting, x0, z0, size, spacing }).then((d) => (this.keepOut ? withoutPlantsIn(d, this.keepOut) : d));
  }
}

/** Plant placements (FLORA_STRIDE floats each: x, y, z first) without those standing where `out` says. */
export function withoutPlantsIn(d: Float32Array, out: (x: number, z: number) => boolean): Float32Array {
  const keep: number[] = [];
  for (let i = 0; i < d.length; i += FLORA_STRIDE) if (!out(d[i], d[i + 2])) for (let k = 0; k < FLORA_STRIDE; k++) keep.push(d[i + k]);
  return keep.length === d.length ? d : Float32Array.from(keep);
}

/** Resolves once `test()` holds (checked every 20 ms): for loading steps that wait on worker results. */
export async function until(test: () => boolean): Promise<void> {
  while (!test()) await new Promise((r) => setTimeout(r, 20));
}
