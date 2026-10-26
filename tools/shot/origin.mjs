/**
 * The floating origin's check (implementation plan B0): `node tools/shot/origin.mjs [out root]` after `npm run packs`
 * and `npm run build`, with SHOT_GPU=1 on the reference machine. For the start town (32 km from zero) and a shore
 * 300 km out it takes:
 *
 *  - the picture as drawn (origin on), with frame times (median, 95th percentile) and the shader summary;
 *  - the same with `origin=0` (drawn relative to zero, as before B0), to see what the origin fixes;
 *  - an origin step: a picture, another a moment later (what moves by itself: wind, water, the hero breathing),
 *    then the origin moved one grain and a third picture. The step passes when it changes the picture no more than
 *    the moment alone did, and built no shader.
 *
 * Writes JPEGs, `index.md` and `index.json` into `<out root>/<date>-<commit>/` (default root `shots/origin`).
 * Exits 1 when a page failed, a step showed or built something, or a shader violation was recorded. A slow check
 * (docs/CHECKS.md): one run stays under 5 min. ORIGIN_ONLY=town or far takes one spot.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { drawnNear, measureFrames, shadersQuiet } from './wait.mjs';

const TIMEOUT = 120000;
const gl = process.env.SET_GL !== '0';
const still = `title=0&day=0&hour=12&weather=clear${gl ? '&gl' : ''}`;
/** One grain of the origin (src/render/origin.ts ORIGIN_GRAIN). */
const GRAIN = 1280;
/** How long between the pictures of the step check (ms). */
const BETWEEN = 300;

const SPOTS = [
  { id: 'town', label: 'the start town, 32 km from zero', query: '' },
  // A shore on the ring 300 km out (seed masterworld): the sea to the west, land and trees behind.
  { id: 'far', label: 'a shore 300 km from zero', query: '&pos=52765,-295323&look=250,-6' },
];

const only = process.env.ORIGIN_ONLY?.split(',');
const spots = only ? SPOTS.filter((s) => only.includes(s.id)) : SPOTS;
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const commit = git('rev-parse --short HEAD') || 'nocommit';
const dirty = git('status --porcelain --untracked-files=no') ? '-dirty' : '';
const date = new Date().toISOString().slice(0, 10);
const dir = join(process.argv[2] ?? 'shots/origin', `${date}-${commit}${dirty}`);
mkdirSync(dir, { recursive: true });

/** Mean difference of two PNG pictures (0..255 per channel), and the share of pixels changed by more than 24. */
const difference = (page, a, b) => page.evaluate(async ([a, b]) => {
  const pixels = async (s) => {
    const bm = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height).getContext('2d');
    c.drawImage(bm, 0, 0);
    return c.getImageData(0, 0, bm.width, bm.height).data;
  };
  const A = await pixels(a), B = await pixels(b);
  let sum = 0, big = 0;
  for (let i = 0; i < A.length; i += 4) {
    const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3;
    sum += d;
    if (d > 24) big++;
  }
  const n = A.length / 4;
  return { mean: sum / n, changed: big / n };
}, [a.toString('base64'), b.toString('base64')]);

const builds = (page) => page.evaluate(() => { const s = window.shaders?.summary(); return s ? s.warmup + s.run : 0; });

const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const t0 = Date.now();
const rows = [];
let failed = false;

