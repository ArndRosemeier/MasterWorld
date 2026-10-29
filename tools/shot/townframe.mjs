/**
 * What the town's frame costs, part by part (a slow check, run by hand on a machine with a GPU): `SHOT_GPU=1 node
 * tools/shot/townframe.mjs` after `npm run build` (SET_GL=1 for WebGL 2). It loads the town as the shot set does
 * (1920×1080, no frame cap), and at noon, dusk and in rain measures the frame (p50, p95), the main thread's time in
 * `renderer.render` and the draw calls; then the same with each top-level part of the scene hidden in turn, and with
 * no mesh casting a shadow (the shadow pass left empty; no shader is built for either). What a part's hiding saves
 * is what it costs.
 */
import { launch } from './launch.mjs';
import { drawnNear, measureFrames, shadersQuiet } from './wait.mjs';

const MEASURE = Number(process.env.TF_MEASURE ?? 2000);
const gl = process.env.SET_GL === '1';
const turn = (page, hour, kind) => page.evaluate(([hour, kind]) => {
  const g = window.game, now = g.view.sky.day * 24 + g.view.sky.hour;
  g.view.sky.hour = hour;
  g.weather.cancel(now);
  g.weather.order({ kind, from: -1e6, to: 1e6 });
}, [hour, kind]);

const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(`${base}?title=0&day=0&hour=12&weather=clear${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 180000 });
await page.addStyleTag({ content: '#loading{display:none!important}#hud{visibility:hidden!important}' });
await drawnNear(page, 15000);
await shadersQuiet(page, 6000);

// The main thread's time in render and the draw calls, per frame, while the frames are measured.
await page.evaluate(() => {
  const r = window.game.view.renderer, f = r.render;
  window.__tf = { ms: 0, calls: 0, renders: 0 };
  r.render = function (...a) {
    const t = performance.now();
    try { return f.apply(this, a); } finally {
      const tf = window.__tf; tf.ms += performance.now() - t; tf.renders++;
      tf.calls += r.info?.render?.drawCalls ?? r.info?.render?.calls ?? 0;
    }
  };
});
const measure = async () => {
  await page.evaluate(() => { window.__tf.ms = 0; window.__tf.calls = 0; window.__tf.renders = 0; });
  const ft = await measureFrames(page, MEASURE);
  const tf = await page.evaluate(() => window.__tf);
  return { p50: ft.p50, p95: ft.p95, renderMs: tf.ms / ft.frames, calls: tf.calls / ft.frames };
};
// The scene's parts: its children, and a big child's children instead (the floating origin's root holds most).
const parts = await page.evaluate(() => {
  const count = (c) => { let n = 0; c.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) n++; }); return n; };
  const out = [];
  const visit = (c, path, depth) => {
    const n = count(c);
    if (!c.visible || n === 0) return;
    if (depth < 3 && n > 150 && c.children.length > 1) c.children.forEach((k, i) => visit(k, [...path, i], depth + 1));
    else out.push({ path, name: c.name || c.type, meshes: n });
  };
  window.game.view.scene.children.forEach((c, i) => visit(c, [i], 0));
  window.__at = (path) => path.reduce((o, i) => o.children[i], window.game.view.scene);
  return out;
});
const row = (name, m, base) => console.log(`${name.padEnd(28)} p50 ${m.p50.toFixed(1).padStart(5)} · p95 ${m.p95.toFixed(1).padStart(5)} · render ${m.renderMs.toFixed(1).padStart(5)} ms · ${m.calls.toFixed(0).padStart(5)} calls${base ? ` · saves ${(base.p50 - m.p50).toFixed(1)} ms` : ''}`);

for (const [label, hour, kind] of [['noon', 12, 'clear'], ['dusk', 18.3, 'fair'], ['rain', 14, 'rain']]) {
  await turn(page, hour, kind);
  await shadersQuiet(page, 6000);
  const all = await measure();
  console.log(`\n== ${label}`);
  row('everything', all);
  for (const p of parts) {
    await page.evaluate((i) => { window.__at(i).visible = false; }, p.path);
    await page.waitForTimeout(300);
    row(`- ${p.name} (${p.meshes})`, await measure(), all);
    await page.evaluate((i) => { window.__at(i).visible = true; }, p.path);
  }
  await page.evaluate(() => {
    window.__casters = [];
    window.game.view.scene.traverse((o) => { if (o.castShadow && !o.isLight) { o.castShadow = false; window.__casters.push(o); } });
  });
  await page.waitForTimeout(300);
  row('- shadow casters', await measure(), all);
  await page.evaluate(() => { for (const o of window.__casters) o.castShadow = true; });
}
await browser.close();
await server.close();
