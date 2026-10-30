/**
 * Load-time probe (F4, A7; a slow check run after `npm run build`): `node tools/shot/load.mjs ["?query"] [--record]`.
 * Opens the game as a player does (presses a key at the title's gate, so sound may start), and reports when the title
 * shows, when the world is playable (`__mwReady`), and what was downloaded until then, by folder. It fails when the
 * start downloads music other than the title's own theme (music streams: a piece loads when it first plays), or when
 * LIMIT_TITLE / LIMIT_READY (seconds, default 1 and 20, the F4 marks on the reference machine, and 30 to play for the
 * WebGL fallback timed on a GPU (SHOT_GPU with "?gl"); SwiftShader in the cloud
 * container is far slower, so set them there or pass LIMITS=0 to only report).
 */
import { existsSync, renameSync, writeFileSync } from 'node:fs';
import { launch } from './launch.mjs';
import { profile, report } from './profile.mjs';

// `--record`: the pack files this start fetched become tools/packs/start.json, the start bundle's list
// (tools/packs/bundle.mjs); the run fetches them one by one, so the bundle is set aside meanwhile.
const record = process.argv.includes('--record');
// The game's own default backend on a real GPU (WebGPU where the browser has it: what a player gets); WebGL in the
// cloud's SwiftShader. Pass "?gl" to time the WebGL fallback on a GPU.
const [query = process.env.SHOT_GPU ? '?' : '?gl'] = process.argv.slice(2).filter((a) => a !== '--record');
const bundles = 'dist/packs/bundles.json';
if (record && existsSync(bundles)) renameSync(bundles, `${bundles}.off`);
const limits = process.env.LIMITS !== '0';
const LIMIT_TITLE = Number(process.env.LIMIT_TITLE ?? 1), LIMIT_READY = Number(process.env.LIMIT_READY ?? (process.env.SHOT_GPU && /\bgl\b/.test(query) ? 30 : 20));

const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
// `LOAD_PIPELINES=1`: every GPU pipeline built before play, with its material (three's label), its shaders' sizes and
// how long it took, the slowest listed after the builds (the monitor records them only as "pipeline").
if (process.env.LOAD_PIPELINES) await page.addInitScript(() => {
  const D = globalThis.GPUDevice?.prototype;
  if (!D) return;
  const size = new WeakMap(), list = (window.__pipelines = []);
  const mod = D.createShaderModule;
  D.createShaderModule = function (d, ...a) { const m = mod.call(this, d, ...a); size.set(m, d?.code?.length ?? 0); return m; };
  const fa = D.createRenderPipelineAsync;
  D.createRenderPipelineAsync = function (d, ...a) {
    const t0 = performance.now(), p = fa.call(this, d, ...a);
    const e = { label: d?.label ?? '', vs: size.get(d?.vertex?.module) ?? 0, fs: size.get(d?.fragment?.module) ?? 0, t: t0, ms: -1 };
    list.push(e);
    const end = () => { e.ms = performance.now() - t0; };
    p.then(end, end);
    return p;
  };
});
// `LOAD_JOBS=1`: every worker job answered before play (pool, worker, kind, sent, answered), per worker in order.
if (process.env.LOAD_JOBS) await page.addInitScript(() => { window.__mwJobLog = []; });
// The game's own loading steps (and pack retries), so a slow start shows where its time goes.
const steps = [];
page.on('console', (m) => {
  const t = m.text();
  if (/^\[(load|packs|title|diag)\]/.test(t)) console.log(`  ${t}`);
  const s = /^\[load\] ([\d.]+) s: (.*)$/.exec(t);
  if (s) steps.push({ at: Number(s[1]) * 1000, name: s[2] });
});

/** Every finished download: its path under the site and its body bytes; `ready` marks those after the world was playable. */
const got = [];
let ready = false;
page.on('requestfinished', async (r) => {
  const path = new URL(r.url()).pathname.replace(new URL(base).pathname, '');
  const bytes = (await r.sizes().catch(() => null))?.responseBodySize ?? 0;
  got.push({ path, bytes, ready });
});

