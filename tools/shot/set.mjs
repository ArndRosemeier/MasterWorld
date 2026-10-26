/**
 * The standard shot set (implementation plan F1, F2): `node tools/shot/set.mjs [out root]` after `npm run build`,
 * with SHOT_GPU=1 on the reference machine (RTX 5070, webgl2, 1080p). Takes the same pictures every time (the
 * title, the creator, the town at noon, dusk, night and in rain, a cellar, a barrow, the wild, a fight, the pack,
 * the map, talk) as JPEGs into one folder per commit, `<out root>/<date>-<commit>/` (default root `shots/set`), and
 * writes `index.md` and `index.json` there. Before each shot it waits until everything near the hero is drawn
 * as itself (`game.undrawn` empty: townsfolk dressed, creatures warm; at most SET_DRAWN ms, default 6000) and
 * then until no shader was built for 1.5 s (at most SET_SETTLE ms, default 4000). Per shot the index has the
 * frame time (median and 95th percentile over SET_MEASURE ms, default 2000, no frame cap), the shader summary
 * (F3), the page's errors and what was not drawn; it marks a shot over 16.7 ms or more than twice as slow as
 * the town at noon (F2). A slow check (docs/CHECKS.md): one run must stay under 5 min.
 * SET_ONLY=town,land takes only those sessions; SET_GL=0 draws with WebGPU instead of WebGL 2.
 * Exits 1 when a page failed or a shot breaks F2 or F3 (what was still waiting to be drawn is noted).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = 120000;
const SETTLE = Number(process.env.SET_SETTLE ?? 4000);
const MEASURE = Number(process.env.SET_MEASURE ?? 2000);
const BUDGET = 16.7, AIM = 12;
const gl = process.env.SET_GL !== '0';
// The clock stands still and the hud is off the picture (frame times are taken here, not read off it).
const still = `title=0&day=0${gl ? '&gl' : ''}`;

/** Another time and weather on the loaded page (the hour on the sky, a VGM order over all others). */
const turn = (hour, kind) => (page) => page.evaluate(([hour, kind]) => {
  const g = window.game, now = g.view.sky.day * 24 + g.view.sky.hour;
  g.view.sky.hour = hour;
  g.weather.cancel(now);
  g.weather.order({ kind, from: -1e6, to: 1e6 });
}, [hour, kind]);
/** The hero a few metres from a group of the wild (`kind`), facing it, once it is built near them. */
const meet = (kind, d) => async (page) => {
  await page.evaluate((kind) => {
    const g = window.game, t = g.wild.territories.find((t) => t.def.id === kind);
    g.player.teleport(t.x + t.r + 20, undefined, t.z, Math.PI / 2);
  }, kind);
  await page.waitForFunction((kind) => !!window.game.wild.sight(kind), kind, { timeout: TIMEOUT });
  await page.evaluate(([kind, d]) => {
    const g = window.game, seen = g.wild.sight(kind), p = g.player.walker.pos;
    const l = Math.max(1, Math.hypot(p.x - seen.x, p.z - seen.z)), x = seen.x + (p.x - seen.x) / l * d, z = seen.z + (p.z - seen.z) / l * d;
    g.player.teleport(x, undefined, z, Math.atan2(x - seen.x, z - seen.z));
  }, [kind, d]);
};
const close = async (page) => { await page.keyboard.press('Escape'); await page.waitForTimeout(600); };

/**
 * The sessions: one page load each (loads are most of the run's time), then its shots in order. A shot's
 * `act` runs before it settles; `first` runs once the page is loaded, before waiting for it to be ready.
 */