for (const spot of spots) for (const zero of [false, true]) {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => { failed = true; errors.push(`page error: ${e.message}`); });
  await page.goto(`${base}?${still}${spot.query}${zero ? '&origin=0' : ''}`);
  const ready = await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT }).then(() => true, () => false);
  if (!ready) { failed = true; errors.push('the page did not report ready'); }
  await page.addStyleTag({ content: '#loading{display:none!important}#hud{visibility:hidden!important}' });
  const missing = await drawnNear(page, 15000);
  await shadersQuiet(page, 4000);
  const name = `${spot.id}-${zero ? 'zero' : 'origin'}`;
  const row = { name, spot: spot.label, origin: !zero, missing, errors };
  if (!zero) Object.assign(row, await measureFrames(page, 2000));
  const a = await page.screenshot({ type: 'png', timeout: TIMEOUT });
  await page.screenshot({ path: join(dir, `${name}.jpg`), type: 'jpeg', quality: 92, timeout: TIMEOUT });
  row.at = await page.evaluate(() => { const o = window.game.origin.at, c = window.game.view.camera.position; return { origin: [o.x, o.z], camera: [Math.round(c.x), Math.round(c.y), Math.round(c.z)] }; });
  if (!zero) {
    await page.waitForTimeout(BETWEEN);
    const a2 = await page.screenshot({ type: 'png', timeout: TIMEOUT });
    const before = await builds(page);
    await page.evaluate((grain) => { const g = window.game; g.followOrigin = false; g.origin.moveTo(g.origin.at.x + grain, g.origin.at.z); }, GRAIN);
    await page.waitForTimeout(BETWEEN);
    const b = await page.screenshot({ type: 'png', timeout: TIMEOUT });
    await page.screenshot({ path: join(dir, `${spot.id}-stepped.jpg`), type: 'jpeg', quality: 92, timeout: TIMEOUT });
    const moment = await difference(page, a, a2), step = await difference(page, a2, b);
    row.step = { moment, step, builds: (await builds(page)) - before };
    // The step may change no more than a moment of the world going on by itself (with a little slack for noise).
    row.step.ok = row.step.builds === 0 && step.mean <= moment.mean * 2 + 0.5 && step.changed <= moment.changed * 2 + 0.002;
    if (!row.step.ok) failed = true;
  }
  row.shaders = await page.evaluate(() => { const m = window.shaders; return m ? { ...m.summary(), lines: m.violations() } : null; });
  if (row.shaders?.violations) failed = true;
  rows.push(row);
  console.log(`${name}: ${row.p50 ? `p50 ${row.p50.toFixed(1)} ms · p95 ${row.p95.toFixed(1)} ms · ` : ''}${row.step ? `step ${row.step.ok ? 'ok' : 'SHOWS'} (moment ${row.step.moment.mean.toFixed(2)}, step ${row.step.step.mean.toFixed(2)}, ${row.step.builds} builds) · ` : ''}${row.shaders ? `${row.shaders.violations} shader violations` : 'no shader monitor'}${errors.length ? ` · ${errors.length} errors` : ''}`);
  await context.close();
}
await browser.close();
await server.close();

const seconds = (Date.now() - t0) / 1000;
writeFileSync(join(dir, 'index.json'), JSON.stringify({ commit: git('rev-parse HEAD'), dirty: !!dirty, date, gl, seconds, rows }, null, 2));
const f = (v, d = 1) => (v === undefined ? '–' : v.toFixed(d));
const md = [
  `# Floating origin check ${date} · ${commit}${dirty}`,
  '',
  `${gl ? 'WebGL 2' : 'WebGPU'} · 1920×1080 · run took ${seconds.toFixed(0)} s. Each spot drawn with the origin and without it (\`origin=0\`); the step: pictures ${BETWEEN} ms apart, then the origin moved ${GRAIN} m (mean difference 0..255, share of pixels changed by more than 24).`,
  '',
  '| Picture | Camera | Origin | p50 ms | p95 ms | Step: moment / step | Step builds | Notes |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| [${r.name}](${r.name}.jpg)${r.step ? ` · [stepped](${r.name.split('-')[0]}-stepped.jpg)` : ''} | ${r.at.camera.join(', ')} | ${r.origin ? r.at.origin.join(', ') : 'off'} | ${f(r.p50)} | ${f(r.p95)} | ${r.step ? `${f(r.step.moment.mean, 2)} (${f(r.step.moment.changed * 100, 2)} %) / ${f(r.step.step.mean, 2)} (${f(r.step.step.changed * 100, 2)} %) ${r.step.ok ? 'ok' : 'SHOWS'}` : '–'} | ${r.step ? r.step.builds : '–'} | ${[r.shaders ? `${r.shaders.violations} shader violations` : 'no monitor', ...r.errors].join('; ')} |`),
  '',
].join('\n');
writeFileSync(join(dir, 'index.md'), md);
console.log(`${rows.length} pictures in ${dir} (${seconds.toFixed(0)} s)${seconds > 300 ? ' · over the 5 min slow-check limit' : ''}`);
process.exit(failed ? 1 : 0);