const t0 = Date.now();
await page.goto(base + (query.startsWith('?') ? query : '?' + query));
console.log('page loaded', ((Date.now() - t0) / 1000).toFixed(1));
// `LOAD_PROFILE=1`: where the main thread's time goes in each loading step (profile.mjs), from the page's load on.
const stopProfile = process.env.LOAD_PROFILE ? await profile(page) : null;
const seen = await page.waitForSelector('.t-gate', { timeout: 60000 }).then(() => (Date.now() - t0) / 1000).catch(() => null);
// When the title was first painted: the browser's element timing of the gate's name (`elementtiming="title"`). The
// probe's own look (`seen`) can come seconds later, as the game's start keeps the page's thread busy meanwhile.
const painted = seen === null ? null : await page.evaluate(() => new Promise((done) => {
  setTimeout(() => done(null), 5000);
  new PerformanceObserver((l) => { const e = l.getEntries().find((x) => x.identifier === 'title'); if (e) done(e.renderTime || e.loadTime); }).observe({ type: 'element', buffered: true });
}));
const gate = seen === null ? null : painted !== null ? painted / 1000 : seen;
if (gate !== null) await page.keyboard.press('Space');
if (gate !== null) console.log(`title ${gate.toFixed(2)} (first paint; the probe saw it at ${seen.toFixed(2)})`);
const came = await page.waitForFunction(() => window.__mwReady === true, null, { timeout: Number(process.env.LOAD_WAIT ?? 300) * 1000 }).then(() => true, () => false);
const playable = came ? (Date.now() - t0) / 1000 : Infinity;
console.log('playable', playable.toFixed(1));
ready = true;
// The shader builds before play (the monitor's warm-up), the costliest first: what 'Preparing shaders' spends.
const builds = came ? await page.evaluate(() => {
  const by = new Map();
  for (const e of window.shaders?.events ?? []) if (e.phase === 'warmup') { const b = by.get(e.what) ?? { what: e.what, n: 0, ms: 0 }; b.n++; b.ms += e.ms; by.set(e.what, b); }
  return [...by.values()].sort((a, b) => b.ms - a.ms);
}) : [];
if (builds.length) {
  console.log(`shader builds before play: ${builds.reduce((n, b) => n + b.n, 0)}, ${builds.reduce((n, b) => n + b.ms, 0).toFixed(0)} ms in all; the costliest:`);
  for (const b of builds.slice(0, 15)) console.log(`  ${b.ms.toFixed(0).padStart(6)} ms ${String(b.n).padStart(3)}x ${b.what}`);
}
if (process.env.LOAD_PIPELINES && came) {
  const ps = await page.evaluate(() => window.__pipelines);
  ps.sort((a, b) => b.ms - a.ms);
  console.log(`GPU pipelines before play: ${ps.length}, ${ps.reduce((n, p) => n + Math.max(0, p.ms), 0).toFixed(0)} ms summed; the slowest:`);
  for (const p of ps.slice(0, 25)) console.log(`  ${p.ms.toFixed(0).padStart(6)} ms from ${(p.t / 1000).toFixed(2)} s · vs ${p.vs} fs ${p.fs} chars · ${p.label}`);
}
if (process.env.LOAD_JOBS && came) {
  const jobs = await page.evaluate(() => window.__mwJobLog);
  const by = new Map();
  for (const j of jobs) { const k = `${j.pool} ${j.worker}`; if (!by.has(k)) by.set(k, []); by.get(k).push(j); }
  console.log(`worker jobs before play: ${jobs.length}`);
  // Chunks by size: how many, and their time in the workers.
  const sizes = new Map();
  for (const j of jobs) if (j.kind === 'chunk') { const b = sizes.get(j.size) ?? { n: 0, ms: 0, most: 0 }; b.n++; b.ms += j.ms; b.most = Math.max(b.most, j.ms); sizes.set(j.size, b); }
  for (const [size, b] of [...sizes].sort((a, b) => a[0] - b[0])) console.log(`  chunks ${size} m: ${b.n}x ${(b.ms / 1000).toFixed(1)} s, slowest ${(b.most / 1000).toFixed(2)} s`);
  for (const [k, list] of [...by].sort()) {
    list.sort((a, b) => a.done - b.done);
    // In one worker the jobs run one after another: each starts when it was sent or the one before was answered.
    // Each job's own time in the worker (serve's ms) ends when its answer left, a moment before it was heard here.
    const runs = list.map((j) => ({ ...j, start: j.done - j.ms }));
    const byKind = new Map();
    for (const r of runs) { const b = byKind.get(r.kind) ?? { n: 0, ms: 0, last: 0 }; b.n++; b.ms += r.done - r.start; b.last = Math.max(b.last, r.done); byKind.set(r.kind, b); }
    console.log(`  ${k}: ${[...byKind].map(([kind, b]) => `${kind} ${b.n}x ${(b.ms / 1000).toFixed(1)} s (last ${(b.last / 1000).toFixed(1)})`).join(' · ')}`);
    for (const r of runs.filter((r) => r.done - r.start > 400)) console.log(`      ${(r.start / 1000).toFixed(1)}–${(r.done / 1000).toFixed(1)} s ${r.kind}${r.size ? ` ${r.size} m` : ''} (sent ${(r.sent / 1000).toFixed(1)})`);
    const s = list[list.length - 1].stats;
    if (s) console.log(`      by play: ${Object.entries(s).map(([k, v]) => `${k} ${Math.round(v)}`).join(' · ')}`);
  }
}
if (stopProfile) report(await stopProfile(), steps, 'dist');
// A moment in the world: music asked for now is "when first needed", and is listed apart.
await page.waitForTimeout(Number(process.env.LOAD_AFTER ?? 3000));
await browser.close();
server.httpServer.closeAllConnections?.();
await server.close();

