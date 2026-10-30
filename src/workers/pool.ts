/**
 * The worker pool: the one place workers are created (guarded). Jobs go to the least busy worker; results
 * come back as promises. Each worker script handles `{ id, job }` and answers `{ id, result }` or `{ id, error }`.
 */
import { joinPieces, maskPieces } from '../world/water';
import { adoptTiles, type Hydrology, type TracedTile } from '../world/hydro';

/** A wide water mask is made in this many pieces a side, spread over the terrain workers. */
const WATER_PIECES = 4;

export class WorkerPool<Job, Result> {
  /** Told of every answer as it reaches the main thread (the hitch log): the pool's name and the job's kind. */
  static heard: ((what: string) => void) | null = null;
  private readonly workers: Worker[] = [];
  private readonly busy: number[] = [];
  private readonly waiting = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void; worker: number; kind: string; sent: number; size?: number }>();
  private nextId = 1;

  constructor(make: () => Worker, private readonly name = 'worker', size = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))) {
    for (let w = 0; w < size; w++) {
      const worker = make();
      worker.onmessage = (e: MessageEvent<{ id: number; result?: Result; error?: string; ms?: number; stats?: Record<string, number> }>) => {
        const p = this.waiting.get(e.data.id);
        if (!p) return;
        this.waiting.delete(e.data.id);
        this.busy[p.worker]--;
        WorkerPool.heard?.(`${this.name}:${p.kind}`);
        jobLog()?.push({ pool: this.name, kind: p.kind, worker: p.worker, sent: p.sent, done: performance.now(), ms: e.data.ms ?? 0, stats: e.data.stats, size: p.size });
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
      this.waiting.set(id, { resolve, reject, worker: w, kind: kindOf(job), sent: performance.now(), size: (job as { size?: number }).size });
      this.workers[w].postMessage({ id, job }, transfer);
    });
  }

  /** The same job to every worker (each answers once); jobs sent after it see what it did. */
  broadcast(job: Job): Promise<Result[]> {
    return Promise.all(this.workers.map((worker, w) => {
      const id = this.nextId++;
      this.busy[w]++;
      return new Promise<Result>((resolve, reject) => {
        this.waiting.set(id, { resolve, reject, worker: w, kind: kindOf(job), sent: performance.now() });
        worker.postMessage({ id, job });
      });
    }));
  }

    dispose(): void {
    for (const w of this.workers) w.terminate();
    for (const p of this.waiting.values()) p.reject(new Error('worker pool disposed'));
    this.waiting.clear();
  }
}

/** Every answered job, when a load probe asks for them (`window.__mwJobLog = []`, tools/shot/load.mjs LOAD_JOBS). */
type JobRecord = { pool: string; kind: string; worker: number; sent: number; done: number; ms: number; stats?: Record<string, number>; size?: number };
const jobLog = (): JobRecord[] | undefined => (globalThis as { __mwJobLog?: JobRecord[] }).__mwJobLog;

/** A job's kind for the hitch log (`{ kind: 'chunk' }` → chunk). */
function kindOf(job: unknown): string {
  const k = (job as { kind?: unknown } | null)?.kind;
  return typeof k === 'string' ? k : 'job';
}

export type TerrainPool = WorkerPool<import('./terrain.worker').TerrainJob, import('./terrain.worker').TerrainResult>;

