/**
 * The hitch log after a go-to (src/app/hitchLog.ts): `node tools/shot/hitches.mjs [go-to label] [seconds]` after
 * `npm run build` (and `npm run packs`), SHOT_GPU=1 on the reference machine. Starts at the start town by day,
 * stands there `seconds` (default 20) for a baseline, runs the go-to (default Waystation), stands there as long,
 * and prints both hitch logs: every frame over 50 ms (HITCH_OVER) with what took its time. A slow check
 * (docs/CHECKS.md), about a minute. HITCH_TRACE=1: a Chrome trace of the stay after the go-to, summed up: the
 * longest garbage collections and tasks, and the JS heap every 2 s.
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
