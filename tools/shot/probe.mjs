/**
 * Where a scene's frame time goes (a slow check, run by hand on the reference GPU): `node tools/shot/probe.mjs
 * "<query>"` after `npm run build`, with SHOT_GPU=1. Loads the page once, lets it settle, then measures the frame
 * interval and the main thread's time in `renderer.render` with everything drawn, and again with each big part of
 * the scene hidden in turn (each top-level object of the scene, the sun's shadow map, the post chain), and prints
 * a table: what a part costs is how much the frame drops without it. Also the draw calls, the shaders built
 * after warm-up (and what they were), and the same for `PROBE_TURNS` (e.g. `23:clear,14:rain`: hour and weather).
 * PROBE_MEASURE=<ms> per measurement (default 2000).
 */
import { launch } from './launch.mjs';

const MEASURE = Number(process.env.PROBE_MEASURE ?? 2000);
const query = process.argv[2] ?? '?title=0&day=0&gl&hour=12&weather=clear';
const turns = (process.env.PROBE_TURNS ?? '').split(',').filter(Boolean).map((t) => { const [h, k] = t.split(':'); return { hour: Number(h), kind: k }; });

const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
await page.goto(base + (query.startsWith('?') ? query : '?' + query));
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: 300000 });
await page.addStyleTag({ content: '#loading{display:none!important}' });

// Wrap the render call: main-thread time and draw calls per frame (the post chain draws the scene once, then its passes).
await page.evaluate(() => {
  const g = window.game, r = g.view.renderer, P = (window.__probe = { render: 0, calls: 0, frames: 0, scene: 0 });
  const render = r.render;
  r.render = function (...a) {
    const s = performance.now();
    try { return render.apply(this, a); } finally {
      P.render += performance.now() - s;
      if (a[0] === g.view.scene) { P.scene++; P.calls += r.info.render.drawCalls; }
    }
  };
});

const quiet = () => page.evaluate(() => new Promise((done) => {
  const built = () => { const s = window.shaders?.summary(); return s ? s.warmup + s.run : 0; };
  const t0 = performance.now();
  let n = built(), since = t0;
  const id = setInterval(() => {
    const now = performance.now(), m = built();
    if (m !== n) { n = m; since = now; }
    if (now - since >= 1500 || now - t0 >= 15000) { clearInterval(id); done((now - t0) / 1000); }
  }, 100);
}));

const measure = () => page.evaluate((ms) => new Promise((done) => {
  const P = window.__probe, dts = [];
  P.render = 0; P.calls = 0; P.scene = 0;
  const b0 = window.shaders.summary().run;
  let last = performance.now();
  const t0 = last;
  const step = (now) => {
    dts.push(now - last); last = now;
    if (now - t0 < ms) return requestAnimationFrame(step);
    dts.sort((a, b) => a - b);
    const n = dts.length;
    done({ frames: n, p50: dts[n >> 1], p95: dts[Math.floor(n * 0.95)], render: P.render / n, calls: P.scene ? P.calls / P.scene : 0, built: window.shaders.summary().run - b0 });
  };
  requestAnimationFrame(step);
}), MEASURE);

/** The scene's top-level objects with something drawn under them. */
const parts = () => page.evaluate(() => {
  const g = window.game, out = [];
  g.view.scene.children.forEach((o, i) => {
    let meshes = 0, tris = 0, casters = 0, skinned = 0;
    o.traverse((m) => { if (m.isMesh) { meshes++; if (m.castShadow) casters++; if (m.isSkinnedMesh) skinned++; tris += (m.geometry.index?.count ?? m.geometry.attributes.position?.count ?? 0) / 3 * (m.isInstancedMesh ? m.count : 1); } });
    if (!meshes || !o.visible) return;
    // Parts of one kind (terrain chunks named by their tile, each townsperson) count together.
    const name = (o.name || o.type).replace(/ [-\d:]+$/, ''), e = out.find((x) => x.name === name);
    if (e) { e.n++; e.meshes += meshes; e.casters += casters; e.skinned += skinned; e.tris += Math.round(tris); }
    else out.push({ name, n: 1, meshes, casters, skinned, tris: Math.round(tris) });
  });
  return out;
});

const row = (label, m, base) => console.log(`| ${label} | ${m.p50.toFixed(1)} | ${m.p95.toFixed(1)} | ${m.render.toFixed(1)} | ${m.calls.toFixed(0)} | ${m.built} | ${base ? (base.p50 - m.p50).toFixed(1) : ''} |`);

async function probe(title) {
  console.log(`\n## ${title}\n\nsettled in ${(await quiet()).toFixed(1)} s\n`);
  const list = await parts();
  console.log('| part | objects | meshes | casters | skinned | triangles |\n|---|---|---|---|---|---|');
  for (const p of list) console.log(`| ${p.name} | ${p.n} | ${p.meshes} | ${p.casters} | ${p.skinned} | ${p.tris} |`);
  console.log('\n| drawn | p50 ms | p95 ms | render ms (main thread) | scene draw calls | shaders built | saves ms |\n|---|---|---|---|---|---|---|');
  const base = await measure();
  row('everything', base);
  for (const { name } of list) {
    await page.evaluate((name) => { for (const o of window.game.view.scene.children) if ((o.name || o.type).replace(/ [-\d:]+$/, '') === name) { o.userData.probeWas = o.visible; o.visible = false; } }, name);
    row(`without ${name}`, await measure(), base);
    await page.evaluate((name) => { for (const o of window.game.view.scene.children) if (o.userData.probeWas !== undefined) { o.visible = o.userData.probeWas; delete o.userData.probeWas; } }, name);
  }
  await page.evaluate(() => { const s = window.game.view.sun.shadow; s.autoUpdate = false; });
  row('without sun shadow redraw', await measure(), base);
  await page.evaluate(() => { const s = window.game.view.sun.shadow; s.autoUpdate = true; });
  // Everything but the sky: what the land itself costs.
  await page.evaluate(() => { for (const o of window.game.view.scene.children) if (o.isMesh || o.isGroup || o.isInstancedMesh) { o.userData.probeWas = o.visible; o.visible = false; } });
  row('nothing (empty scene, post chain only)', await measure(), base);
  await page.evaluate(() => { for (const o of window.game.view.scene.children) if (o.userData.probeWas !== undefined) { o.visible = o.userData.probeWas; delete o.userData.probeWas; } });
  console.log('\nshaders:\n```\n' + await page.evaluate(() => window.shaders.report()) + '\n```');
  const after = await page.evaluate(() => {
    const by = new Map();
    for (const e of window.shaders.events) if (e.phase === 'run' && (e.kind === 'node-sync' || e.kind === 'node-async')) by.set(e.what, (by.get(e.what) ?? 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 40);
  });
  console.log('\nbuilt after warm-up, by what:\n' + after.map(([w, n]) => `- ${n}× ${w}`).join('\n'));
}

await probe(`noon: ${query}`);
for (const t of turns) {
  await page.evaluate(([hour, kind]) => {
    const g = window.game, now = g.view.sky.day * 24 + g.view.sky.hour;
    g.view.sky.hour = hour;
    g.weather.cancel(now);
    g.weather.order({ kind, from: -1e6, to: 1e6 });
  }, [t.hour, t.kind]);
  await probe(`${t.hour} h, ${t.kind}`);
}
await browser.close();
server.httpServer.close();
process.exit(0);
