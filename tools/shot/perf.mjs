/**
 * Frame-time probe (a slow check, run by hand on a machine with a GPU): `node tools/shot/perf.mjs "<query>" [scene...]`
 * after `npm run build`, with SHOT_GPU=1 (and SHOT_HEADED=1 for a real window, so the browser composites
 * as it does for a player). For each scene it lets the game settle, then measures the frame interval and
 * what the main thread spends on the game's big steps (wrapped through `window.game`), and prints a table.
 * Scenes: `plain` (nothing open), `pack`, `journal`, `map`, `settings` (that window open), `pack-noshade`
 * (open, the shade's dimming off), `pack-hidden` (open but not drawn: the paused game alone), `pack-flat`
 * (open, no shadow or translucency on the panel).
 */
import { launch } from './launch.mjs';

const SETTLE = Number(process.env.PERF_SETTLE ?? 3000);
const MEASURE = Number(process.env.PERF_MEASURE ?? 4000);
const [query = '?title=0&hour=12', ...asked] = process.argv.slice(2);
const scenes = asked.length ? asked : ['plain', 'pack', 'pack-noshade', 'pack-flat', 'pack-hidden', 'plain'];
const KEYS = { pack: 'KeyI', journal: 'KeyJ', map: 'KeyM', settings: 'Escape' };
const STYLE = {
  noshade: '.shade{background:none!important}',
  hidden: '.shade{visibility:hidden!important}',
  flat: '.panel{box-shadow:none!important;background:#121418!important}.panel *{animation:none!important;box-shadow:none!important}',
};

const { server, base, browser } = await launch({ headed: !!process.env.SHOT_HEADED });
const page = await browser.newPage({ viewport: { width: Number(process.env.PERF_W ?? 1600), height: Number(process.env.PERF_H ?? 900) } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + (query.startsWith('?') ? query : '?' + query));
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 300000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });
// Time the game's big steps on the main thread.
await page.evaluate(() => {
  const g = window.game, t = (window.__perf = new Map());
  const wrap = (name, obj, key) => {
    const f = obj?.[key];
    if (typeof f !== 'function') return;
    obj[key] = function (...a) { const s = performance.now(); try { return f.apply(this, a); } finally { t.set(name, (t.get(name) ?? 0) + performance.now() - s); } };
  };
  wrap('render', g.view.renderer, 'render');
  wrap('stage', g.view.stage, 'frame');
  wrap('sky', g.view.sky, 'update');
  wrap('sea', g.sea, 'update');
  wrap('ground', g.ground, 'update');
  wrap('life', g.towns, 'live');
  wrap('flora', g.flora, 'update');
  wrap('grass', g.grass, 'tend');
  wrap('weather', g.wx, 'apply');
  wrap('player', g.player, 'update');
  wrap('cellar', g.cellar, 'update');
  wrap('sounds', g.sounds, 'hearTick');
  wrap('folk', g.folk, 'follow');
  wrap('rooms', g.rooms, 'update');
});
const measure = () => page.evaluate((ms) => new Promise((done) => {
  const dts = [], t = window.__perf;
  t.clear();
  let last = performance.now();
  const t0 = last;
  const step = (now) => {
    dts.push(now - last); last = now;
    if (now - t0 < ms) requestAnimationFrame(step);
    else {
      dts.sort((a, b) => a - b);
      const n = dts.length, mean = dts.reduce((a, b) => a + b, 0) / n;
      done({ frames: n, mean, p50: dts[n >> 1], p95: dts[Math.floor(n * 0.95)], steps: Object.fromEntries([...t].map(([k, v]) => [k, v / n])) });
    }
  };
  requestAnimationFrame(step);
}), MEASURE);

const rows = [];
for (const scene of scenes) {
  const [win, style] = scene.split('-');
  const tag = style ? await page.addStyleTag({ content: STYLE[style] }) : null;
  if (KEYS[win]) await page.keyboard.press(KEYS[win]);
  await page.waitForTimeout(SETTLE);
  const r = await measure();
  rows.push({ scene, ...r });
  if (KEYS[win]) await page.keyboard.press('Escape');
  if (tag) await tag.evaluate((e) => e.remove());
  await page.waitForTimeout(500);
}
const hud = (await page.textContent('#hud'))?.split('\n')[0] ?? '';
console.log(`${query}  ${hud}`);
for (const r of rows) {
  const steps = Object.entries(r.steps).filter(([, v]) => v >= 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ');
  console.log(`${r.scene.padEnd(14)} ${r.frames} frames · mean ${r.mean.toFixed(1)} ms · p50 ${r.p50.toFixed(1)} · p95 ${r.p95.toFixed(1)} · main thread: ${steps}`);
}
await browser.close();
await server.close();
process.exit(0);
