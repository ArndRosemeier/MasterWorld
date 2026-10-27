/**
 * Load-time probe (F4, A7; a slow check run after `npm run build`): `node tools/shot/load.mjs ["?query"] [--record]`.
 * Opens the game as a player does (presses a key at the title's gate, so sound may start), and reports when the title
 * shows, when the world is playable (`__mwReady`), and what was downloaded until then, by folder. It fails when the
 * start downloads music other than the title's own theme (music streams: a piece loads when it first plays), or when
 * LIMIT_TITLE / LIMIT_READY (seconds, default 1 and 20, the F4 marks on the reference machine; SwiftShader in the cloud
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
const LIMIT_TITLE = Number(process.env.LIMIT_TITLE ?? 1), LIMIT_READY = Number(process.env.LIMIT_READY ?? 20);

const { server, base, browser } = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
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
