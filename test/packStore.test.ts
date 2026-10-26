import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PackStore, type BundleIndex } from '../src/workers/packStore';

/** Cache Storage in memory (what the store uses of it). */
class FakeCaches {
  readonly stores = new Map<string, Map<string, ArrayBuffer>>();
  async keys(): Promise<string[]> { return [...this.stores.keys()]; }
  async delete(name: string): Promise<boolean> { return this.stores.delete(name); }
  async open(name: string): Promise<Cache> {
    const m = this.stores.get(name) ?? new Map<string, ArrayBuffer>();
    this.stores.set(name, m);
    return {
      match: async (k: string) => (m.has(k) ? new Response(m.get(k)!.slice(0)) : undefined),
      put: async (k: string, r: Response) => { m.set(k, await r.arrayBuffer()); },
    } as unknown as Cache;
  }
}

/** A site: bundles.json, one bundle holding a and b, and c on its own; counts what was fetched. */
function site() {
  const a = new TextEncoder().encode('AAA'), b = new TextEncoder().encode('BB');
  const bundle = new Uint8Array([...a, ...b]);
  const index: BundleIndex = { bundles: [{ file: 'start-1.bin', files: { 'human/a.bin': [0, 3], 'human/b.bin': [3, 2] } }] };
  const got: string[] = [];
  const fetch = (async (u: string) => {
    const path = new URL(u).pathname;
    got.push(path);
    if (path === '/packs/bundles.json') return Response.json(index);
    if (path === '/packs/start-1.bin') return new Response(bundle);
    if (path === '/packs/human/c.bin') return new Response('C');
    return new Response('', { status: 404 });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, got };
}
const text = async (r: Response) => new TextDecoder().decode(await r.arrayBuffer());
const opts = (fetch: typeof globalThis.fetch, caches: FakeCaches | null) => ({ base: '/', origin: 'http://site/', fetch, caches: caches as unknown as CacheStorage, locks: null });

test('packStore: bundled files come from one download, then from the cache', async () => {
  const s = site(), caches = new FakeCaches();
  const store = new PackStore(opts(s.fetch, caches));
  const [a, b] = await Promise.all([store.get('human/a.bin', 'http://site/packs/human/a.bin'), store.get('human/b.bin', 'http://site/packs/human/b.bin')]);
  assert.equal(await text(a), 'AAA');
  assert.equal(await text(b), 'BB');
  assert.deepEqual(s.got, ['/packs/bundles.json', '/packs/start-1.bin']);
  // The next visit: nothing but the index from the network.
  const again = site();
  const next = new PackStore(opts(again.fetch, caches));
  assert.equal(await text(await next.get('human/b.bin', 'http://site/packs/human/b.bin')), 'BB');
  assert.deepEqual(again.got, ['/packs/bundles.json']);
});

test('packStore: a file outside the bundles comes on its own and is kept', async () => {
  const s = site(), caches = new FakeCaches();
  const store = new PackStore(opts(s.fetch, caches));
  assert.equal(await text(await store.get('human/c.bin', 'http://site/packs/human/c.bin')), 'C');
  assert.equal(await text(await store.get('human/c.bin', 'http://site/packs/human/c.bin')), 'C');
  assert.deepEqual(s.got, ['/packs/bundles.json', '/packs/human/c.bin']);
  assert.equal((await store.get('human/x.bin', 'http://site/packs/human/x.bin')).status, 404);
});

test('packStore: without a cache the bundle is held in memory; the page drops older caches', async () => {
  const s = site();
  const store = new PackStore(opts(s.fetch, null));
  await store.warm();
  assert.equal(await text(await store.get('human/a.bin', 'http://site/packs/human/a.bin')), 'AAA');
  assert.deepEqual(s.got, ['/packs/bundles.json', '/packs/start-1.bin']);
  const caches = new FakeCaches();
  await caches.open('mw-packs-start-0.bin');
  await caches.open('other');
  await new PackStore({ ...opts(site().fetch, caches), tidy: true }).get('human/a.bin', 'http://site/packs/human/a.bin');
  assert.deepEqual(await caches.keys(), ['other', 'mw-packs-start-1.bin']);
});

test('packStore: no bundles.json (dev server): every file on its own', async () => {
  const got: string[] = [];
  const fetch = (async (u: string) => { got.push(new URL(u).pathname); return u.endsWith('bundles.json') ? new Response('<html>', { status: 200 }) : new Response('F'); }) as unknown as typeof globalThis.fetch;
  const store = new PackStore(opts(fetch, null));
  assert.equal(await text(await store.get('human/a.bin', 'http://site/packs/human/a.bin')), 'F');
  assert.deepEqual(got, ['/packs/bundles.json', '/packs/human/a.bin']);
});