if (record && existsSync(`${bundles}.off`)) renameSync(`${bundles}.off`, bundles);
if (record) {
  const files = [...new Set(got.filter((g) => !g.ready && g.path.startsWith('packs/') && !g.path.endsWith('bundles.json')).map((g) => decodeURIComponent(g.path.slice('packs/'.length))))].sort();
  writeFileSync('tools/packs/start.json', `${JSON.stringify({ note: 'The pack files a start fetches (npm run load -- --record); tools/packs/bundle.mjs joins them.', files }, null, 1)}\n`);
  console.log(`tools/packs/start.json: ${files.length} files`);
}

const MB = 1024 * 1024;
const byFolder = new Map();
for (const g of got.filter((g) => !g.ready)) {
  const key = g.path.split('/').slice(0, g.path.startsWith('sound/') || g.path.startsWith('packs/') ? 2 : 1).join('/') || '(page)';
  const f = byFolder.get(key) ?? { files: 0, bytes: 0 };
  f.files++; f.bytes += g.bytes;
  byFolder.set(key, f);
}
const total = [...byFolder.values()].reduce((a, f) => a + f.bytes, 0);
console.log(`title ${gate === null ? 'none (title=0?)' : gate.toFixed(2) + ' s'} · playable ${playable.toFixed(1)} s · start download ${(total / MB).toFixed(1)} MB`);
for (const [k, f] of [...byFolder].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 12)) console.log(`  ${k.padEnd(28)} ${String(f.files).padStart(5)} files ${(f.bytes / MB).toFixed(2).padStart(8)} MB`);
const music = (after) => got.filter((g) => g.ready === after && g.path.startsWith('sound/music/'));
const early = music(false).filter((g) => !g.path.startsWith('sound/music/title'));
console.log(`music at the start: ${music(false).map((g) => g.path).join(', ') || 'none'} · in the world: ${music(true).map((g) => g.path).join(', ') || 'none yet'}`);

const fails = [];
if (!came) fails.push('the world never became playable');
if (early.length) fails.push(`the start loaded game music: ${early.map((g) => g.path).join(', ')}`);
if (limits && gate !== null && gate > LIMIT_TITLE) fails.push(`title after ${gate.toFixed(2)} s (limit ${LIMIT_TITLE} s)`);
if (limits && came && playable > LIMIT_READY) fails.push(`playable after ${playable.toFixed(1)} s (limit ${LIMIT_READY} s)`);
for (const f of fails) console.error(`FAIL ${f}`);
console.log(fails.length ? 'load: FAIL' : 'load: ok');
process.exit(fails.length ? 1 : 0);
