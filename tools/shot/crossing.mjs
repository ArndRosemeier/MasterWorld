/**
 * Passing through a portal (show, don't tell): `node tools/shot/crossing.mjs [out dir]` after `npm run build` and
 * `npm run packs`, SHOT_GPU=1 on the reference machine (WebGPU, the game's default). The `portal` start opens a pair 6 m ahead
 * of the hero (the second 30 m off); the hero walks through. Checks: the crossing counts, the sound `portal/cross` is
 * played once (the engine's `play` is watched), the glow starts and is over within its time, no shader is built in play
 * (no VIOLATION), no page errors, no GPU validation errors. JPEGs of the glow as it rises, climbs and fades go into
 * `<out dir>` (default `shots/crossing/<date>-<commit>/`). A slow check (docs/CHECKS.md).
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 180000);
const gl = process.env.SET_GL ? process.env.SET_GL !== '0' : !process.env.SHOT_GPU;
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/crossing', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack ?? ''}`));
const gpu = new Set();
page.on('console', (m) => { const t = m.text(); if (/GPUValidationError|Invalid CommandBuffer/.test(t)) gpu.add(t.slice(0, 300)); });
await page.goto(`${base}?title=0&day=0&hour=${process.env.CROSS_HOUR ?? 17}&weather=fair&hud&portal${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
await page.waitForTimeout(3000);

let failed = false;
const fail = (line) => { failed = true; console.log(`FAIL ${line}`); };
const shoot = async (name) => {
  const file = join(dir, `${name}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 88, timeout: TIMEOUT });
  console.log(file);
};

// Watch the sound engine.
await page.evaluate(() => {
  const e = window.game.sounds?.host?.engine;
  window.__plays = [];
  if (!e) return;
  const play = e.play.bind(e);
  e.play = (id, o) => { window.__plays.push(id); return play(id, o); };
});
const before = await page.evaluate(() => window.game.portals.passed);
await page.evaluate(() => { const p = window.game.player; p.heroCam.yaw = p.walker.yaw; p.heroCam.pitch = -0.12; p.heroCam.zoom = 3.2; });
await page.keyboard.down('KeyW');
await page.waitForFunction((n) => window.game.portals.passed > n, before, { timeout: 15000 }).catch(() => fail('the hero did not go through'));
await page.keyboard.up('KeyW');
// The glow as it rises, climbs and fades.
const t0 = Date.now();
let k = 0;
for (const at of [60, 250, 500, 800, 1200]) {
  await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
  const on = await page.evaluate(() => window.game.crossingFx.glowing);
  await shoot(`${++k}-glow-${at}ms`);
  console.log(`  ${at} ms: glowing ${on}`);
  if (at === 60 && !on) fail('no glow just after the crossing');
}
await page.waitForTimeout(1200);
if (await page.evaluate(() => window.game.crossingFx.glowing)) fail('the glow did not end');
await shoot(`${++k}-after`);
const plays = await page.evaluate(() => window.__plays.filter((id) => id === 'portal/cross').length);
console.log('crossings', await page.evaluate(() => window.game.portals.passed), 'sounds', plays);
if (plays !== 1) fail(`portal/cross played ${plays} times, not once`);
const report = await page.evaluate(() => window.game.view.stage.hudLine?.() ?? '');
console.log(report);
if (/VIOLATION/.test(report)) fail(report);
for (const e of errors) fail(`page error: ${e}`);
for (const e of gpu) fail(`GPU: ${e}`);
await browser.close();
await server.close();
console.log(failed ? 'crossing: FAILED' : 'crossing: ok');
process.exit(failed ? 1 : 0);