const SESSIONS = [
  // The title, then New game: the dive lands by the hero and the creator opens (one load for both).
  { id: 'title', query: `title&day=0${gl ? '&gl' : ''}`, first: async (page) => {
    await page.waitForSelector('.t-gate', { timeout: TIMEOUT });
    await page.keyboard.press('Space'); // the title waits for a first press (sound needs one)
  }, shots: [
    { name: 'title' },
    { name: 'creator', act: async (p) => {
      await p.evaluate(() => document.querySelector('.t-btn.primary:not([hidden])').click());
      await p.waitForSelector('.creator.open', { timeout: TIMEOUT });
      await turn(11, 'clear')(p);
      await p.waitForTimeout(1500); // the camera comes round to the hero's front
    } },
  ] },
  { id: 'town', query: `${still}&hour=12&weather=clear`, shots: [
    { name: 'town-noon' },
    { name: 'pack', act: (p) => p.keyboard.press('KeyI') },
    { name: 'map', act: async (p) => { await close(p); await p.keyboard.press('KeyM'); } },
    { name: 'town-dusk', act: async (p) => { await close(p); await turn(18.3, 'fair')(p); } },
    { name: 'town-night', act: turn(23, 'clear') },
    { name: 'town-rain', act: turn(14, 'rain') },
  ] },
  { id: 'cellar', query: `${still}&hour=12&cellar=2`, shots: [{ name: 'cellar' }] },
  // Out on the land: the barrow, then the hero is moved to the deer and the wolves (a load is the dearest part).
  { id: 'land', query: `${still}&hour=10&weather=fair&barrow`, shots: [
    { name: 'barrow' },
    { name: 'wild', act: meet('deer', 25) },
    { name: 'fight', act: async (p) => { await meet('wolves', 12)(p); await p.waitForTimeout(1500); await p.keyboard.press('Tab'); await p.keyboard.press('Digit1'); } },
  ] },
  { id: 'talk', query: `${still}&hour=20&talk=inn&topics=news`, shots: [{ name: 'talk' }] },
];

const only = process.env.SET_ONLY?.split(',');
const sessions = only ? SESSIONS.filter((s) => only.includes(s.id)) : SESSIONS;
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const commit = git('rev-parse --short HEAD') || 'nocommit';
const dirty = git('status --porcelain --untracked-files=no') ? '-dirty' : '';
const date = new Date().toISOString().slice(0, 10);
const dir = join(process.argv[2] ?? 'shots/set', `${date}-${commit}${dirty}`);
mkdirSync(dir, { recursive: true });

// No frame cap: with vsync a GPU frame shows as the screen's 16.7 ms however little it costs.
const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const t0 = Date.now();
const rows = [];
let failed = false, gpuName = '';

/**
 * Waits until everything near the hero is drawn as itself (`game.undrawn` empty: no townsfolk still plain
 * figures, no creatures still warming), at most DRAWN ms; returns what is still waiting.
 */
const DRAWN = Number(process.env.SET_DRAWN ?? 6000);
const drawn = (page) => page.waitForFunction(() => !window.game || window.game.undrawn.length === 0, null, { timeout: DRAWN, polling: 200 })
  .then(() => [], () => page.evaluate(() => window.game.undrawn));

/**
 * Waits until no shader was built for 1.5 s (the scene is warm: what is still warming up is not its frame
 * time), at least 1.5 s and at most SETTLE; returns how long that took (s).
 */
const quiet = (page) => page.evaluate(([most]) => new Promise((done) => {
  const built = () => { const s = window.shaders?.summary(); return s ? s.warmup + s.run : 0; };
  const t0 = performance.now();
  let n = built(), since = t0;
  const id = setInterval(() => {
    const now = performance.now(), m = built();
    if (m !== n) { n = m; since = now; }
    if (now - since >= 1500 || now - t0 >= most) { clearInterval(id); done((now - t0) / 1000); }
  }, 100);
}), [SETTLE]);

/** Frame intervals over `ms` (requestAnimationFrame), sorted: median, 95th percentile, mean. */
const measure = (page) => page.evaluate((ms) => new Promise((done) => {
  const dts = [];
  let last = performance.now();
  const t0 = last;
  const step = (now) => {
    dts.push(now - last); last = now;
    if (now - t0 < ms) return requestAnimationFrame(step);
    dts.sort((a, b) => a - b);
    const n = dts.length;
    done({ frames: n, p50: dts[n >> 1], p95: dts[Math.floor(n * 0.95)], mean: dts.reduce((a, b) => a + b, 0) / n });
  };
  requestAnimationFrame(step);
}), MEASURE);

