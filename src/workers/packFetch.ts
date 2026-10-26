/**
 * Fetching the Actors packs (the people's and animals' body, morph targets, garments and clips) from a
 * plain static host. A character needs hundreds of small files at once (one per morph target), and
 * GitHub Pages answers such a burst with 503s; one failed file used to stop the start. So pack requests
 * here wait their turn (a few at a time) and a failed one is tried again after a growing pause.
 *
 * Actors' loaders call the global `fetch` (also inside their workers, which take no fetcher), so
 * `installPackFetch` puts this in front of it for pack URLs only, in the page and in each Actors worker
 * (human.worker.ts, animal.worker.ts). Pure: no three.js, no DOM.
 */

import { PackStore } from './packStore';

type Fetch = typeof fetch;

export interface PackFetchOptions {
  /** Requests in flight at once. */
  readonly parallel?: number;
  /** Tries per request (the first included). */
  readonly tries?: number;
  /** Pause before the second try, ms; it doubles for each further one (capped at `maxPause`). */
  readonly pause?: number;
  readonly maxPause?: number;
  /** Waits `ms` (tests pass a fake clock). */
  readonly sleep?: (ms: number) => Promise<void>;
}

/** Statuses worth another try: the host is busy or briefly down, not missing the file. */
export const retryable = (status: number): boolean => status === 408 || status === 429 || status >= 500;

/** `fetch` that queues and retries: every request waits for one of `parallel` slots. */
export function packFetch(inner: Fetch, o: PackFetchOptions = {}): Fetch {
  const parallel = o.parallel ?? 8, tries = o.tries ?? 6, pause = o.pause ?? 500, maxPause = o.maxPause ?? 8000;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let busy = 0;
  const queue: (() => void)[] = [];
  const slot = async (): Promise<void> => {
    if (busy < parallel) { busy++; return; }
    await new Promise<void>((r) => queue.push(r));
  };
  const free = (): void => {
    const next = queue.shift();
    if (next) next(); else busy--;
  };
  // A small spread on the pauses (requests that failed together should not come back together); counted, not random.
  let n = 0;
  return async (input, init) => {
    for (let t = 1; ; t++) {
      await slot();
      let res: Response | null = null, err: unknown = null;
      try { res = await inner(input, init); } catch (e) { err = e; } finally { free(); }
      if (res && (!retryable(res.status) || init?.signal?.aborted)) return res;
      if (init?.signal?.aborted) throw err;
      if (t >= tries) { if (res) return res; throw err; }
      // The host's own Retry-After (seconds) when it gives one, within reason.
      const after = Math.min(30_000, (Number(res?.headers.get('retry-after')) || 0) * 1000);
      const wait = Math.max(after, Math.min(maxPause, pause * 2 ** (t - 1)) * (1 + ((n++ * 0.37) % 0.5)));
      console.warn(`[packs] ${urlOf(input)}: ${res ? res.status : String(err)}; try ${t + 1} of ${tries} in ${(wait / 1000).toFixed(1)} s`);
      await sleep(wait);
    }
  };
}

const urlOf = (input: RequestInfo | URL): string => (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);

/** Whether a URL is a pack file (under `<base>packs/`). */
export const isPackUrl = (url: string, base: string): boolean => new URL(url, 'http://page/').pathname.startsWith(`${base}packs/`);

const INSTALLED = Symbol.for('masterworld.packFetch');

/**
 * Routes the global `fetch` for pack URLs through the pack store (bundles and the browser's cache, packStore.ts) and
 * `packFetch` (once per page or worker). Returns the store (the page warms it at boot).
 */
export function installPackFetch(scope: { fetch: Fetch } = globalThis, base: string = import.meta.env.BASE_URL, o: { tidy?: boolean } = {}): PackStore {
  const s = scope as { fetch: Fetch; [INSTALLED]?: PackStore };
  const had = s[INSTALLED];
  if (had) return had;
  const plain = s.fetch.bind(scope);
  const queued = packFetch(plain);
  const g = globalThis as { caches?: CacheStorage; navigator?: { locks?: LockManager }; location?: { href: string } };
  const store = new PackStore({ base, origin: g.location?.href ?? 'http://page/', fetch: queued, caches: g.caches ?? null, locks: g.navigator?.locks ?? null, tidy: o.tidy });
  s[INSTALLED] = store;
  const root = `${base}packs/`;
  s.fetch = (input, init) => {
    const url = urlOf(input);
    if (!isPackUrl(url, base) || (init?.method && init.method !== 'GET')) return plain(input, init);
    return store.get(decodeURIComponent(new URL(url, 'http://page/').pathname.slice(root.length)), url, init);
  };
  return store;
}
