/**
 * The capital (C15, F2, F4): `node tools/shot/capital.mjs [out dir]` after `npm run build` (and `npm run packs`),
 * on the reference machine, muted (launch.mjs). One page, started before the capital (`site=capital`: the walk out
 * the VGM would open as the hero goes): the time until it is playable (F4), then the hero walks into its market
 * (the worst frame on the way in: building its people), the market at noon with its frame time (F2: under
 * 16.7 ms, aiming for 12), a gate in the wall from outside, and the seat of rule. JPEGs and `index.md` into
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
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/capital', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

// No frame cap: with vsync a GPU frame shows as the screen's 16.7 ms however little it costs.
const { server, base, browser } = await launch({ args: ['--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(`${base}?title=0&day=0&hour=12&weather=fair&site=capital${gl ? '&gl' : ''}`);
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
  return { id: t.town.decision.id, market: { x: x / n, z: z / n }, seat: seat && { x: seat.cx, z: seat.cz, r: Math.max(seat.hu, seat.hv) }, gates: p.wall?.gates ?? [], buildings: p.buildings.length, people: t.life.agents.length };
}, null, { timeout: TIMEOUT, polling: 500 }).then((h) => h.jsonValue(), () => null);
if (!cap) { console.log('no capital'); failed = true; }
else {
  console.log(`${cap.id}: ${cap.buildings} buildings, ${cap.people} people, ${cap.gates.length} gates; playable in ${readyS.toFixed(1)} s`);
  // Before a gate, outside, looking in through it.
  const g = cap.gates[0];
  await settle();
  // Out along its road (away from the market), looking back in through the gateway.
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
}
if (readyS > READY) { console.log(`F4: playable in ${readyS.toFixed(1)} s, over ${READY} s`); failed = true; }
const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { console.log(errors.join('\n')); failed = true; }
writeFileSync(join(dir, 'index.md'), [
  `# The capital, ${git('rev-parse --short HEAD')}`, '',
  `Playable in ${readyS.toFixed(1)} s (F4: under ${READY}); ${cap ? `${cap.id}, ${cap.buildings} buildings, ${cap.people} people; worst frame coming into the market ${rows.worst?.toFixed(0)} ms` : 'no capital'}; ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}.`, '',
  '| Shot | p50 ms | p95 ms | Notes |', '|---|---|---|---|',
  ...rows.map((r) => `| [${r.name}](${r.file}) | ${r.p50?.toFixed(1) ?? '–'} | ${r.p95?.toFixed(1) ?? '–'} | ${r.p50 > BUDGET ? `over ${BUDGET} ms` : r.p50 > AIM ? `over the ${AIM} ms aim` : 'ok'} |`),
  '', errors.length ? `Errors:\n\n${errors.map((e) => `- ${e}`).join('\n')}` : '',
].join('\n'));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
