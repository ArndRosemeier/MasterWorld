/**
 * Where the town's frame goes (a slow check, run by hand on a machine with a GPU): `SHOT_GPU=1 node
 * tools/shot/townframe.mjs` after `npm run build` (SET_GL=1 for WebGL 2). It loads the town as the shot set does
 * (1920×1080, no frame cap) and at noon, dusk and in rain counts, over TF_FRAMES frames, the draws per frame: by
 * render call (which camera and target), by pass (the view or a shadow map), and by the part of the scene they belong
 * to (its top-level group, a big group's children instead), and how many distinct objects make them. Counts do not
 * drift as timings do; the frame time (p50, p95) and the main thread's time in `renderer.render` are given beside.
 */
import { launch } from './launch.mjs';
import { drawnNear, measureFrames, shadersQuiet } from './wait.mjs';

const FRAMES = Number(process.env.TF_FRAMES ?? 120);
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

// Tally every draw while `window.__tf.on`: by render call, by pass, by part of the scene.
await page.evaluate(() => {
  const g = window.game, r = g.view.renderer, scene = g.view.scene;
  const tf = (window.__tf = { on: false, ms: 0, renders: new Map(), passes: new Map(), parts: new Map(), objects: new Set(), call: '' });
  const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
  const nameOf = (o) => o.name || o.type;
  // The part an object belongs to: the scene's child, or a big child's child (the origin's root holds most).
  const count = (c) => { let n = 0; c.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) n++; }); return n; };
  const big = new WeakMap();
  const isBig = (o) => { if (!big.has(o)) big.set(o, count(o) > 150 && o.children.length > 1); return big.get(o); };
  const partOf = (o) => {
    const chain = [];
    for (let q = o; q && q !== scene; q = q.parent) chain.unshift(q);
    if (!chain.length) return '(not in the scene)';
    let i = 0;
    while (i < 2 && i + 1 < chain.length && isBig(chain[i]) && chain[i + 1].children.length > 0) i++;
    return chain.slice(0, i + 1).map(nameOf).join('/');
  };
  const render = r.render;
  r.render = function (s, cam, ...a) {
    const t = performance.now();
    const target = r.getRenderTarget?.();
    tf.call = `${nameOf(s)} · ${cam.isOrthographicCamera ? 'ortho' : 'persp'} ${nameOf(cam)}${target ? ' → target' : ''}`;
    try { return render.call(this, s, cam, ...a); } finally { if (tf.on) { tf.ms += performance.now() - t; bump(tf.renders, tf.call + ' (calls)'); } }
  };
  const direct = r._renderObjectDirect;
  r._renderObjectDirect = function (object, material, sc, camera, ...a) {
    if (tf.on) {
      const shadow = !!camera.isOrthographicCamera && camera !== g.view.camera;
      const pass = shadow ? 'shadow' : tf.call;
      bump(tf.renders, tf.call);
      bump(tf.passes, pass);
      bump(tf.parts, `${shadow ? '[shadow] ' : ''}${partOf(object)}`);
      tf.objects.add(object);
    }
    return direct.call(this, object, material, sc, camera, ...a);
  };
});

const section = async (label) => {
  await shadersQuiet(page, 6000);
  const ft = await measureFrames(page, 2000);
  const tf = await page.evaluate((frames) => new Promise((done) => {
    const tf = window.__tf;
    tf.ms = 0; tf.renders.clear(); tf.passes.clear(); tf.parts.clear(); tf.objects.clear(); tf.on = true;
    let n = 0;
    const step = () => {
      if (++n <= frames) return requestAnimationFrame(step);
      tf.on = false;
      const per = (m) => [...m].map(([k, v]) => [k, v / frames]).sort((a, b) => b[1] - a[1]);
      done({ ms: tf.ms / frames, objects: tf.objects.size, renders: per(tf.renders), passes: per(tf.passes), parts: per(tf.parts) });
    };
    requestAnimationFrame(step);
  }), FRAMES);
  const total = tf.passes.reduce((a, [, v]) => a + v, 0);
  console.log(`\n== ${label}: p50 ${ft.p50.toFixed(1)} ms · p95 ${ft.p95.toFixed(1)} ms · render ${tf.ms.toFixed(1)} ms/frame · ${total.toFixed(0)} draws/frame from ${tf.objects} objects`);
  console.log('render calls (draws per frame; "(calls)" = how often per frame):');
  for (const [k, v] of tf.renders) console.log(`  ${v.toFixed(1).padStart(8)}  ${k}`);
  console.log('passes:');
  for (const [k, v] of tf.passes) console.log(`  ${v.toFixed(1).padStart(8)}  ${k}`);
  console.log('parts (top 40):');
  for (const [k, v] of tf.parts.slice(0, 40)) console.log(`  ${v.toFixed(1).padStart(8)}  ${k}`);
};

for (const [label, hour, kind] of [['noon', 12, 'clear'], ['dusk', 18.3, 'fair'], ['rain', 14, 'rain']]) {
  await turn(page, hour, kind);
  await section(label);
}
await browser.close();
await server.close();
