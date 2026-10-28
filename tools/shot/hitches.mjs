/**
 * The hitch log after a go-to (src/app/hitchLog.ts): `node tools/shot/hitches.mjs [go-to label] [seconds]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. Starts at the start town by day,
 * stands there `seconds` (default 20) for a baseline, runs the go-to (default Waystation), stands there as long,
 * and prints both hitch logs: every frame over 50 ms (HITCH_OVER) with what took its time. A slow check
 * (docs/CHECKS.md), about a minute. HITCH_TRACE=1: a Chrome trace of the stay after the go-to, summed up: the
 * longest garbage collections and tasks, and the JS heap every 2 s. HITCH_PROFILE=1: a CPU profile from the go-to
 * to the end; the longest stretch of busy samples is summed up by function (a build with `--minify=false` names them).
 */
import { readFileSync } from 'node:fs';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const label = process.argv[2] ?? 'Waystation', secs = Number(process.argv[3] ?? 20), over = Number(process.env.HITCH_OVER ?? 50);

const trace = process.env.HITCH_TRACE === '1';
const { server, base, browser } = await launch({ args: ['--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log(`PAGE ERROR: ${e.message}`));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair&seed=${process.env.SHOT_SEED ?? 'masterworld'}${process.env.SET_GL === '1' ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.evaluate((o) => { window.game.hitches.over = o; window.game.hitches.clear(); }, over);
await page.waitForTimeout(secs * 1000);
console.log(`--- start town, ${secs} s\n${await page.evaluate(() => window.game.hitches.report())}`);
const profiling = process.env.HITCH_PROFILE === '1';
const cdp = profiling ? await page.context().newCDPSession(page) : null;
if (cdp) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 1000 }); await cdp.send('Profiler.start'); }
const said = await page.evaluate((l) => Promise.resolve(window.game.go(l)).then((r) => String(r), (e) => `THREW ${e}`), label);
console.log(`--- go to ${label}: ${said}`);
await page.waitForTimeout(3000);
await page.evaluate(() => window.game.hitches.clear());
const file = 'shots/hitch-trace.json';
if (trace) await browser.startTracing(page, { path: file, categories: ['devtools.timeline', 'v8', 'disabled-by-default-v8.gc', 'disabled-by-default-devtools.timeline'] });
const heap = [];
for (let s = 0; s < secs; s += 2) {
  await page.waitForTimeout(2000);
  heap.push(await page.evaluate(() => Math.round((performance.memory?.usedJSHeapSize ?? 0) / 2 ** 20)));
}
if (trace) await browser.stopTracing();
console.log(`--- ${label}, ${secs} s after (first 3 s not counted)\n${await page.evaluate(() => window.game.hitches.report())}`);
console.log(`heap MB every 2 s: ${heap.join(' ')}`);
if (cdp) busiest((await cdp.send('Profiler.stop')).profile);
if (trace) {
  const ev = JSON.parse(readFileSync(file, 'utf8')).traceEvents ?? [];
  const main = ev.filter((e) => e.ph === 'X' && e.dur >= 30000);
  const gc = main.filter((e) => /GC|Scavenge|MarkCompact|Sweep/i.test(e.name)).sort((a, b) => b.dur - a.dur).slice(0, 15);
  console.log(`--- longest GC events (ms): ${gc.map((e) => `${e.name} ${(e.dur / 1000).toFixed(0)} @${(e.ts / 1e6).toFixed(1)}`).join('; ') || 'none over 30 ms'}`);
  const tasks = main.filter((e) => e.name === 'RunTask' || e.name === 'FunctionCall' || e.name === 'FireAnimationFrame' || e.name === 'EvaluateScript').sort((a, b) => b.dur - a.dur).slice(0, 15);
  console.log(`--- longest tasks (ms): ${tasks.map((e) => `${e.name} ${(e.dur / 1000).toFixed(0)} @${(e.ts / 1e6).toFixed(1)} tid ${e.tid}`).join('; ') || 'none over 30 ms'}`);
  // Inside the longest task: what ran in it (children over 20 ms on the same thread).
  const top = tasks[0];
  if (top) {
    const inside = ev.filter((e) => e.ph === 'X' && e.tid === top.tid && e.ts >= top.ts && e.ts + (e.dur ?? 0) <= top.ts + top.dur && e !== top && e.dur >= 20000).sort((a, b) => b.dur - a.dur).slice(0, 25);
    console.log(`--- inside it: ${inside.map((e) => `${e.name}${e.args?.data?.functionName ? `(${e.args.data.functionName})` : ''}${e.args?.data?.url ? ` ${String(e.args.data.url).split('/').pop()}` : ''} ${(e.dur / 1000).toFixed(0)}`).join('; ')}`);
  }
}
await browser.close();
await server.close();

/** The longest run of busy samples in a CPU profile, summed up by function: inclusive (on the stack) and self. */
function busiest(p) {
  const byId = new Map(p.nodes.map((n) => [n.id, n])), parent = new Map();
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const idle = (id) => { const f = byId.get(id).callFrame.functionName; return f === '(idle)' || f === '(program)' || f === '(garbage collector)' && false; };
  let best = [0, 0], from = -1, t = 0, start = 0;
  const times = p.timeDeltas.map((d) => (t += d));
  for (let i = 0; i <= p.samples.length; i++) {
    const busy = i < p.samples.length && !idle(p.samples[i]);
    if (busy && from < 0) { from = i; start = times[i]; }
    if (!busy && from >= 0) { if (times[i - 1] - start > times[best[1]] - times[best[0]]) best = [from, i - 1]; from = -1; }
  }
  const [a, b] = best, ms = (times[b] - times[a]) / 1000;
  const name = (id) => { const f = byId.get(id).callFrame; return `${f.functionName || '(anon)'} ${String(f.url).split('/').pop()}:${f.lineNumber + 1}`; };
  const incl = new Map(), self = new Map();
  for (let i = a; i <= b; i++) {
    const seen = new Set();
    self.set(name(p.samples[i]), (self.get(name(p.samples[i])) ?? 0) + 1);
    for (let id = p.samples[i]; id !== undefined; id = parent.get(id)) { const k = name(id); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) ?? 0) + 1); } }
  }
  const n = b - a + 1, top = (m, k) => [...m].sort((x, y) => y[1] - x[1]).slice(0, k).map(([f, c]) => `  ${(100 * c / n).toFixed(0)}% ${f}`).join('\n');
  console.log(`--- busiest stretch: ${ms.toFixed(0)} ms, ${n} samples\ninclusive:\n${top(incl, 40)}\nself:\n${top(self, 15)}`);
}
