/**
 * The capital (C15, F2, F4): `node tools/shot/capital.mjs [out dir]` after `npm run build` (and `npm run packs`),
 * on the reference machine, muted (launch.mjs). One page, started well out before the capital (`site=capital`: the
 * walk out the VGM would open as the hero goes; `siteAt`: farther out than its people are made): the time until it
 * is playable (F4), then the hero comes in along the way to a gate at a gallop (the worst frame on the way: its
 * people made a few milliseconds a frame), a gate in the wall from outside, the market at noon with its frame time
 * (F2: under 16.7 ms, aiming for 12), the seat of rule, and at night the gate shut, then swinging open as the hero
 * comes up to it (rule 11: doors swing). JPEGs and `index.md` into
 * `<out dir>` (default `shots/capital/<date>-<commit>/`). Fails on a page error, no capital, a market frame
 * over 16.7 ms, a playable over 20 s or a shader violation (F3). A slow check (docs/CHECKS.md), under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { standClear } from './acts.mjs';
import { drawnNear, measureFrames, shadersQuiet } from './wait.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const BUDGET = 16.7, AIM = 12, READY = 20;
/** The hero starts this far outside the capital's edge (m), and comes in at this pace (m/s, a gallop). */
const FAR_OUT = 1150, PACE = 16;
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/capital', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

