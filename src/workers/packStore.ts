/**
 * The Actors packs as a few big files, kept in the browser (plan A7, F4). `npm run packs` writes the files a start
 * needs (tools/packs/start.json) into one bundle, `packs/start-<hash>.bin`, and lists where each file sits in it in
 * `packs/bundles.json`. A pack file asked for (by Actors' loaders, in the page or in a worker) comes:
 *
 * 1. from the browser's Cache Storage, where an earlier visit (or this one) put it;
 * 2. else, if a bundle holds it: the bundle is fetched once (one context does, under a Web Lock; the others wait for
 *    it), unpacked into the cache file by file, and the file comes from there;
 * 3. else on its own (queued and retried, packFetch.ts), and is kept in the cache for the next visit.
 *
 * Without Cache Storage (an insecure page) bundles are held in memory per context. Without `bundles.json` (the dev
 * server before `npm run packs`) every file comes on its own. The cache's name carries the bundles' hashes, so a new
 * pack selection starts afresh and the page drops older caches. Pure: no three.js, no DOM.
 */

type Fetch = typeof fetch;

/** `packs/bundles.json`: each bundle's file (under packs/) and where each pack file sits in it. */
export interface BundleIndex {
  readonly bundles: readonly { readonly file: string; readonly files: Readonly<Record<string, readonly [number, number]>> }[];
}

export interface PackStoreOptions {
  /** The site's base path (`/` or `/MasterWorld/`). */
  readonly base: string;
  /** Absolute URL the base path resolves against (the page's or the worker's location). */
  readonly origin: string;
  /** Fetches a pack file or a bundle (queued and retried). */
  readonly fetch: Fetch;
  readonly caches?: CacheStorage | null;
  readonly locks?: LockManager | null;
  /** True in the page: it drops the caches of older pack selections. */
  readonly tidy?: boolean;
}

const PREFIX = 'mw-packs-';

/** Serves pack files (paths under `<base>packs/`) from the cache, the bundles, or the network. */
export class PackStore {
  private index: Promise<Map<string, { bundle: string; at: readonly [number, number] }> | null> | null = null;
  private cache: Promise<Cache | null> | null = null;
  private readonly unpacking = new Map<string, Promise<ArrayBuffer | null>>();
  private name = '';

  constructor(private readonly o: PackStoreOptions) {}

  /** The file at `path` (relative to `<base>packs/`); `url` is how it was asked for. */
  async get(path: string, url: string, init?: RequestInit): Promise<Response> {
    const where = (await this.files())?.get(path);
    const cache = await this.open();
    const key = this.url(path);
    if (cache) {
      const hit = await cache.match(key);
      if (hit) return hit;
    }
    if (where) {
      const bytes = await this.unpack(where.bundle);
      if (bytes) return file(bytes, where.at);
      const hit = await cache?.match(key);
      if (hit) return hit;
    }
    const res = await this.o.fetch(url, init);
    if (res.ok && cache) await cache.put(key, res.clone()).catch(() => {});
    return res;
  }

  /** Fetches every bundle now (the page calls this at boot, so the start's files are on their way at once). */
  async warm(): Promise<void> {
    const files = await this.files();
    if (!files) return;
    await Promise.all([...new Set([...files.values()].map((f) => f.bundle))].map((b) => this.unpack(b)));
  }

  private url(path: string): string { return new URL(`${this.o.base}packs/${path}`, this.o.origin).href; }

  private files(): Promise<Map<string, { bundle: string; at: readonly [number, number] }> | null> {
    this.index ??= (async () => {
      try {
        const res = await this.o.fetch(this.url('bundles.json'));
        if (!res.ok) return null;
        const idx = (await res.json()) as BundleIndex;
        const m = new Map<string, { bundle: string; at: readonly [number, number] }>();
        for (const b of idx.bundles) for (const [p, at] of Object.entries(b.files)) m.set(p, { bundle: b.file, at });
        this.name = PREFIX + idx.bundles.map((b) => b.file).join('+');
        return m;
      } catch {
        return null;
      }
    })();
    return this.index;
  }

  private open(): Promise<Cache | null> {
    this.cache ??= (async () => {
      const caches = this.o.caches;
      if (!caches) return null;
      await this.files();
      const name = this.name || `${PREFIX}files`;
      try {
        if (this.o.tidy) for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== name) await caches.delete(k);
        return await caches.open(name);
      } catch {
        return null;
      }
    })();
    return this.cache;
  }

  /**
   * Brings a bundle in: into the cache file by file (then resolves null: read the cache), or, without a cache, into
   * memory (resolves its bytes). Resolves null too if it could not be fetched: its files then come on their own.
   */
  private unpack(bundle: string): Promise<ArrayBuffer | null> {
    let job = this.unpacking.get(bundle);
    if (!job) {
      job = (async () => {
        const cache = await this.open();
        const done = this.url(`${bundle}.done`);
        const run = async (): Promise<ArrayBuffer | null> => {
          if (cache && (await cache.match(done))) return null;
          const bytes = await this.download(bundle);
          if (!bytes || !cache) return bytes;
          const files = (await this.files()) ?? new Map();
          try {
            await Promise.all([...files].filter(([, f]) => f.bundle === bundle).map(([p, f]) => cache.put(this.url(p), file(bytes, f.at))));
            await cache.put(done, new Response('1'));
            return null;
          } catch {
            return bytes; // the cache is full or refused: serve from memory
          }
        };
        const locks = this.o.locks;
        return locks ? locks.request(`${PREFIX}${bundle}`, run) : run();
      })();
      this.unpacking.set(bundle, job);
    }
    return job;
  }

  private async download(bundle: string): Promise<ArrayBuffer | null> {
    for (let t = 0; t < 3; t++) {
      try {
        const res = await this.o.fetch(this.url(bundle));
        if (!res.ok) return null;
        return await res.arrayBuffer();
      } catch (e) {
        console.warn(`[packs] ${bundle}: ${String(e)}${t < 2 ? '; trying again' : '; its files come one by one'}`);
      }
    }
    return null;
  }
}

const file = (bytes: ArrayBuffer, [at, length]: readonly [number, number]): Response =>
  new Response(bytes.slice(at, at + length), { headers: { 'content-type': 'application/octet-stream', 'content-length': String(length) } });
