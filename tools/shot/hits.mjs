/**
 * Hit reactions (render/jolt.ts): `node tools/shot/hits.mjs [out dir]` after `npm run packs` and `npm run build`,
 * SHOT_GPU=1 on the reference machine. For each kind of foe (wolves, boars and bandits out on the land; goblins,
 * rats, smugglers and spiders in the town's cellar) the hero is put 2.5 m from the nearest one, facing it; then
 * the game runs ten times slower (`params.slow`), the foe and the hero are each struck once, and a strip of
 * pictures follows the blow (before, then about 0.04, 0.1, 0.2, 0.35 and 0.6 game seconds after). Last, a plain
 * fight with the wolves at full speed for a few seconds: no page errors, and the hero is hurt at least once.
 * JPEGs into `<out dir>` (default `shots/hits/<date>-<commit>/`). A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';
import { FIGHT, faceNearest, meet } from './acts.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const SLOW = 10;
const AFTER = [0.04, 0.1, 0.2, 0.35, 0.6];
const gl = process.env.SET_GL !== '0';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/hits', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const SCENES = [
  { id: 'wolves', query: '&hour=10&weather=fair', wild: 'wolves' },
  { id: 'boar', query: '&hour=10&weather=fair', wild: 'boar' },
  { id: 'bandits', query: '&hour=10&weather=fair', wild: 'bandits' },
  { id: 'goblins', query: '&hour=12&cellar=2&dweller=goblins' },
  { id: 'rats', query: '&hour=12&cellar=2&dweller=rats' },
  { id: 'smugglers', query: '&hour=12&cellar=2&dweller=smugglers' },
  { id: 'spiders', query: '&hour=12&cellar=2&dweller=spiders' },
];
const only = process.env.HITS_ONLY?.split(',');

const { server, base, browser } = await launch({});
const errors = [];
let failed = false;

for (const s of SCENES.filter((x) => !only || only.includes(x.id))) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`${s.id}: ${e.message}`));
  await page.goto(`${base}?title=0&day=0&weather=fair${gl ? '&gl' : ''}${s.query}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  if (s.wild) {
    const there = await page.evaluate((k) => !!window.game.wild?.territories.some((t) => t.kind === k), s.wild);
    if (!there) { console.log(`${s.id}: none on this land`); await page.close(); continue; }
    await meet(s.wild, 9)(page);
  }
  const ok = await page.waitForFunction(`!!${FIGHT}`, null, { timeout: 30000 }).then(() => true, () => false);
  if (!ok) { console.log(`${s.id}: no fight found`); failed = true; await page.close(); continue; }
  // The hero 2.5 m from the nearest one, facing it.
  await faceNearest(page, 2.5);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(dir, `${s.id}-0-before.jpg`), type: 'jpeg', quality: 85 });
  const t0 = await page.evaluate(`(() => {
    const g = window.game, f = ${FIGHT}, O = f.spellFrame().offset, c = window.__hitWho, p = g.player.walker.pos;
    g.params.slow = ${SLOW};
    g.character.health = g.character.maxHealth;
    f.delve.den.wound(c, { outcome: 'hit', damage: 1 }, { x: p.x - O.x, y: p.y - O.y, z: p.z - O.z });
    g.player.hero?.struck(p.x - c.x - O.x, p.z - c.z - O.z, 1);
    return performance.now();
  })()`);
  for (const [i, at] of AFTER.entries()) {
    const wait = t0 + at * SLOW * 1000 - (await page.evaluate(() => performance.now()));
    if (wait > 0) await page.waitForTimeout(wait);
    const shot = await page.evaluate(() => performance.now());
    await page.screenshot({ path: join(dir, `${s.id}-${i + 1}-${at}s.jpg`), type: 'jpeg', quality: 85 });
    console.log(`${s.id}: ${at}s after the blow (shot at ${((shot - t0) / 1000 / SLOW).toFixed(2)}s)`);
  }
  await page.close();
}

// A plain fight at full speed: blows both ways, no page errors.
if (!only || only.includes('fight')) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(`fight: ${e.message}`));
  await page.goto(`${base}?title=0&day=0&hour=10&weather=fair${gl ? '&gl' : ''}`);
  await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
  await page.addStyleTag({ content: '#loading{display:none!important}' });
  await meet('wolves', 6)(page);
  await page.waitForTimeout(1000);
  const health = await page.evaluate(() => { const h = window.game.character; h.health = h.maxHealth * 3; return h.health; });
  await page.keyboard.press('Tab');
  for (let i = 0; i < 8; i++) { await page.keyboard.press('Digit1'); await page.waitForTimeout(700); }
  await page.screenshot({ path: join(dir, 'fight.jpg'), type: 'jpeg', quality: 85 });
  const after = await page.evaluate(() => window.game.character.health);
  console.log(`fight: hero health ${health} -> ${after}`);
  if (!(after < health)) { console.log('fight: the hero was never struck'); failed = true; }
  await page.close();
}

for (const e of errors) console.log(`page error: ${e}`);
await browser.close();
await server.close();
console.log(`pictures in ${dir}`);
if (failed || errors.length) process.exit(1);
