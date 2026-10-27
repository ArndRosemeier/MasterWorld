/**
 * Where the page's main thread spends a load (`LOAD_PROFILE=1 npm run load`): a sampled CPU profile from the
 * browser (Chrome DevTools Protocol), cut into the game's `[load]` steps. For each step: how long it took, how much
 * of it the main thread was busy (the rest is waiting: the GPU building pipelines, workers, downloads), and the
 * functions that took the most of it, mapped back to the source through the build's source maps.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { SourceMap } from 'node:module';

/** Starts profiling `page`; the function it resolves to stops and returns the profile with the page's clock offset. */
export async function profile(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await cdp.send('Profiler.start');
  return async () => {
    const now = await page.evaluate(() => performance.now());
    const { profile: p } = await cdp.send('Profiler.stop');
    // The profile's clock (µs) against the page's performance.now() (ms), read a moment apart: close enough for steps.
    return { p, offset: p.endTime / 1000 - now };
  };
}

const maps = new Map();
/** The source position of a build position (dist/assets/x.js line/column, 0-based), or null. */
function source(dist, url, line, col) {
  const file = url.replace(/^https?:\/\/[^/]+\/?/, '').split('?')[0];
  if (!maps.has(file)) {
    const path = join(dist, `${file}.map`);
    maps.set(file, existsSync(path) ? new SourceMap(JSON.parse(readFileSync(path, 'utf8'))) : null);
  }
  const m = maps.get(file);
  const e = m?.findEntry(line, col);
  return e && e.originalSource ? `${e.originalSource.replace(/^(\.\.\/)+/, '').replace(/^node_modules\//, '')}:${e.originalLine + 1}` : null;
}

/**
 * Prints the steps: `steps` are [{ at (page ms), name }] in order (the `[load]` lines), `end` the page ms the
 * profile runs to.
 */
export function report({ p, offset }, steps, dist, top = 8) {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n);
  const own = new Map();
  /** The nearest frame (itself or a caller) in the game's own code or the shared packages: who asked for the work. */
  const owner = (n) => {
    if (own.has(n.id)) return own.get(n.id);
    let k = null;
    for (let x = n; x && !k; x = parent.get(x.id)) {
      const f = x.callFrame;
      const at = f.url ? source(dist, f.url, f.lineNumber, f.columnNumber) : null;
      if (at && (at.startsWith('src/') || at.includes('assetgenerator/packages/'))) k = `${f.functionName || '(anonymous)'} ${at.replace(/^.*assetgenerator\/packages\//, 'ag/')}`;
    }
    own.set(n.id, k ?? '(no game frame)');
    return own.get(n.id);
  };
  const label = (n) => {
    const f = n.callFrame;
    if (!f.url) return f.functionName || '(anonymous)';
    const at = source(dist, f.url, f.lineNumber, f.columnNumber) ?? `${f.url.split('/').pop()}:${f.lineNumber + 1}`;
    return `${f.functionName || '(anonymous)'} ${at}`;
  };
  // Each sample: its time on the page's clock and its node.
  let t = p.startTime / 1000 - offset;
  const samples = p.samples.map((id, i) => { t += p.timeDeltas[i] / 1000; return { t, node: byId.get(id) }; });
  const cuts = [...steps, { at: Infinity, name: '(end)' }];
  for (let s = 0; s + 1 < cuts.length; s++) {
    const a = cuts[s].at, b = cuts[s + 1].at;
    const inside = samples.filter((x) => x.t >= a && x.t < b);
    if (!inside.length) continue;
    const span = Math.min(b, inside[inside.length - 1].t) - a;
    const ms = new Map(), by = new Map();
    let busy = 0;
    for (let i = 0; i < inside.length; i++) {
      const dt = (i + 1 < inside.length ? inside[i + 1].t : inside[i].t) - inside[i].t;
      const name = inside[i].node.callFrame.functionName;
      if (name === '(idle)') continue;
      busy += dt;
      const k = name === '(program)' || name === '(garbage collector)' ? name : label(inside[i].node);
      ms.set(k, (ms.get(k) ?? 0) + dt);
      const o = owner(inside[i].node);
      by.set(o, (by.get(o) ?? 0) + dt);
    }
    console.log(`\n[profile] ${(a / 1000).toFixed(1)} s ${cuts[s].name}: ${(span / 1000).toFixed(2)} s, main thread busy ${(busy / 1000).toFixed(2)} s (${Math.round((100 * busy) / Math.max(1, span))} %)`);
    console.log('  by the game code that asked:');
    for (const [k, v] of [...by].sort((x, y) => y[1] - x[1]).slice(0, top)) console.log(`  ${v.toFixed(0).padStart(6)} ms  ${k}`);
    console.log('  by function (self time):');
    for (const [k, v] of [...ms].sort((x, y) => y[1] - x[1]).slice(0, top)) console.log(`  ${v.toFixed(0).padStart(6)} ms  ${k}`);
  }
}
