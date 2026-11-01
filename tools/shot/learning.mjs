/**
 * Ability points (G6, D61): `node tools/shot/learning.mjs [out dir]` after `npm run build` (and `npm run packs`),
 * SHOT_GPU=1 on the reference machine, muted (launch.mjs). One page: a level-3 hero with points free at the
 * hedge witch's lessons (the window's foot shows them); with none free, the witch says so and the row says
 * "no point free"; the ability book's foot; then a potion of learning in the pack, drunk: the pack closes, the
 * hero drinks, and the ward-blue light winds up to the brow. JPEGs into `<out dir>` (default
 * `shots/learning/<date>-<commit>/`). Fails if the points do not show, the refusal is not said, or the potion
 * gave no point. A slow check (docs/CHECKS.md), well under 5 min.
 */
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './launch.mjs';

const TIMEOUT = Number(process.env.SHOT_TIMEOUT ?? 120000);
const gl = process.env.SET_GL === '1';
const git = (cmd) => { try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); } catch { return ''; } };
const dir = process.argv[2] ?? join('shots/learning', `${new Date().toISOString().slice(0, 10)}-${git('rev-parse --short HEAD') || 'nocommit'}`);
mkdirSync(dir, { recursive: true });

const { server, base, browser } = await launch({});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${base}?title=0&day=0&hour=11&weather=fair${gl ? '&gl' : ''}`);
await page.waitForFunction(() => window.__mwReady === true, null, { timeout: TIMEOUT });
await page.addStyleTag({ content: '#loading{display:none!important}' });
const shoot = async (name) => { const file = join(dir, `${name}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 90, timeout: TIMEOUT }); console.log(file); };
const fail = (why) => { console.log(`FAIL: ${why}`); failed = true; };
let failed = false;
const footText = () => page.evaluate(() => document.querySelector('.panel.lessons .foot .points, .panel.book .foot .points')?.textContent ?? '');

// A hero of level 3 (three points, D61) with coin, before the hedge witch.
const met = await page.evaluate(() => {
  const g = window.game, t = g.towns.every[0], c = g.character;
  c.gain(Math.max(0, g.setting.growth.xp[2] - c.xp));
  c.coins = 2000;
  const a = t.life.agents.find((x) => x.person.trade === 'hedge-witch');
  if (!a) return null;
  g.player.teleport(a.x + 1.6, undefined, a.z, Math.PI / 2);
  g.services.get('lessons')(a);
  return { points: c.points, level: c.level };
});
if (!met) fail('no hedge witch in the start town');
else {
  console.log(`level ${met.level}, ${met.points} points`);
  await page.waitForTimeout(1500);
  const shown = await footText();
  console.log(`lessons foot: ${shown}`);
  if (!shown.includes(String(met.points))) fail('the lessons window does not show the points');
  await shoot('01-lessons-points');
  // No point free: a lesson the hero could otherwise take is refused, and the row says why.
  await page.evaluate(() => { window.game.character.points = 0; });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.evaluate(() => { const g = window.game, a = g.towns.every[0].life.agents.find((x) => x.person.trade === 'hedge-witch'); g.services.get('lessons')(a); });
  await page.waitForTimeout(900);
  const row = page.locator('.panel.lessons .lesson:not(.done)').filter({ hasText: 'no point free' }).first();
  if (!(await row.count())) fail('no row says "no point free"');
  else await row.click();
  await page.waitForTimeout(800);
  const says = await page.evaluate(() => document.querySelector('.panel.lessons .says')?.textContent ?? '');
  console.log(`witch says: ${says}`);
  if (!says.includes('Grow a little')) fail('the refusal is not said');
  await shoot('02-lessons-no-point');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // The ability book shows the points too.
  await page.evaluate(() => { window.game.character.points = 2; });
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(1200);
  console.log(`book foot: ${await footText()}`);
  await shoot('03-book-points');
  await page.keyboard.press('Escape');
}

// A potion of learning in the pack, out in the open; the camera before the hero.
await page.evaluate(() => {
  const g = window.game, c = g.character, d = g.setting.items.items.find((x) => x.id === 'learning-potion');
  c.pack.push({ def: d.id, rarity: 'common', name: d.name, bonuses: {}, lore: d.lore });
  const s = g.towns.every[0].town.decision;
  g.player.teleport(s.x + 4, undefined, s.z + 4, Math.PI * 0.25);
});
await page.waitForTimeout(3000);
await page.keyboard.press('KeyI');
await page.waitForTimeout(1500);
await shoot('04-pack-potion');
await page.evaluate(() => { const cam = window.game.player.heroCam; cam.yaw = window.game.player.walker.yaw + Math.PI * 0.85; cam.pitch = -0.04; cam.zoom = 2.6; });
const before = await page.evaluate(() => window.game.character.points);
const card = page.locator('.panel.pack .use').filter({ hasText: 'Potion of learning' }).first();
if (!(await card.count())) fail('the potion is not in the pack window');
else {
  await card.click();
  await page.waitForTimeout(500);
  await shoot('05-drinking');
  await page.waitForTimeout(900);
  await shoot('06-light-rising');
  await page.waitForTimeout(800);
  await shoot('07-light-at-brow');
  const after = await page.evaluate(() => window.game.character.points);
  console.log(`points ${before} -> ${after}`);
  if (after !== before + 1) fail('the potion gave no point');
}

const sh = await page.evaluate(() => { const m = window.shaders; return m ? m.summary() : null; });
console.log(`F3: ${sh ? `${sh.violations} shader violations` : 'no shader monitor'}`);
if (sh?.violations) failed = true;
if (errors.length) { console.log(errors.join('\n')); failed = true; }
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
