/**
 * The worker pool: the one place workers are created (guarded). Jobs go to the least busy worker; results
 * come back as promises. Each worker script handles `{ id, job }` and answers `{ id, result }` or `{ id, error }`.
 */
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

export type TerrainPool = WorkerPool<import('./terrain.worker').TerrainJob, import('../world/chunkMesh').ChunkMesh>;

/** Terrain chunks are built off the main thread. */
export function createTerrainPool(size?: number): TerrainPool {
  return new WorkerPool(() => new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }), size);
}

export type TexturePool = WorkerPool<import('./texture.worker').TextureJob, import('@futuremagic/texgen').TexLayer>;

/** Ground texture layers are generated off the main thread at load. */
export function createTexturePool(size?: number): TexturePool {
  return new WorkerPool(() => new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' }), size);
}

export type WaterPool = WorkerPool<import('../world/water').DepthJob, Uint8Array>;

/** Water depth masks around the camera (one worker: a mask now and then). */
export function createWaterPool(): WaterPool {
  return new WorkerPool(() => new Worker(new URL('./water.worker.ts', import.meta.url), { type: 'module' }), 1);
}
