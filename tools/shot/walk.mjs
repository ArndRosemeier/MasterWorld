/**
 * Frame times on a long walk that founds places (a slow check, run by hand on a machine with a GPU; Gate B):
 * `node tools/shot/walk.mjs "<query>"` after `npm run build`, with SHOT_GPU=1 (SHOT_HEADED=1 for a real window).
 * After the game is ready and has settled, the hero is moved along a straight line at WALK_SPEED m/s (default
 * 25, a fast ride, so a few minutes reach the hamlets 1.5-5 km out) for WALK_KM km (default 5) in direction
 * WALK_DIR (radians, atan2(z, x); default 0, east). Every frame's interval is kept, and what the main thread
 * spent in the frontier (regionSites.heroAt), the towns (towns.tick) and the renderer; long tasks
 * are caught. Prints the frame-time spread, the slow frames (with where the hero was and what had been
 * founded by then) and the regions and settlements opened.
 */
import { launch } from './launch.mjs';

const SETTLE = Number(process.env.WALK_SETTLE ?? 5000);
const SPEED = Number(process.env.WALK_SPEED ?? 25);
const KM = Number(process.env.WALK_KM ?? 5);
const DIR = Number(process.env.WALK_DIR ?? 0);
const SLOW = Number(process.env.WALK_SLOW_MS ?? 33);
const query = process.argv[2] ?? '?title=0&hour=12&weather=clear';

const { server, base, browser } = await launch({ headed: !!process.env.SHOT_HEADED });
const page = await browser.newPage({ viewport: { width: Number(process.env.WALK_W ?? 1600), height: Number(process.env.WALK_H ?? 900) } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error(`[page ${m.type()}] ${m.text()}`); });
await page.goto(base + (query.startsWith('?') ? query : '?' + query));
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 600000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(SETTLE);

const result = await page.evaluate(({ speed, km, dir, slow }) => new Promise((done) => {
  const g = window.game, steps = new Map();
  const wrap = (name, obj, key) => {
    const f = obj?.[key];
    if (typeof f !== 'function') return;
    obj[key] = function (...a) { const s = performance.now(); try { return f.apply(this, a); } finally { steps.set(name, (steps.get(name) ?? 0) + performance.now() - s); } };
  };
  wrap('render', g.view.renderer, 'render');
  wrap('frontier', g.regionSites, 'heroAt');
  wrap('towns', g.towns, 'tick');
  wrap('flora', g.flora, 'update');
  wrap('ground', g.ground, 'update');
  const long = [];
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push({ at: e.startTime, ms: e.duration }); }).observe({ type: 'longtask', buffered: false }); } catch { /* no long tasks here */ }
  const w = g.player.walker.pos, x0 = w.x, z0 = w.z, ux = Math.cos(dir), uz = Math.sin(dir);
  const dts = [], slowFrames = [];
  let last = performance.now(), gone = 0;
  const t0 = last;
  const where = () => `${(gone / 1000).toFixed(2)} km · ${g.regionSites?.status ?? 'no regions'} · ${g.towns?.tally ?? ''}`;
  const step = (now) => {
    const dt = now - last; last = now;
    dts.push(dt);
    if (dt > slow) slowFrames.push({ t: ((now - t0) / 1000).toFixed(1), ms: dt.toFixed(1), where: where() });
    gone += speed * Math.min(dt, 100) / 1000;
    // Face the way and stand on the ground there.
    g.player.teleport(x0 + ux * gone, undefined, z0 + uz * gone, Math.atan2(-ux, -uz));
    if (gone < km * 1000) { requestAnimationFrame(step); return; }
    const s = [...dts].sort((a, b) => a - b), n = s.length, q = (p) => s[Math.min(n - 1, Math.floor(n * p))];
    done({
      frames: n, seconds: (now - t0) / 1000, mean: dts.reduce((a, b) => a + b, 0) / n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[n - 1],
      slow: slowFrames.length, slowFrames: slowFrames.slice(0, 60), long: long.length, longest: long.sort((a, b) => b.ms - a.ms).slice(0, 10),
      steps: Object.fromEntries([...steps].map(([k, v]) => [k, +(v / n).toFixed(3)])), end: where(),
    });
  };
  requestAnimationFrame(step);
}), { speed: SPEED, km: KM, dir: DIR, slow: SLOW });

console.log(`walk ${KM} km at ${SPEED} m/s, direction ${DIR}: ${result.frames} frames in ${result.seconds.toFixed(1)} s`);
console.log(`frame ms: mean ${result.mean.toFixed(2)} · p50 ${result.p50.toFixed(2)} · p95 ${result.p95.toFixed(2)} · p99 ${result.p99.toFixed(2)} · max ${result.max.toFixed(1)}`);
console.log(`main thread per frame (ms): ${JSON.stringify(result.steps)}`);
console.log(`frames over ${SLOW} ms: ${result.slow}; long tasks: ${result.long}`);
for (const f of result.slowFrames) console.log(`  slow at ${f.t} s: ${f.ms} ms (${f.where})`);
for (const l of result.longest) console.log(`  long task ${l.ms.toFixed(0)} ms at ${(l.at / 1000).toFixed(1)} s`);
console.log(`end: ${result.end}`);
await browser.close();
server.close();
