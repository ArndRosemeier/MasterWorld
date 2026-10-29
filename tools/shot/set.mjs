/**
 * The standard shot set (implementation plan F1, F2): `node tools/shot/set.mjs [out root] [--part=town|land|caves|kinds]` after `npm run build`,
 * with SHOT_GPU=1 on the reference machine (RTX 5070, webgl2, 1080p). Takes the same pictures every time (the
 * title, the creator, the town at noon, dusk, night, in rain and wet toward the afternoon sun, a cellar, a barrow, the wild, a fight, a fight with magic, a hurt traveller, a raided farm, the pack,
 * the map, the trade window, talk, a people's hold) as JPEGs into one folder per commit, `<out root>/<date>-<commit>/` (default root `shots/set`), and
 * writes the indexes there. Before each shot it waits until everything near the hero is drawn
 * as itself (`game.undrawn` empty: townsfolk dressed, creatures warm; at most SET_DRAWN ms, default 15000; it ends as soon as all are drawn) and
 * then until no shader was built for 1.5 s (at most SET_SETTLE ms, default 4000). Per shot the index has the
 * frame time (median and 95th percentile over SET_MEASURE ms, default 2000, no frame cap), the shader summary
 * (F3), the page's errors and what was not drawn; it marks a shot over 16.7 ms or more than twice as slow as
 * the town at noon (F2). Four slow checks (docs/CHECKS.md), each under 5 min: `--part=town` (the title, the town,
 * the inn) and `--part=land` (a cellar, the land, the wild, fights, a hamlet, a village, a hold, a hurt traveller and a raided farm);
 * `--part=caves` is a cave's mouth in a cliff and its cavern (L6); `--part=kinds` the downs, a moor, karst and badlands (L7);
 * without `--part` all four run, one after the other, each its own run. Each writes `index-<part>.md` and `.json`.
 * SET_ONLY=town,land takes only those sessions; SET_GL=0 draws with WebGPU instead of WebGL 2.
 * Exits 1 when a page failed or a shot breaks F2 or F3 (what was still waiting to be drawn is noted).
 */
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { drawnNear, measureFrames, shadersQuiet } from './wait.mjs';
import { hurtTraveller, meet, raidFarm, standClear } from './acts.mjs';
import { fileURLToPath } from 'node:url';