// No frame cap: with vsync a GPU frame shows as the screen's 16.7 ms however little it costs.
const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&site=capital&siteAt=${FAR_OUT}${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
const readyS = (Date.now() - t0) / 1000;
await page.addStyleTag({ content: '#loading{display:none!important}#hud{visibility:hidden!important}' });
const rows = [];
let failed = false;
const shoot = async (name, ft) => {
  const file = `${name}.jpg`;
  await page.screenshot({ path: join(dir, file), type: 'jpeg', quality: 92, timeout: TIMEOUT });
  rows.push({ name, file, ...ft });
  console.log(`${file}${ft ? `: p50 ${ft.p50.toFixed(1)} ms, p95 ${ft.p95.toFixed(1)} ms` : ''}`);
};
const settle = async () => { await drawnNear(page, 15000); await shadersQuiet(page, 4000); };

// The capital, once a worker has planned it (about a second).
const cap = await page.waitForFunction(() => {
  const t = window.game.towns.every.find((x) => x.town.decision.size === 'capital');
  if (!t) return null;
  const p = t.town.plan, m = p.market, n = m.length / 2;
  let x = 0, z = 0;
  for (let i = 0; i < m.length; i += 2) { x += m[i]; z += m[i + 1]; }
  const seat = p.buildings.find((b) => b.trade === 'ruler');
  return { id: t.town.decision.id, market: { x: x / n, z: z / n }, seat: seat && { x: seat.cx, z: seat.cz, r: Math.max(seat.hu, seat.hv) }, gates: p.wall?.gates ?? [], buildings: p.buildings.length, people: t.residents.length, living: t.living };
}, null, { timeout: TIMEOUT, polling: 500 }).then((h) => h.jsonValue(), () => null);
if (!cap) { console.log('no capital'); failed = true; }
else {
  console.log(`${cap.id}: ${cap.buildings} buildings, ${cap.people} people, ${cap.gates.length} gates; playable in ${readyS.toFixed(1)} s`);
  if (cap.living) console.log('its people were made before the hero came near (too near at the start?)');
  // The gate nearest the hero, and the way in to it along a straight line, at a gallop: the worst frames on the way.
  const g = await page.evaluate((gates) => {
    const p = window.game.player.walker.pos;
    return gates.reduce((b, x) => (Math.hypot(x.x - p.x, x.z - p.z) < Math.hypot(b.x - p.x, b.z - p.z) ? x : b));
  }, cap.gates);
  // What each frame of the ride spends its time on (the parts that can spike), to name what a slow frame did.
  await page.evaluate(() => {
    const g = window.game, S = (window.__span = {});
    const span = (o, name, label) => {
      const fn = o?.[name];
      if (typeof fn !== 'function') return;
      o[name] = function (...a) { const t = performance.now(); try { return fn.apply(this, a); } finally { S[label] = (S[label] ?? 0) + performance.now() - t; } };
    };
    span(g.flora, 'update', 'trees');
    span(g.grass, 'update', 'grass');
    span(g.ground, 'update', 'ground');
    span(g.towns, 'tick', 'towns tick');
    span(g.towns, 'live', 'town life');
    span(g.roads, 'follow', 'roads');
    span(g.sea, 'update', 'sea');
    span(g.view.sky, 'update', 'sky');
    span(g.view.sky.horizon, 'track', 'horizon');
    span(g.origin, 'follow', 'origin');
    span(g.folk, 'follow', 'folk');
    span(g.view.stage, 'frame', 'stage frame');
    span(g.view.stage, 'prepare', 'stage prepare');
    span(g.view.renderer, 'render', 'render');
  });
  // CAPITAL_PROFILE=1: a CPU profile of the ride's first seconds (where its slow frames bunch); build with
  // `npx vite build --minify false` for readable names.
  // CAPITAL_WAIT_MS: stand this long before riding (does the work still running behind play make the first frames slow?).
  if (process.env.CAPITAL_WAIT_MS) await page.waitForTimeout(Number(process.env.CAPITAL_WAIT_MS));
  const profiling = process.env.CAPITAL_PROFILE === '1' ? rideProfile(Number(process.env.CAPITAL_PROFILE_MS ?? 7000)) : null;
  const way = await page.evaluate(([g, m, pace]) => new Promise((done) => {
    const game = window.game, p = game.player, ux = Math.cos(g.angle), uz = Math.sin(g.angle), s = (g.x - m.x) * ux + (g.z - m.z) * uz > 0 ? 1 : -1;
    // To a point 34 m out before the gate, along its road's line.
    const tx = g.x + ux * s * 34, tz = g.z + uz * s * 34, from = { ...p.walker.pos }, L = Math.hypot(tx - from.x, tz - from.z);
    const town = game.towns.every.find((x) => x.town.decision.size === 'capital');
    let last = performance.now(), worst = 0, worstAt = 0, slow = 0, made = -1, gone = 0, n0 = window.shaders?.events.length ?? 0;
    const S = window.__span, frames = [], r = game.view.renderer, scene = game.view.scene;
    let seen = 0;
    // What the frame drew: draw calls, triangles, geometries held, and visible meshes under each part of the scene.
    const drawn = (all) => {
      const parts = {};
      // By the scene's parts, and a level down (the floating origin's root holds most of the world).
      const count = (o, key) => { if (!o.visible) return; if (o.isMesh) parts[key] = (parts[key] ?? 0) + 1; for (const c of o.children) count(c, key); };
      if (all) for (const c of scene.children) for (const cc of c.children.length ? c.children : [c]) count(cc, `${c.name || c.type}/${cc.name || cc.type}`);
      return { calls: r.info.render.drawCalls, tris: r.info.render.triangles, geos: r.info.memory.geometries, parts };
    };
    const step = (now) => {
      const dt = now - last; last = now;
      const ev = window.shaders?.events.slice(n0) ?? []; n0 += ev.length;
      if (gone > 0.5) {
        if (dt > worst) { worst = dt; worstAt = Math.round(L - gone); }
        const at = Math.round(L - gone);
        // Counting the meshes takes a moment of its own: only every 60th frame (a slow one gets the renderer's counts).
        const every = ++seen % 60 === 0;
        if (dt > 25 || every) frames.push({ dt, at, slow: dt > 25, spans: { ...S }, builds: ev.map((e) => `${e.kind} ${e.ms.toFixed(1)} ${e.what}`), ...drawn(every) });
        if (dt > 25) slow++;
      }
      for (const k in S) S[k] = 0;
      gone = Math.min(L, gone + (pace * Math.min(dt, 50)) / 1000);
      if (made < 0 && town?.living) made = Math.round(L - gone);
      const k = gone / L, x = from.x + (tx - from.x) * k, z = from.z + (tz - from.z) * k;
      p.teleport(x, undefined, z, Math.atan2(x - tx, z - tz));
      if (gone < L) requestAnimationFrame(step); else done({ worst, worstAt, slow, made, L: Math.round(L), frames });
    };
    requestAnimationFrame(step);
  }), [g, cap.market, PACE]);
  console.log(`the way in (${way.L} m at ${PACE} m/s): worst frame ${way.worst.toFixed(0)} ms ${way.worstAt} m from the gate, ${way.slow} frames over 25 ms; its people lived from ${way.made} m out`);
  // Where the slow frames fall (100 m bins, counted from the gate), and what the slowest spent their time on.
  const bins = {};
  const slowOnes = way.frames.filter((f) => f.slow);
  for (const f of slowOnes) { const b = Math.floor(f.at / 100) * 100; bins[b] = (bins[b] ?? 0) + 1; }
  console.log(`slow frames by distance from the gate: ${Object.entries(bins).sort((a, b) => b[0] - a[0]).map(([b, n]) => `${b}-${Number(b) + 100} m: ${n}`).join(', ')}`);
  // What was drawn along the way (every 60th frame and every slow one): draw calls, triangles, geometries, meshes by part.
  const row = (f) => `${f.at} m ${f.dt.toFixed(0)} ms${f.slow ? ' SLOW' : ''}: ${f.calls} calls, ${(f.tris / 1e6).toFixed(2)} M tris, ${f.geos} geometries; ${Object.entries(f.parts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', ')}`;
  console.log('drawn along the way:\n' + [...way.frames].sort((a, b) => b.at - a.at).map((f) => '  ' + row(f)).join('\n'));
  for (const f of [...slowOnes].sort((a, b) => b.dt - a.dt).slice(0, 10)) {
    const known = Object.values(f.spans).reduce((n, v) => n + v, 0);
    console.log(`  ${f.dt.toFixed(0)} ms at ${f.at} m (outside these: ${(f.dt - known).toFixed(0)}): ${Object.entries(f.spans).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', ')}${f.builds.length ? ' | ' + f.builds.join('; ') : ''}`);
  }
  rows.way = { ...way, frames: undefined };
  if (profiling) await profiling;
  // Before the gate, outside, looking back in through the gateway.
  await page.evaluate(([g, m]) => {
    const p = window.game.player, ux = Math.cos(g.angle), uz = Math.sin(g.angle), s = (g.x - m.x) * ux + (g.z - m.z) * uz > 0 ? 1 : -1;
    const x = g.x + ux * s * 34, z = g.z + uz * s * 34;
    p.teleport(x, undefined, z, Math.atan2(x - g.x, z - g.z));
    const cam = p.heroCam;
    cam.yaw = p.walker.yaw + 0.25;
    cam.pitch = 0.02;
    cam.zoom = 2.6;
  }, [g, cap.market]);
  await page.waitForTimeout(3000);
  await settle();
  await shoot('01-gate', await measureFrames(page, 2000));
  // Into the market: the worst frame on the way (its people built, its houses drawn).
  const walk = page.evaluate((ms) => new Promise((done) => {
    let last = performance.now(), worst = 0;
    const t0 = last, step = (now) => { worst = Math.max(worst, now - last); last = now; if (now - t0 < ms) requestAnimationFrame(step); else done(worst); };
    requestAnimationFrame(step);
  }), 8000);
  await page.evaluate((m) => { const s = window.game.player; s.teleport(m.x + 5, undefined, m.z + 4, 0.6); }, cap.market);
  const worst = await walk;
  console.log(`worst frame coming in: ${worst.toFixed(0)} ms`);
  await settle();
  const market = await measureFrames(page, 3000);
  await shoot('02-market', market);
  if (market.p50 > BUDGET) { console.log(`F2: the market is over ${BUDGET} ms`); failed = true; }
  // The seat of rule from its grounds.
  if (cap.seat) {
    await standClear(page, cap.seat, cap.seat.r + 16, { pitch: 0.06 });
    await page.waitForTimeout(2000);
    await settle();
    await shoot('03-seat', await measureFrames(page, 2000));
  }
  rows.worst = worst;
  // At night the gate is shut; it swings open as the hero comes up to it (rule 11).
  const gi = cap.gates.indexOf(cap.gates.find((x) => x.x === g.x && x.z === g.z));
  const before = (d) => page.evaluate(([g, m, d]) => {
    const p = window.game.player, ux = Math.cos(g.angle), uz = Math.sin(g.angle), s = (g.x - m.x) * ux + (g.z - m.z) * uz > 0 ? 1 : -1;
    const x = g.x + ux * s * d, z = g.z + uz * s * d;
    p.teleport(x, undefined, z, Math.atan2(x - g.x, z - g.z));
    Object.assign(p.heroCam, { yaw: p.walker.yaw + 0.2, pitch: 0.05, zoom: 2.6 });
  }, [g, cap.market, d]);
  const open = () => page.evaluate(([id, i]) => window.game.towns.gatesOf(id)?.[i] ?? -1, [cap.id, gi]);
  await page.evaluate(() => { window.game.view.sky.hour = 22.5; });
  await before(44);
  // The hour jumped: let the town's people get home first (one coming through holds the gate open).
  let shut = -1;
  for (let i = 0; i < 20 && (shut = await open()) !== 0; i++) await page.waitForTimeout(1000);
  await settle();
  shut = await open();
  await shoot('04-gate-night', await measureFrames(page, 1500));
  if (shut !== 0) { console.log(`the gate stands ${shut.toFixed(2)} open at night with nobody by it`); failed = true; }
  await before(14);
  await page.waitForTimeout(1300);
  const swinging = await open();
  await shoot('05-gate-opening');
  await page.waitForTimeout(2500);
  const wide = await open();
  await shoot('06-gate-open');
  console.log(`the gate at night: ${shut.toFixed(2)} with nobody by it, ${swinging.toFixed(2)} as the hero comes up, ${wide.toFixed(2)} once there`);
  if (!(swinging > 0) || wide !== 1) { console.log('the gate did not swing open for the hero'); failed = true; }
}
if (readyS > READY) { console.log(`F4: playable in ${readyS.toFixed(1)} s, over ${READY} s`); failed = true; }
const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { console.log(errors.join('\n')); failed = true; }
writeFileSync(join(dir, 'index.md'), [
  `# The capital, ${git('rev-parse --short HEAD')}`, '',
  `Playable in ${readyS.toFixed(1)} s (F4: under ${READY}); ${cap ? `${cap.id}, ${cap.buildings} buildings, ${cap.people} people; worst frame coming into the market ${rows.worst?.toFixed(0)} ms; the way in ${rows.way ? `${rows.way.L} m: worst frame ${rows.way.worst.toFixed(0)} ms, ${rows.way.slow} over 25 ms` : '–'}` : 'no capital'}; ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}.`, '',
  '| Shot | p50 ms | p95 ms | Notes |', '|---|---|---|---|',
  ...rows.map((r) => `| [${r.name}](${r.file}) | ${r.p50?.toFixed(1) ?? '–'} | ${r.p95?.toFixed(1) ?? '–'} | ${r.p50 > BUDGET ? `over ${BUDGET} ms` : r.p50 > AIM ? `over the ${AIM} ms aim` : 'ok'} |`),
  '', errors.length ? `Errors:\n\n${errors.map((e) => `- ${e}`).join('\n')}` : '',
].join('\n'));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);