for (const s of sessions) {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); // its own, as a player's first visit
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => { failed = true; errors.push(`page error: ${e.message}`); });
  const started = Date.now();
  await page.goto(`${base}?${s.query}`);
  if (s.first) await s.first(page);
  const ready = await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT }).then(() => true, () => false);
  if (!ready) { failed = true; errors.push('the page did not report ready'); }
  const loadS = (Date.now() - started) / 1000;
  console.log(`${s.id}: ready in ${loadS.toFixed(1)} s`);
  await page.addStyleTag({ content: '#loading{display:none!important}#hud{visibility:hidden!important}' });
  if (!gpuName) gpuName = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const ext = c?.getExtension('WEBGL_debug_renderer_info');
    return (ext && c.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || '';
  });
  for (const shot of s.shots) {
    if (shot.act) await shot.act(page);
    const d0 = Date.now(), missing = await drawn(page), drawnS = (Date.now() - d0) / 1000;
    const settled = await quiet(page);
    const ft = await measure(page);
    const file = `${String(rows.length + 1).padStart(2, '0')}-${shot.name}.jpg`;
    await page.screenshot({ path: join(dir, file), type: 'jpeg', quality: 92, timeout: TIMEOUT });
    const sh = await page.evaluate(() => {
      const m = window.shaders;
      return m ? { ...m.summary(), lines: m.violations() } : null;
    });
    const backend = (await page.evaluate(() => window.game?.view?.backend ?? '')) || '';
    rows.push({ name: shot.name, file, query: s.query, loadS, drawnS, settledS: settled, missing, backend, ...ft, shaders: sh, errors: [...errors] });
    console.log(`${file}: drawn ${drawnS.toFixed(1)} s · settled ${settled.toFixed(1)} s · p50 ${ft.p50.toFixed(1)} ms · p95 ${ft.p95.toFixed(1)} ms · ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}${errors.length ? ` · ${errors.length} errors` : ''}${missing.length ? ` · not drawn: ${missing.join(', ')}` : ''}`);
    errors.length = 0;
  }
  await context.close();
}
await browser.close();
await server.close();

// F2: under 16.7 ms everywhere (aim 12), none more than twice the town at noon; F3: no shader violations.
const noon = rows.find((r) => r.name === 'town-noon')?.p50;
for (const r of rows) {
  r.marks = [];
  if (r.p50 > BUDGET) r.marks.push(`over ${BUDGET} ms`);
  else if (r.p50 > AIM) r.marks.push(`over the ${AIM} ms aim`);
  if (noon && r.p50 > 2 * noon) r.marks.push('over twice the town at noon');
  if (!r.shaders) r.marks.push('no shader monitor');
  else if (r.shaders.violations) r.marks.push(`${r.shaders.violations} shader violations`);
  if (r.errors.length) r.marks.push(`${r.errors.length} page errors`);
  // A note, not a failure: plain figures are counted in the camera's view, also those behind a wall.
  if (r.missing.length) r.marks.push(`still waiting to be drawn: ${r.missing.join(', ')}`);
  if (r.marks.some((m) => !m.startsWith('over the') && !m.startsWith('still waiting'))) failed = true;
}
const seconds = (Date.now() - t0) / 1000;
const meta = { commit: git('rev-parse HEAD'), dirty: !!dirty, date, gpu: gpuName, gl, viewport: '1920x1080', settleMs: SETTLE, measureMs: MEASURE, seconds };
writeFileSync(join(dir, 'index.json'), JSON.stringify({ ...meta, shots: rows }, null, 2));
const md = [
  `# Standard shots ${date} · ${commit}${dirty}`,
  '',
  `${gpuName || 'unknown GPU'} · ${gl ? 'WebGL 2' : 'WebGPU'} · 1920×1080 · frame times over ${MEASURE / 1000} s once no shader was built for 1.5 s (at most ${SETTLE / 1000} s), no frame cap · run took ${seconds.toFixed(0)} s`,
  '',
  '| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| [${r.name}](${r.file}) | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.settledS.toFixed(1)} | ${r.shaders ? `${r.shaders.warmup} + ${r.shaders.run}, ${r.shaders.worstMs.toFixed(0)} ms` : '–'} | ${r.marks.join('; ') || 'ok'} |`),
  '',
  ...rows.filter((r) => r.errors.length || r.shaders?.lines.length).flatMap((r) => [`## ${r.name}`, '', ...[...(r.shaders?.lines ?? []), ...r.errors].map((l) => `- ${l}`), '']),
].join('\n');
writeFileSync(join(dir, 'index.md'), md);
console.log(`${rows.length} shots in ${dir} (${seconds.toFixed(0)} s)${seconds > 300 ? ' · over the 5 min slow-check limit' : ''}`);
process.exit(failed ? 1 : 0);