const TIMEOUT = 120000;
/** What a shot's act hands to its `last` (run after the frames are measured, just before the picture). */
const shotOf = {};
const SETTLE = Number(process.env.SET_SETTLE ?? 4000);
const MEASURE = Number(process.env.SET_MEASURE ?? 2000);
// Dressing the town's 30 characters takes about 6 s after the page is ready (two at a time, about 1 s each, some 4 s):
// a shorter limit cut the first town shot off with one still plain.
const DRAWN = Number(process.env.SET_DRAWN ?? 15000);
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
    // The pack with a legendary piece worn, its card saying the ability it gives (C5).
    { name: 'pack', act: async (p) => {
      await p.evaluate(() => { const g = window.game; g.wearLegend(g.setting.items.uniques[0].id); });
      await p.keyboard.press('KeyI');
    } },
    { name: 'map', act: async (p) => { await close(p); await p.keyboard.press('KeyM'); } },
    { name: 'town-dusk', act: async (p) => { await close(p); await turn(18.3, 'fair')(p); } },
    { name: 'town-night', act: turn(23, 'clear') },
    { name: 'town-rain', act: turn(14, 'rain') },
    // The hero 15 m from a cow in its paddock, facing it, at noon again.
    { name: 'paddock', act: async (p) => {
      await turn(12, 'clear')(p);
      await p.evaluate(() => {
        const g = window.game, a = g.herds.animals[0], x = a.x + 15, z = a.z;
        g.player.teleport(x, undefined, z, Math.atan2(x - a.x, z - a.z));
      });
    } },
    // Last, as it moves the hero to the smith's counter.
    { name: 'trade', act: async (p) => { await p.evaluate(() => window.game.tradeAt('smith')); await p.waitForTimeout(1800); } },
  ] },
  // A wet afternoon looking west into the sun: rain until half an hour ago, fair now. Haze and wet ground toward
  // a low sun once washed the whole square out to white.
  { id: 'wet', query: `${still}&hour=15&look=270,-4`, shots: [
    { name: 'town-wet-sun', act: (p) => p.evaluate(() => {
      const g = window.game, now = g.view.sky.day * 24 + g.view.sky.hour;
      g.weather.cancel(now);
      g.weather.order({ kind: 'rain', from: now - 3, to: now - 1.25 });
      g.weather.order({ kind: 'fair', from: now - 0.5, to: 1e6 });
    }) },
  ] },
  { id: 'cellar', query: `${still}&hour=12&cellar=2`, shots: [{ name: 'cellar' }] },
  // L7: out in each new kind of country (its nearest stretch from the start), at late morning.
  ...['downs', 'moor', 'karst', 'badlands'].map((k) => ({ id: `kind-${k}`, query: `${still}&hour=10.5&weather=fair&kind=${k}`, shots: [{ name: `kind-${k}` }] })),
  // L6: a cave's mouth in a cliff (D57), then inside, in the middle of its cavern (its highest room).
  { id: 'cave', query: `${still}&hour=11&weather=fair&cave`, shots: [
    { name: 'cave-mouth' },
    { name: 'cave-cavern', act: async (p) => {
      await p.evaluate(async () => {
        const g = window.game, d = g.log.find((x) => x.kind === 'dungeon' && x.template === 'cave');
        const v = d && await g.cellars.build(d.id);
        if (!v) throw new Error('no cave to go into');
        const rooms = v.cellar.graph.rooms, top = rooms.reduce((a, r) => (r.height > a.height ? r : a), rooms[0]);
        await v.enter(true, top.id);
      });
      await p.waitForTimeout(1500);
    } },
  ] },
  // Out on the land: the barrow, then the hero is moved to the deer and the wolves (a load is the dearest part).
  { id: 'land', query: `${still}&hour=10&weather=fair&barrow`, shots: [
    { name: 'barrow' },
    { name: 'wild', act: meet('deer', 25) },
    { name: 'fight', act: async (p) => { await meet('wolves', 12)(p); await p.waitForTimeout(1500); await p.keyboard.press('Tab'); await p.keyboard.press('Digit1'); } },
    // Gate C: a fight with magic. The hero learns the first spell of the first school (the debug menu's way),
    // picks a wolf and casts; the picture is taken once the spell shows.
    { name: 'fight-magic', act: async (p) => {
      // The spells' shader is built just after the start (F4): wait for it, so the spell is drawn.
      await p.waitForFunction(() => window.game.spellView.entered, null, { timeout: TIMEOUT });
      const id = await p.evaluate(() => {
        const g = window.game, setting = g.setting, h = g.character;
        const school = setting.skills.find((s) => s.group === 'magic')?.id;
        const spell = setting.abilities.find((a) => a.skill === school && (a.level ?? 0) === 0)?.id;
        if (!spell) return null;
        h.learn(spell);
        h.mana = h.maxMana;
        h.health = h.maxHealth;
        h.cooldowns.clear();
        return spell;
      });
      if (!id) throw new Error('fight-magic: no spell in the setting');
      await p.keyboard.press('Tab');
      const why = await p.evaluate((id) => window.game.useAbility(id), id);
      if (why) throw new Error(`fight-magic: ${id}: ${why}`);
      // In flight (a dart, a shard, a lance) or bursting at the wolf; the cast's own glow is not yet the spell.
      await p.waitForFunction(() => window.game.spellView.shown.shots > 0, null, { timeout: 20000 });
      // Held still while the set waits for the shaders and measures (the last shot of its page): else it is gone.
      await p.evaluate(() => { window.game.spellView.frozen = true; });
    } },
  ] },
  { id: 'inn', query: `${still}&hour=20&room=inn`, shots: [{ name: 'inn' }] },
  { id: 'talk', query: `${still}&hour=20&talk=inn&topics=news`, shots: [{ name: 'talk' }] },
  // Out on the land (gate B): a hamlet the VGM opened, then halfway along the longest road, looking along it.
  { id: 'hamlet', query: `${still}&hour=11&weather=fair&site=hamlet`, shots: [
    { name: 'hamlet' },
    { name: 'road', act: (p) => p.evaluate(() => {
      const g = window.game, roads = g.terrain.roads.roads;
      const r = roads.reduce((a, b) => (b.pts.length > a.pts.length ? b : a));
      const i = Math.floor(r.pts.length / 6) * 3, x = r.pts[i], z = r.pts[i + 2], nx = r.pts[i + 3], nz = r.pts[i + 5];
      g.player.teleport(x, undefined, z, Math.atan2(nx - x, nz - z) + Math.PI);
    }) },
  ] },
  { id: 'village', query: `${still}&hour=16&weather=fair&site=village`, shots: [{ name: 'village' }] },
  // The dwarves' hold (plan 11.6): before its gate as a stranger, the wardens calling out.
  // Then from the court's far corner across to the crag it is cut into (clear of the woods), and up to a carved warden.
  { id: 'hold', query: `${still}&hour=15&weather=fair&hold=stranger`, shots: [
    { name: 'hold' },
    { name: 'hold-crag', act: atHold(10, 21, -14, -2) },
    { name: 'hold-warden', act: atHold(3, 10, 7.6, 4) },
  ] },
  // Gate C: what phase C gave the world, seen. A hurt traveller by the way (they cry out once seen), then a
  // farm the bandits raided: its barn burnt, smoke over it, its paddock empty.
  { id: 'situations', query: `${still}&hour=10&weather=fair`, shots: [
    { name: 'hurt-traveller', act: async (p) => {
      const h = await hurtTraveller(p);
      if (!h) throw new Error('hurt-traveller: none was made');
      // Measured from 40 m (out of the reach of their cry): they cry out once, and the bubble lasts seconds.
      await standClear(p, h, 40, { zoom: 3.2, pitch: -0.3, side: 0.5 });
      await p.waitForTimeout(1500);
      shotOf.hurt = h;
    },
    // Then up to them for the picture: they see the hero and cry out.
    last: async (p) => {
      await standClear(p, shotOf.hurt, 5, { zoom: 3.2, pitch: -0.3, side: 0.5 });
      await p.waitForFunction(() => !!window.game.speech.line, null, { timeout: 5000 }).catch(() => console.log('hurt-traveller: NO CRY'));
      await p.waitForTimeout(800);
    } },
    { name: 'raided-farm', act: async (p) => {
      const { barn } = await raidFarm(p);
      if (!barn) throw new Error('raided-farm: no farm was raided');
      await p.waitForFunction(() => !!window.game.smoke.mesh.parent, null, { timeout: TIMEOUT });
      await standClear(p, barn, 24, { pitch: 0.2, zoom: 5, side: 0.25, avoid: barn.avoid });
      await p.waitForTimeout(4000);
    } },
  ] },
];
/** The sessions of each part (each part one run, under 5 min). */
const TOWN_PART = new Set(['title', 'town', 'wet', 'inn', 'talk']), CAVE_PART = new Set(['cave']);
const partOf = (s) => (TOWN_PART.has(s.id) ? 'town' : CAVE_PART.has(s.id) ? 'caves' : s.id.startsWith('kind-') ? 'kinds' : 'land');

