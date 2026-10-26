/**
 * Where a scene's frame time goes (a slow check, run by hand on the reference GPU): `node tools/shot/probe.mjs
 * "<query>"` after `npm run build`, with SHOT_GPU=1. Loads the page once, lets it settle, then measures the frame
 * interval and the main thread's time in `renderer.render` with everything drawn, and again with each big part of
 * the scene hidden in turn (each top-level object of the scene, the sun's shadow map, the post chain), and prints
 * a table: what a part costs is how much the frame drops without it. Also the draw calls, the shaders built
 * after warm-up (and what they were), and the same for `PROBE_TURNS` (e.g. `23:clear,14:rain`: hour and weather).
 * Each row is measured between two runs with everything drawn (the frame time drifts), and a CPU profile of the main
 * thread follows (self time by script and function; PROBE_PROFILE=0 skips it; build with `npx vite build --minify
 * false` for readable names). PROBE_MEASURE=<ms> per measurement (default 2000).
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

/** Main-thread CPU profile over a few seconds: self time by function, and by script. */
async function profile() {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await page.waitForTimeout(3000);
  const { profile: prof } = await cdp.send('Profiler.stop');
  const dt = new Map();
  for (let i = 0; i < prof.samples.length; i++) dt.set(prof.samples[i], (dt.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0) / 1000);
  const total = [...dt.values()].reduce((a, b) => a + b, 0);
  const byFn = new Map(), byFile = new Map();
  for (const n of prof.nodes) {
    const t = dt.get(n.id) ?? 0;
    if (!t) continue;
    const f = n.callFrame, file = (f.url.split('/').pop() || '(native)').replace(/-[\w-]{8}\.js$/, '.js');
    const k = `${f.functionName || '(anonymous)'} ${file}:${f.lineNumber + 1}:${f.columnNumber + 1}`;
    byFn.set(k, (byFn.get(k) ?? 0) + t);
    byFile.set(file, (byFile.get(file) ?? 0) + t);
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `| ${k} | ${t.toFixed(0)} | ${(100 * t / total).toFixed(1)} |`).join('\n');
  console.log(`\nCPU profile, 3 s (${total.toFixed(0)} ms sampled):\n\n| script | ms | % |\n|---|---|---|\n${top(byFile, 12)}\n\n| function (self time) | ms | % |\n|---|---|---|\n${top(byFn, 45)}`);
  await cdp.detach();
}

async function probe(title) {
  console.log(`\n## ${title}\n\nsettled in ${(await quiet()).toFixed(1)} s\n`);
  const list = await parts();
  console.log('| part | objects | meshes | casters | skinned | triangles |\n|---|---|---|---|---|---|');
  for (const p of list) console.log(`| ${p.name} | ${p.n} | ${p.meshes} | ${p.casters} | ${p.skinned} | ${p.tris} |`);
  console.log('\n| drawn | p50 ms | p95 ms | render ms (main thread) | draw calls | shaders built | saves ms (vs the runs next to it) |\n|---|---|---|---|---|---|---|');
  // The frame time drifts: each row is measured between two runs with everything, and compared with their mean.
  let before = await measure();
  row('everything', before);
  const paired = async (label, off, on) => {
    await page.evaluate(off);
    const m = await measure();
    await page.evaluate(on);
    const after = await measure();
    row(label, m, { p50: (before.p50 + after.p50) / 2 });
    before = after;
  };
  const restore = () => { for (const o of window.game.view.scene.children) if (o.userData.probeWas !== undefined) { o.visible = o.userData.probeWas; delete o.userData.probeWas; } };
  for (const { name } of list) {
    await page.evaluate((name) => { window.__hide = name; }, name);
    await paired(`without ${name}`, () => { for (const o of window.game.view.scene.children) if ((o.name || o.type).replace(/ [-\d:]+$/, '') === window.__hide) { o.userData.probeWas = o.visible; o.visible = false; } }, restore);
  }
  await paired('without sun shadow redraw', () => { window.__every = window.game.view.sky.shadowEvery; window.game.view.sky.shadowEvery = 1e9; }, () => { window.game.view.sky.shadowEvery = window.__every; });
  await paired('nothing (empty scene, post chain only)', () => { for (const o of window.game.view.scene.children) if (o.isMesh || o.isGroup || o.isInstancedMesh) { o.userData.probeWas = o.visible; o.visible = false; } }, restore);
  if (process.env.PROBE_PROFILE !== '0') await profile();
  console.log('\nshaders:\n```\n' + await page.evaluate(() => window.shaders.report()) + '\n```');
  const after = await page.evaluate(() => {
    const by = new Map();
    for (const e of window.shaders.events) if (e.phase === 'run' && (e.kind === 'node-sync' || e.kind === 'node-async')) by.set(e.what, (by.get(e.what) ?? 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1]).slice(0, 40);
  });
  console.log('\nbuilt after warm-up, by what:\n' + after.map(([w, n]) => `- ${n}× ${w}`).join('\n'));
  // Around each policy breach: the shader events just before it (kind, start, ms, what).
  const near = await page.evaluate(() => {
    const ev = window.shaders.events.filter((e) => e.phase === 'run');
    const starts = ev.filter((e) => e.kind === 'node-sync' || e.kind === 'node-async');
    const out = [];
    for (let i = 1; i < starts.length; i++) {
      const a = starts[i - 1], b = starts[i];
      if (b.t >= a.t + a.ms * 3 - 1) continue;
      out.push(ev.filter((e) => e.t >= a.t - 50 && e.t <= b.t + b.ms + 5).map((e) => `${e.kind} t=${e.t.toFixed(1)} ${e.ms.toFixed(1)} ms ${e.what}`).join('\n'));
    }
    return out;
  });
  if (near.length) console.log('\nevents around breaches:\n```\n' + near.join('\n---\n') + '\n```');
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