/** A CPU profile of the main thread for `ms`: self time and time with callees, by function (the game's own and the libraries'). */
async function rideProfile(ms) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  await new Promise((r) => setTimeout(r, ms));
  const { profile: prof } = await cdp.send('Profiler.stop');
  await cdp.detach();
  const self = new Map(), parent = new Map(), byId = new Map(prof.nodes.map((n) => [n.id, n]));
  for (let i = 0; i < prof.samples.length; i++) self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + (prof.timeDeltas[i] ?? 0) / 1000);
  for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const name = (n) => { const f = n.callFrame; return `${f.functionName || '(anonymous)'} ${(f.url.split('/').pop() || '(native)').replace(/-[\w-]{8}\.js$/, '.js')}:${f.lineNumber + 1}`; };
  const own = new Map(), all = new Map();
  let total = 0;
  for (const [id, t] of self) {
    const n = byId.get(id);
    if (n.callFrame.functionName === '(idle)') continue;
    total += t;
    own.set(name(n), (own.get(name(n)) ?? 0) + t);
    const seen = new Set();
    for (let x = id; x !== undefined; x = parent.get(x)) { const k = name(byId.get(x)); if (!seen.has(k)) { seen.add(k); all.set(k, (all.get(k) ?? 0) + t); } }
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, t]) => `  ${t.toFixed(0).padStart(6)} ms  ${k}`).join('\n');
  console.log(`ride CPU profile, first ${ms / 1000} s: ${total.toFixed(0)} ms busy\nself time:\n${top(own, 30)}\nwith callees:\n${top(all, 40)}`);
}