/** Puts the hero at (u, v) of the hold's gate frame (out of the gate is +v), looking at (lu, lv). */
function atHold(u, v, lu, lv) {
  return (p) => p.evaluate(([u, v, lu, lv]) => {
    const g = window.game, s = g.hold.site, c = Math.cos(s.yaw), n = Math.sin(s.yaw);
    const du = lu - u, dv = lv - v;
    g.player.teleport(s.x + u * c + v * n, undefined, s.z - u * n + v * c, Math.atan2(du * c + dv * n, -du * n + dv * c) + Math.PI);
  }, [u, v, lu, lv]);
}

const args = process.argv.slice(2), part = args.find((a) => a.startsWith('--part='))?.slice(7) ?? null;
const root = args.find((a) => !a.startsWith('--')) ?? 'shots/set';
// Both parts: each its own run (its own browser, its own time), one after the other.
if (!part) {
  let bad = false;
  for (const p of ['town', 'land', 'caves', 'kinds']) {
    try { execFileSync(process.execPath, [fileURLToPath(import.meta.url), root, `--part=${p}`], { stdio: 'inherit' }); } catch { bad = true; }
  }
  process.exit(bad ? 1 : 0);
}
const only = process.env.SET_ONLY?.split(',');
const sessions = SESSIONS.filter((s) => partOf(s) === part && (!only || only.includes(s.id)));
/** Each shot's number in the whole set, so the two parts' pictures sort as one. */
const ordinal = new Map(SESSIONS.flatMap((s) => s.shots.map((x) => x.name)).map((n, i) => [n, i + 1]));
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const commit = git('rev-parse --short HEAD') || 'nocommit';
const dirty = git('status --porcelain --untracked-files=no') ? '-dirty' : '';
const date = new Date().toISOString().slice(0, 10);
const dir = join(root, `${date}-${commit}${dirty}`);
mkdirSync(dir, { recursive: true });

