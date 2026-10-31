/**
 * Memory over a long flight: `node tools/shot/fly.mjs [minutes] [m/s]` after `npm run build` (and `npm run packs`),
 * SHOT_GPU=1 on the reference machine. Starts in the start town, takes the free camera and flies it on a wide
 * square spiral out over the land (default 4 min at 180 m/s, the free camera's Shift speed), so the land, trees,
 * towns and their people stream in ahead and out behind. Prints the JS heap of the page and of each worker every
 * 15 s, and what the game holds (game.memory). A slow check (docs/CHECKS.md), at most 5 min.
 *
 * FLY_MAX_GROWTH=<MB>: fail when the page's heap grew more than that from the first minute's end to the last
 * sample (both after a forced garbage collection). FLY_SAMPLE=1: V8's sampling heap profiler from the first minute
 * to the end; what it allocated that still lives at the end, summed by the function that allocated it and by the
 * game's function nearest up its stack (a build with `--minify=false` names them), to find what is kept.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const minutes = Number(process.argv[2] ?? 4), speed = Number(process.argv[3] ?? 180);
const maxGrowth = process.env.FLY_MAX_GROWTH ? Number(process.env.FLY_MAX_GROWTH) : null;
const sampling = process.env.FLY_SAMPLE === '1';

const { server, base, browser } = await launch({ args: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`PAGE ERROR: ${e.message}`));
const cdp = await page.context().newCDPSession(page);
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
const held = () => page.evaluate(() => JSON.stringify(window.game.memory?.() ?? {}));

const rows = [];
let first = null;
const t0 = Date.now(), end = t0 + minutes * 60000;
for (let tick = 1; Date.now() < end; tick++) {
  await page.waitForTimeout(Math.min(15000, end - Date.now()));
  const s = Math.round((Date.now() - t0) / 1000);
  const minute = s >= 60 && first === null;
  if (minute || Date.now() >= end) await gc();
  const heap = mb(await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0));
  const flown = await page.evaluate(() => Math.round(window.__flown / 1000));
  rows.push({ s, heap, flown });
  console.log(`${s} s, ${flown} km: page heap ${heap} MB${minute ? ' (after gc)' : ''}; holds ${await held()}`);
  if (minute) {
    first = heap;
    if (sampling) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 256 * 1024 }); }
  }
}
await gc();
const last = mb(await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0));
console.log(`after gc at the end: page heap ${last} MB (after the first minute ${first} MB)`);
if (sampling && first !== null) kept((await cdp.send('HeapProfiler.getSamplingProfile')).profile);
mkdirSync('shots', { recursive: true });
writeFileSync('shots/fly-heap.json', JSON.stringify(rows));
await browser.close();
await server.close();
if (maxGrowth !== null && first !== null && last - first > maxGrowth) {
  console.log(`FAIL: the page heap grew ${last - first} MB over the flight (allowed ${maxGrowth} MB)`);
  process.exit(1);
}

/** What the sampling heap profile holds (allocated since sampling began and alive now), by allocating function and by game function. */
function kept(p) {
  const self = new Map(), game = new Map();
  const name = (f) => `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`;
  const walk = (n, stack) => {
    const here = [...stack, n.callFrame];
    const bytes = (n.selfSize ?? 0);
    if (bytes) {
      self.set(name(n.callFrame), (self.get(name(n.callFrame)) ?? 0) + bytes);
      // The innermost frames, up to 3, that are not three.js or a library: who asked.
      const seen = new Set();
      for (const f of here.slice().reverse()) {
        if (!f.url || /three|node_modules|vendor/.test(f.url)) continue;
        const k = name(f);
        if (seen.has(k)) continue;
        seen.add(k);
        game.set(k, (game.get(k) ?? 0) + bytes);
        if (seen.size >= 3) break;
      }
    }
    for (const c of n.children ?? []) walk(c, here);
  };
  walk(p.head, []);
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, b]) => `  ${mb(b)} MB  ${k}`).join('\n');
  console.log(`kept since the first minute, by allocating function:\n${top(self)}`);
  console.log(`kept since the first minute, by the nearest game functions on the stack:\n${top(game)}`);
}
