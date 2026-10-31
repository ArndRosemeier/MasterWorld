/**
 * Memory over a long flight: `node tools/shot/fly.mjs [minutes] [m/s]` after `npm run build` (and `npm run packs`),
 * SHOT_GPU=1 on the reference machine. Starts in the start town, takes the free camera and flies it on a wide
 * square spiral out over the land (default 4 min at 180 m/s, the free camera's Shift speed), so the land, trees,
 * towns and their people stream in ahead and out behind. Prints the JS heap of the page and of each worker every
 * 15 s, and what the game holds (game.memory). A slow check (docs/CHECKS.md), at most 5 min.
 *
 * FLY_MAX_GROWTH=<MB>: fail when the page's heap grew more than that from the first minute's end to the last
 * sample (both after a forced garbage collection). FLY_SNAPSHOTS=1: a heap snapshot after the first minute and at
 * the end, and the object kinds that grew most between them (by count and bytes), to find what is kept.
 */
import { writeFileSync } from 'node:fs';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const minutes = Number(process.argv[2] ?? 4), speed = Number(process.argv[3] ?? 180);
const maxGrowth = process.env.FLY_MAX_GROWTH ? Number(process.env.FLY_MAX_GROWTH) : null;
const snapshots = process.env.FLY_SNAPSHOTS === '1';

const { server, base, browser } = await launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`PAGE ERROR: ${e.message}`));
const cdp = await page.context().newCDPSession(page);
// The workers' heaps too: each worker attached as its own target.
const workers = new Map();
page.on('worker', async (w) => {
  const url = w.url().split('/').pop().replace(/-[\w-]{8}\.js$/, '');
  workers.set(w, url);
  w.on('close', () => workers.delete(w));
});
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&fly${process.env.SET_GL === '1' ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });

// The flight: a square spiral, each leg a little longer, the camera 120 m above the ground looking ahead.
await page.evaluate((v) => {
  const g = window.game, p = g.player;
  p.flying = true;
  const c = g.view.camera.position;
  const at = { x: c.x, z: c.z, leg: 0, done: 0, dir: 0 };
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let last = performance.now();
  window.__flown = 0;
  const step = () => {
    const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    const len = 1500 + 1000 * at.leg, d = v * dt, [dx, dz] = dirs[at.dir];
    at.x += dx * d; at.z += dz * d; at.done += d; window.__flown += d;
    if (at.done >= len) { at.done = 0; at.leg++; at.dir = (at.dir + 1) % 4; }
    p.fly.place(at.x, at.z, g.terrain.height(at.x, at.z) + 120, true);
    p.fly.setLook(at.dir * 90, -12);
    window.__flying = requestAnimationFrame(step);
  };
  window.__flying = requestAnimationFrame(step);
}, speed);

const gc = async () => { await cdp.send('HeapProfiler.collectGarbage'); await page.evaluate(() => window.gc?.()); };
const mb = (b) => Math.round(b / 2 ** 20);
const workerHeaps = async () => {
  const out = [];
  for (const [w, name] of workers) {
    try { out.push(`${name} ${mb(await w.evaluate(() => (performance.memory?.usedJSHeapSize ?? 0)))}`); } catch { /* closed */ }
  }
  return out.join(', ');
};
const held = () => page.evaluate(() => JSON.stringify(window.game.memory?.() ?? {}));

const rows = [];
let first = null, firstSnap = null;
const t0 = Date.now(), end = t0 + minutes * 60000;
for (let tick = 1; Date.now() < end; tick++) {
  await page.waitForTimeout(Math.min(15000, end - Date.now()));
  const s = Math.round((Date.now() - t0) / 1000);
  const minute = s >= 60 && first === null;
  if (minute || Date.now() >= end) await gc();
  const heap = mb(await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0));
  const flown = await page.evaluate(() => Math.round(window.__flown / 1000));
  rows.push({ s, heap, flown });
  console.log(`${s} s, ${flown} km: page heap ${heap} MB${minute ? ' (after gc)' : ''}; workers: ${await workerHeaps()}; holds ${await held()}`);
  if (minute) { first = heap; if (snapshots) firstSnap = await snapshot(); }
}
await gc();
const last = mb(await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0));
console.log(`after gc at the end: page heap ${last} MB (after the first minute ${first} MB)`);
if (snapshots && firstSnap) {
  const lastSnap = await snapshot();
  const grew = [...lastSnap].map(([k, [n, b]]) => { const [n0, b0] = firstSnap.get(k) ?? [0, 0]; return [k, n - n0, b - b0]; });
  console.log('grew most by bytes:');
  for (const [k, n, b] of grew.sort((a, b) => b[2] - a[2]).slice(0, 30)) console.log(`  ${mb(b)} MB  ${n} x ${k}`);
  console.log('grew most by count:');
  for (const [k, n, b] of grew.sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${n} x ${k}  ${mb(b)} MB`);
}
writeFileSync('shots/fly-heap.json', JSON.stringify(rows));
await browser.close();
await server.close();
if (maxGrowth !== null && first !== null && last - first > maxGrowth) {
  console.log(`FAIL: the page heap grew ${last - first} MB over the flight (allowed ${maxGrowth} MB)`);
  process.exit(1);
}

/** A heap snapshot summed by object kind (type:name): count and self bytes. */
async function snapshot() {
  await gc();
  const parts = [];
  const on = (e) => parts.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', on);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', on);
  const snap = JSON.parse(parts.join(''));
  const f = snap.snapshot.meta.node_fields, types = snap.snapshot.meta.node_types[0];
  const iType = f.indexOf('type'), iName = f.indexOf('name'), iSize = f.indexOf('self_size'), w = f.length;
  const by = new Map(), nodes = snap.nodes, strings = snap.strings;
  for (let i = 0; i < nodes.length; i += w) {
    const t = types[nodes[i + iType]];
    const name = t === 'object' || t === 'closure' || t === 'native' ? strings[nodes[i + iName]] : '';
    const k = `${t}:${name.slice(0, 80)}`;
    const e = by.get(k) ?? [0, 0];
    e[0]++; e[1] += nodes[i + iSize];
    by.set(k, e);
  }
  return by;
}