// No frame cap: with vsync a GPU frame shows as the screen's 16.7 ms however little it costs.
const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const t0 = Date.now();
const rows = [];
let failed = false, gpuName = '';

for (const s of sessions) {
  const errors = [];
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }); // its own, as a player's first visit
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => { failed = true; errors.push(`page error: ${e.message}`); console.error(`[page error] ${e.stack ?? e.message}`); });
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
    const d0 = Date.now(), missing = await drawnNear(page, DRAWN), drawnS = (Date.now() - d0) / 1000;
    const settled = await shadersQuiet(page, SETTLE);
    const ft = await measureFrames(page, MEASURE);
    if (shot.last) await shot.last(page);
    const file = `${String(ordinal.get(shot.name)).padStart(2, '0')}-${shot.name}.jpg`;
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
const townIndex = join(dir, 'index-town.json');
const noon = rows.find((r) => r.name === 'town-noon')?.p50 ?? (existsSync(townIndex) ? JSON.parse(readFileSync(townIndex, 'utf8')).shots.find((r) => r.name === 'town-noon')?.p50 : undefined);
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
writeFileSync(join(dir, `index-${part}.json`), JSON.stringify({ ...meta, part, shots: rows }, null, 2));
const md = [
  `# Standard shots ${date} · ${commit}${dirty} · ${part}`,
  '',
  `${gpuName || 'unknown GPU'} · ${gl ? 'WebGL 2' : 'WebGPU'} · 1920×1080 · frame times over ${MEASURE / 1000} s once no shader was built for 1.5 s (at most ${SETTLE / 1000} s), no frame cap · run took ${seconds.toFixed(0)} s`,
  '',
  '| Shot | p50 ms | p95 ms | Settled s | Shaders (warm-up + later, worst) | Notes |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| [${r.name}](${r.file}) | ${r.p50.toFixed(1)} | ${r.p95.toFixed(1)} | ${r.settledS.toFixed(1)} | ${r.shaders ? `${r.shaders.warmup} + ${r.shaders.run}, ${r.shaders.worstMs.toFixed(0)} ms` : '–'} | ${r.marks.join('; ') || 'ok'} |`),
  '',
  ...rows.filter((r) => r.errors.length || r.shaders?.lines.length).flatMap((r) => [`## ${r.name}`, '', ...[...(r.shaders?.lines ?? []), ...r.errors].map((l) => `- ${l}`), '']),
].join('\n');
writeFileSync(join(dir, `index-${part}.md`), md);
console.log(`${part}: ${rows.length} shots in ${dir} (${seconds.toFixed(0)} s)${seconds > 300 ? ' · over the 5 min slow-check limit' : ''}`);
process.exit(failed ? 1 : 0);
