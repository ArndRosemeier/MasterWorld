// Gate B: frame times with vsync on (headed window, no frame-cap switches), 10 s standing + 10 s walking per scene.
// Run from the worktree root: SHOT_GPU=1 node <this file>
import { launch } from 'file:///C:/Projekte/MasterWorld-gateb/tools/shot/launch.mjs';
import { drawnNear, shadersQuiet } from 'file:///C:/Projekte/MasterWorld-gateb/tools/shot/wait.mjs';

const MS = 10000;
const turn = (hour, kind) => (page) => page.evaluate(([hour, kind]) => {
  const g = window.game, now = g.view.sky.day * 24 + g.view.sky.hour;
  g.view.sky.hour = hour; g.weather.cancel(now); g.weather.order({ kind, from: -1e6, to: 1e6 });
}, [hour, kind]);
const Q='title=0&day=0&hour=12&weather=clear';
const SESSIONS = [
  { query: Q, scenes: [{ name: 'town-noon' }] },
  { query: Q, scenes: [{ name: 'town-dusk', act: turn(18.3, 'fair') }] },
  { query: Q, scenes: [{ name: 'town-night', act: turn(23, 'clear') }] },
  { query: Q, scenes: [{ name: 'town-rain', act: turn(14, 'rain') }] },
  { query: 'title=0&day=0&hour=16&weather=fair&site=village', scenes: [{ name: 'village' }] },
];
const frames = (page, ms) => page.evaluate((ms) => new Promise((done) => {
  const dts = []; let last = performance.now(); const t0 = last;
  const step = (now) => { dts.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(step); else {
    dts.sort((a, b) => a - b); const n = dts.length, q = (p) => dts[Math.min(n - 1, Math.floor(n * p))];
    done({ frames: n, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: dts[n - 1], over25: dts.filter((d) => d > 25).length });
  } };
  requestAnimationFrame(step);
}), ms);

const { server, base, browser } = await launch({ headed: true });
const out = [];
for (const s of SESSIONS) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  await page.goto(`${base}?${s.query}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 120000 });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  const backend = await page.evaluate(() => window.game?.view?.backend ?? '');
  const home = await page.evaluate(() => { const p = window.game.player.walker.pos; return { x: p.x, z: p.z }; });
  for (const sc of s.scenes) {
    if (sc.act) await sc.act(page);
    await drawnNear(page, 15000); await shadersQuiet(page, 4000);
    const stand = await frames(page, MS);
    await page.keyboard.down('KeyW');
    const walk = await frames(page, MS);
    await page.keyboard.up('KeyW');
    const r = { scene: sc.name, backend, stand, walk, errors: [...errors] };
    out.push(r);
    const f = (m) => `p50 ${m.p50.toFixed(1)} p95 ${m.p95.toFixed(1)} p99 ${m.p99.toFixed(1)} max ${m.max.toFixed(1)} (${m.frames} fr, ${m.over25} >25ms)`;
    console.log(`${sc.name} [${backend}] stand: ${f(stand)} | walk: ${f(walk)}${errors.length ? ` | ${errors.length} errors` : ''}`);
  }
  await context.close();
}
console.log('JSON ' + JSON.stringify(out));
await browser.close(); await server.close(); process.exit(0);
