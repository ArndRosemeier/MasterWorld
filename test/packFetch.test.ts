import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installPackFetch, isPackUrl, packFetch } from '../src/workers/packFetch';

const noSleep = { sleep: () => Promise.resolve() };
const quiet = <T>(f: () => Promise<T>): Promise<T> => {
  const warn = console.warn;
  console.warn = () => {};
  return f().finally(() => { console.warn = warn; });
};

test('packFetch: a 503 is tried again until the file comes', () => quiet(async () => {
  let calls = 0;
  const f = packFetch(async () => new Response('x', { status: ++calls < 3 ? 503 : 200 }), noSleep);
  const res = await f('/packs/human/targets/a.bin');
  assert.equal(res.status, 200);
  assert.equal(calls, 3);
}));

test('packFetch: a network error is tried again; a 404 is not', () => quiet(async () => {
  let calls = 0;
  const flaky = packFetch(async () => { if (++calls === 1) throw new TypeError('reset'); return new Response('x'); }, noSleep);
  assert.equal((await flaky('/packs/a')).status, 200);
  calls = 0;
  const missing = packFetch(async () => { calls++; return new Response('', { status: 404 }); }, noSleep);
  assert.equal((await missing('/packs/a')).status, 404);
  assert.equal(calls, 1);
}));

test('packFetch: gives up after its tries with the last answer', () => quiet(async () => {
  let calls = 0;
  const waits: number[] = [];
  const f = packFetch(async () => { calls++; return new Response('', { status: 503 }); }, { tries: 4, pause: 100, sleep: async (ms) => { waits.push(ms); } });
  assert.equal((await f('/packs/a')).status, 503);
  assert.equal(calls, 4);
  assert.equal(waits.length, 3);
  assert.ok(waits[0] >= 100 && waits[1] >= 200 && waits[2] >= 400, waits.join());
}));

test('packFetch: never more than `parallel` requests in flight', async () => {
  let open = 0, most = 0;
  const f = packFetch(async () => {
    most = Math.max(most, ++open);
    await new Promise((r) => setTimeout(r, 1));
    open--;
    return new Response('x');
  }, { parallel: 3 });
  const all = await Promise.all(Array.from({ length: 20 }, (_, i) => f(`/packs/${i}`)));
  assert.equal(all.length, 20);
  assert.equal(most, 3);
});

test('isPackUrl and installPackFetch: only pack files are routed', async () => {
  assert.ok(isPackUrl('/MasterWorld/packs/human/base.bin', '/MasterWorld/'));
  assert.ok(isPackUrl('https://x.github.io/MasterWorld/packs/horse/manifest.json', '/MasterWorld/'));
  assert.ok(!isPackUrl('/MasterWorld/assets/index.js', '/MasterWorld/'));
  assert.ok(!isPackUrl('https://x.io/other/packs/a', '/MasterWorld/'));
  let calls = 0;
  const scope = { fetch: (async () => new Response('', { status: ++calls === 1 ? 503 : 200 })) as typeof fetch };
  installPackFetch(scope, '/');
  installPackFetch(scope, '/'); // once only
  await quiet(async () => assert.equal((await scope.fetch('/packs/a')).status, 200));
  calls = 0;
  assert.equal((await scope.fetch('/assets/a.js')).status, 503); // not a pack: not retried
});