/** Terrain chunks are built off the main thread. */
export function createTerrainPool(size?: number): TerrainPool {
  return new WorkerPool(() => new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' }), 'terrain', size);
}

export type TexturePool = WorkerPool<import('./texture.worker').TextureJob, import('@futuremagic/texgen').TexLayer>;

/** Ground texture layers are generated off the main thread at load. */
export function createTexturePool(size?: number): TexturePool {
  return new WorkerPool(() => new Worker(new URL('./texture.worker.ts', import.meta.url), { type: 'module' }), 'texture', size);
}

export type WorldPool = WorkerPool<import('./world.worker').WorldJob, import('./world.worker').WorldResult>;

/** Water masks and plant positions around the camera (one worker: a job now and then). */
export function createWorldPool(): WorldPool {
  return new WorkerPool(() => new Worker(new URL('./world.worker.ts', import.meta.url), { type: 'module' }), 'world', 1);
}
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

/** The terrain workers' jobs for one world: height field chunks and the rock volumes. */
export class TerrainJobs {
  constructor(private readonly pool: TerrainPool, readonly seed: number, readonly setting: string) {}

  private job<T>(job: DistributiveOmit<import('./terrain.worker').TerrainJob, 'seed' | 'setting'>): Promise<T> {
    return this.pool.run({ ...job, seed: this.seed, setting: this.setting } as import('./terrain.worker').TerrainJob) as Promise<T>;
  }
  /**
   * Every river and brook tile over a rectangle, traced once (each in one worker, side by side) and handed to every
   * worker and this thread. Built from the land without them, each worker traced the tiles its chunks touched on its
   * own: the far chunks touch them all, and the four workers spent 7-10 s each tracing the same tiles at the start.
   */
  async shareTiles(hydro: Hydrology, x0: number, z0: number, x1: number, z1: number): Promise<void> {
    const trace = async (brook: boolean, tiles: [number, number][]) => {
      const seen = new Set<string>();
      const unique = tiles.filter(([tx, tz]) => !seen.has(`${tx},${tz}`) && !!seen.add(`${tx},${tz}`));
      const traced = await Promise.all(unique.map(([tx, tz]) => this.job<TracedTile>({ kind: 'trace', brook, tx, tz })));
      // Every worker takes them before any job sent after (each answers its jobs in order).
      void this.pool.broadcast({ kind: 'tiles', tiles: traced, seed: this.seed, setting: this.setting }).catch(() => {});
      adoptTiles(traced);
    };
    // The rivers first: a brook tile is traced over the land its river tile shaped.
    await trace(false, [...hydro.tilesOver(x0, z0, x1, z1, false), ...hydro.feedsOver(x0, z0, x1, z1)]);
    await trace(true, hydro.tilesOver(x0, z0, x1, z1, true));
  }

  /** A water mask over a square (`res` samples a side): the terrain workers share the masks the world worker made alone. */
  water(x0: number, z0: number, size: number, res: number): Promise<Float32Array> {
    // In pieces, side by side in the workers (one worker made a wide mask alone, for seconds, while the start waited).
    const pieces = maskPieces(x0, z0, size, res, res >= 256 ? WATER_PIECES : 1);
    if (pieces.length === 1) return this.job<Float32Array>({ kind: 'water', x0, z0, size, res });
    return Promise.all(pieces.map((p) => this.job<Float32Array>({ kind: 'water', x0: p.x0, z0: p.z0, size, res, cols: p.cols, rows: p.rows })))
      .then((made) => joinPieces(res, pieces, made));
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

  /** Decisions made while playing that change the land (roads), for every terrain worker. */
  decisions(ds: readonly import('../world/decisions').Decision[]): Promise<unknown> {
    return this.pool.broadcast({ kind: 'decisions', decisions: ds, seed: this.seed, setting: this.setting });
  }

  /** A cave's rock (its field and mesh) for its layout: a few hundred milliseconds of work. */
  caveRock(layout: import('../world/dungeon/cellar').ScaledLayout, cave: number, keep: readonly (readonly [number, number])[], throat: import('../world/dungeon/caveRock').CaveThroat | null = null): Promise<import('./terrain.worker').CaveRock> {
    return this.job({ kind: 'caveRock', layout, cave, keep, throat });
  }

  /** A cave's mouth on the land at its site. */
  caveMouth(site: import('../world/dungeon/site').Site, cave: number): Promise<import('../world/dungeon/caveMouth').CaveMouth> {
    return this.job({ kind: 'caveMouth', site, cave });
  }

  /** A people's hold's crag and carved wardens at its site (world/holdRock.ts): most of a second of work. */
  holdRock(site: import('../world/dungeon/site').Site & { readonly level: number }, rock: number): Promise<import('../world/holdRock').HoldRock> {
    return this.job({ kind: 'holdRock', site, rock });
  }

  /** A region's place or a sight laid out on the land (world/sites.ts). */
  site(site: import('../world/sites').SiteJob): Promise<import('../world/sites').SiteLayout | null> {
    return this.job({ kind: 'site', site });
  }

  /** A building planned inside and drawn open (world/townMesh.ts openHouse). */
  house(b: import('@futuremagic/settlement').TownBuilding, hatch: boolean, hall: boolean, sign?: [number, number, number]): Promise<import('../world/townMesh').OpenHouse> {
    return this.job({ kind: 'house', b, hatch, hall, sign });
  }

  /** The ground masks of the town of this id (world/townMask.ts), `w` × `h` texels each from cell (i0, j0) of its raster. */
  townMask(id: string, w: number, h: number, i0 = 0, j0 = 0): Promise<Uint8Array> {
    return this.job({ kind: 'townMask', id, w, h, i0, j0 });
  }

  /** The buildings of the town of this id, merged per cell, and its plan if `plan` (the worker plans a settlement founded while playing). */
  townMeshes(id: string, plan = false): Promise<import('./terrain.worker').TownMeshes> {
    return this.job({ kind: 'town', id, plan });
  }
}

/** The world worker's jobs for one world (seed and setting): masks and plant positions around the camera. */
export class WorldJobs {
  constructor(private readonly pool: WorldPool, readonly seed: number, readonly setting: string) {}

  private job<T>(job: DistributiveOmit<import('./world.worker').WorldJob, 'seed' | 'setting'>): Promise<T> {
    return this.pool.run({ ...job, seed: this.seed, setting: this.setting } as import('./world.worker').WorldJob) as Promise<T>;
  }

  /** A water (`mask`) or grass mask over a square: `res` samples a side. */
  mask(kind: 'mask' | 'grass', x0: number, z0: number, size: number, res: number): Promise<Float32Array> {
    return this.pool.run({ kind, seed: this.seed, setting: this.setting, x0, z0, size, res }) as Promise<Float32Array>;
  }

  /** Decisions made while playing that change the land (roads), for the world worker. */
  decisions(ds: readonly import('../world/decisions').Decision[]): Promise<unknown> {
    return this.pool.broadcast({ kind: 'decisions', decisions: ds, seed: this.seed, setting: this.setting });
  }

  /** The roads' mask over a square (world/roads.ts roadMask): `res` samples a side. */
  roadMask(x0: number, z0: number, size: number, res: number): Promise<Float32Array> {
    return this.pool.run({ kind: 'roads', seed: this.seed, setting: this.setting, x0, z0, size, res }) as Promise<Float32Array>;
  }

  /** A brook tile's brooks and sediment floors, traced in the world worker (world/hydro.ts packTile). */
  brooks(tx: number, tz: number): Promise<Float64Array> {
    return this.pool.run({ kind: 'brooks', seed: this.seed, setting: this.setting, tx, tz }) as Promise<Float64Array>;
  }

  /** Trees and shrubs over a square, candidates `spacing` apart. */
  flora(x0: number, z0: number, size: number, spacing: number): Promise<Float32Array> {
    return this.pool.run({ kind: 'flora', seed: this.seed, setting: this.setting, x0, z0, size, spacing }) as Promise<Float32Array>;
  }

  /** The rocks of the landforms whose middle lies in a square (world/rocks.ts rockPlacement). */
  rocks(x0: number, z0: number, size: number): Promise<Float32Array> {
    return this.job({ kind: 'rocks', x0, z0, size });
  }

  /**
   * A road from `place` to the network (vgm/roads.ts linkRoad), routed in the world worker: it takes a few
   * hundred milliseconds. `roads`: the roads already decided (the worker's land has them laid).
   */
  linkRoad(roads: readonly import('../world/decisions').RoadDecision[], place: import('../vgm/roads').Place, way: import('../world/decisions').RoadWay, at?: number): Promise<import('../world/decisions').RoadDecision | null> {
    return this.job({ kind: 'link', roads, place, way, at });
  }

  /** The next region the frontier opens (vgm/frontier.ts nextRegion), looked for in the world worker. */
  frontier(ask: import('../vgm/frontier').FrontierAsk): Promise<import('../world/decisions').RegionDecision | null> {
    return this.job({ kind: 'frontier', ask });
  }
}

/** Resolves once `test()` holds (checked every 20 ms): for loading steps that wait on worker results. */
export async function until(test: () => boolean): Promise<void> {
  while (!test()) await new Promise((r) => setTimeout(r, 20));
}
